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
  const { ficoScore, ltv, loanType, purpose, currentRate } = clientProfile || {};

  let content;
  const borrowerContext = ficoScore
    ? `Borrower: FICO ${ficoScore}, LTV ~${ltv || 'unknown'}%, loan type: ${loanType || 'Conventional'}, purpose: ${purpose || 'rate/term refi'}${currentRate ? `, current rate: ${currentRate}%` : ''}.`
    : '';

  const systemPrompt = `You are a mortgage rate sheet parser. You output ONLY valid JSON. You never explain, never use markdown, never add any text before or after the JSON object. Your entire response must be parseable by JSON.parse(). Start your response with { and end with }.`;

  const userPrompt = file.type === 'application/pdf'
    ? `This is a wholesale lender rate sheet PDF. ${borrowerContext}

Output ONLY a JSON object. No explanation. No markdown. No steps. Start with { immediately.

Required format:
{"programs":[{"type":"VA","term":30,"isARM":false,"armType":null,"rates":[{"rate":6.5,"netPoints":-1.5},{"rate":6.75,"netPoints":-0.5},{"rate":7.0,"netPoints":0.25}]},{"type":"Conventional","term":30,"isARM":false,"armType":null,"rates":[{"rate":7.0,"netPoints":-0.5}]}],"effectiveDate":"18-Jun-26","llpasApplied":["FICO 680-699 +0.25","LTV 75-80 +0.25"]}

Rules:
- type: must be "VA", "Conventional", or "FHA" only
- rate: the note rate number (e.g. 6.5)
- netPoints: base price from 30-day lock column PLUS FICO and LTV LLPA adjustments. Negative = lender credit. Positive = borrower pays points.
- Include ALL rate rows from each program — do not skip any
- Include every program visible: VA fixed, VA ARM, Conventional, FHA
- Do NOT add broker margin — raw lender pricing only
- llpasApplied: list each LLPA you applied with its value`
    : `Parse this rate sheet. ${borrowerContext} Output ONLY JSON starting with {.\n\n{"programs":[{"type":"VA","term":30,"isARM":false,"armType":null,"rates":[{"rate":6.5,"netPoints":-1.5}]}],"effectiveDate":"","llpasApplied":[]}\n\nnetPoints = lender price + LLPA adjustments. No broker margin.\n\n${(await file.text()).substring(0, 15000)}`;

  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: userPrompt }
    ];
  } else {
    content = [{ type: 'text', text: userPrompt }];
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  console.log('[ClearRate] Sending rate sheet to Claude...', { borrowerContext });

  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[ClearRate] Rate sheet API error:', response.status, errText);
    throw new Error(`Rate sheet API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').trim();

  console.log('[ClearRate] Raw Claude response length:', raw.length);
  console.log('[ClearRate] First 500 chars:', raw.substring(0, 500));

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Try to extract JSON object from response
    const match = cleaned.match(/(\{[\s\S]*"programs"[\s\S]*\})/);
    if (match) {
      try {
        parsed = JSON.parse(match[1]);
        console.warn('[ClearRate] Had to extract JSON from response — system prompt not respected');
      } catch(e2) {
        console.error('[ClearRate] JSON parse failed. Full raw response:', raw);
        throw new Error('Rate sheet parse failed. Claude returned non-JSON. See console for raw output.');
      }
    } else {
      console.error('[ClearRate] No JSON object found. Full raw response:', raw);
      throw new Error('Rate sheet parse failed — no JSON in response. See browser console for details.');
    }
  }

  // Normalize: adjustedRate = rate (engine applies user's margin, not parser)
  if (parsed.programs) {
    parsed.programs = parsed.programs.map(prog => ({
      ...prog,
      rates: (prog.rates || []).map(r => ({
        ...r,
        adjustedRate: r.rate,
      }))
    }));
  }

  console.log('[ClearRate] ✅ Rate sheet parsed successfully');
  console.log('[ClearRate] Programs:', parsed.programs?.length || 0,
    parsed.programs?.map(p => `${p.type} ${p.isARM ? p.armType || 'ARM' : '30yr fixed'} (${p.rates?.length || 0} rates)`).join(' | '));
  console.log('[ClearRate] Full parsed output:', JSON.stringify(parsed, null, 2));

  return parsed;
}
