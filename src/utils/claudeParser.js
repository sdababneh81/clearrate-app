/**
 * ClearRate — Claude API PDF Parser
 * Sends PDF as base64 to Claude and extracts structured data
 */

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export async function parseCreditReport(file) {
  let content;

  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      {
        type: 'text',
        text: `Extract all tradelines from this mortgage credit report. Return ONLY valid JSON, no markdown, no explanation.

Return this exact structure:
{
  "borrowerName": "string",
  "address": "string - CURRENT ADDRESS from credit report, formatted as: street, city, state zip. Example: 7729 NW 21ST ST, MARGATE, FL 33063",
  "ficoScores": { "transunion": number|null, "equifax": number|null, "experian": number|null },
  "mortgage": {
    "lender": "string",
    "balance": number,
    "originalAmount": number|null,
    "payment": number|null,
    "rate": number|null,
    "opened": "string",
    "monthsRemaining": number|null,
    "originalTermMonths": number|null
  },
  "tradelines": [
    {
      "name": "string",
      "balance": number,
      "payment": number,
      "type": "Revolving|Auto|Student Loan|Installment|Other",
      "limit": number|null,
      "rate": number|null,
      "status": "open|closed|inactive",
      "monthsRemaining": number|null
    }
  ]
}

Rules:
- Only include open tradelines with balance > 0 and payment > 0
- Skip the mortgage (put it in the mortgage field)
- Skip closed/inactive accounts
- Deduplicate accounts that appear on multiple bureaus — keep one
- For FICO scores use the middle score or the lower of two if only two bureaus
- For mortgage: originalAmount is the original loan amount, monthsRemaining is how many months are left, originalTermMonths is the original term (usually 360 for 30yr)
- Payment is the minimum monthly payment
- type must be exactly one of: Revolving, Auto, Student Loan, Installment, Other
- address: use the CURRENT ADDRESS listed on the report`
      }
    ];
  } else {
    const text = await file.text();
    content = [{
      type: 'text',
      text: `Extract all tradelines from this mortgage credit report text. Return ONLY valid JSON, no markdown.\n\nReturn: {"borrowerName":"string","address":"street, city, state zip","ficoScores":{"transunion":null,"equifax":null,"experian":null},"mortgage":{"lender":"string","balance":0,"originalAmount":null,"payment":null,"rate":null,"opened":"","monthsRemaining":null,"originalTermMonths":null},"tradelines":[{"name":"string","balance":0,"payment":0,"type":"Revolving","limit":null,"rate":null,"status":"open","monthsRemaining":null}]}\n\nOnly open accounts with balance > 0. Skip mortgage (put in mortgage field). Deduplicate cross-bureau.\n\n${text.substring(0, 15000)}`
    }];
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY');

  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content }] })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('Could not parse credit report. Raw: ' + raw.substring(0, 300)); }
}

export async function parseRateSheet(file, clientProfile, adminMargins = {}) {
  // clientProfile contains FICO, LTV, loanType, purpose so we can ask Claude
  // to apply the correct LLPAs and return ADJUSTED rates for this specific borrower
  const { ficoScore, ltv, loanType, purpose } = clientProfile || {};

  let content;
  const marginNote = `Admin/broker margins: FHA +${adminMargins.fha || 0.5}%, Conventional +${adminMargins.conv || 0.5}%, VA +${adminMargins.va || 0.375}%`;
  const borrowerContext = ficoScore ? `Borrower profile: FICO ${ficoScore}, LTV ~${ltv || 'unknown'}%, loan type: ${loanType || 'VA'}, purpose: ${purpose || 'rate/term refi'}.` : '';

  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      {
        type: 'text',
        text: `You are a mortgage pricing expert. This is a wholesale lender rate sheet. ${borrowerContext} ${marginNote}

Return ONLY valid JSON. Be concise — include ONLY the 8 most relevant rate tiers per program (rates that would make sense for this borrower). No markdown, no explanation.

{"programs":[{"type":"VA","term":30,"isARM":false,"rates":[{"rate":5.5,"netPoints":-1.5,"adjustedRate":5.875},{"rate":5.75,"netPoints":-0.3,"adjustedRate":6.125},{"rate":6.0,"netPoints":0.5,"adjustedRate":6.375}]},{"type":"VA","term":30,"isARM":true,"armType":"5/6 SOFR","rates":[...]}],"effectiveDate":"18-Jun-26","llpasApplied":["FICO 680-699: +0.25","LTV 85-90: +1.00"]}

Rules:
- Use 30-day lock column
- netPoints: base price adjusted for ALL LLPAs (FICO score band, LTV band, purpose). Negative = lender credit. Positive = borrower pays points.
- adjustedRate: rate + broker margin (${marginNote})
- Apply FICO and LTV adjustments from the pricing adjustment tables
- Include VA 30yr fixed AND VA 5/6 ARM if available
- Include Conventional 30yr fixed only if better than VA
- ONLY include rates below the borrower current rate — skip anything above it
- Keep response under 2000 tokens total`
      }
    ];
  } else {
    const text = await file.text();
    content = [{ 
      type: 'text', 
      text: `Parse this rate sheet for borrower: ${borrowerContext}. Apply LLPAs and return JSON.\n\nFormat: {"programs":[{"type":"VA","term":30,"isARM":false,"armType":null,"rates":[{"rate":5.75,"basePoints":-0.3,"llpaAdjustment":0,"netPoints":-0.3,"credits":0.3,"adjustedRate":6.125,"netPriceToLender":99.7}]}],"effectiveDate":"","llpasApplied":[]}\n\n${text.substring(0, 15000)}`
    }];
  }

  const apiKey2 = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey2,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 6000, messages: [{ role: 'user', content }] })
  });

  if (!response.ok) throw new Error(`Rate sheet API error ${response.status}`);

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); }
  catch (e) { 
    // Try to extract partial JSON
    const match = raw.match(/\{[\s\S]*"programs"[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); }
      catch(e2) { throw new Error('Could not parse rate sheet. Raw: ' + raw.substring(0, 300)); }
    }
    throw new Error('Could not parse rate sheet. Raw: ' + raw.substring(0, 300)); 
  }
}
