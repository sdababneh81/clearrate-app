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
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 }
      },
      {
        type: 'text',
        text: `Extract all tradelines from this mortgage credit report. Return ONLY valid JSON, no markdown, no explanation.

Return this exact structure:
{
  "borrowerName": "string",
  "ficoScores": { "transunion": number|null, "equifax": number|null, "experian": number|null },
  "mortgage": { "lender": "string", "balance": number, "payment": number, "rate": number|null, "opened": "string" } or null,
  "tradelines": [
    { "name": "string", "balance": number, "payment": number, "type": "Revolving|Auto|Student Loan|Installment|Other", "limit": number|null, "rate": number|null, "status": "open|closed|inactive", "monthsRemaining": number|null }
  ]
}

Rules:
- Only include open accounts with balance > 0 and payment > 0
- Skip the mortgage (put it in the mortgage field)
- Skip closed/inactive accounts
- Deduplicate accounts that appear on multiple bureaus (same account reported twice) — keep one
- For FICO scores use the middle score or the lower of two if only two bureaus
- Payment is the minimum monthly payment
- type must be exactly one of: Revolving, Auto, Student Loan, Installment, Other`
      }
    ];
  } else {
    // text file fallback
    const text = await file.text();
    content = [{
      type: 'text',
      text: `Extract all tradelines from this mortgage credit report text. Return ONLY valid JSON, no markdown.\n\nReturn this structure:\n{"borrowerName":"string","ficoScores":{"transunion":null,"equifax":null,"experian":null},"mortgage":{"lender":"string","balance":0,"payment":0,"rate":null,"opened":""},"tradelines":[{"name":"string","balance":0,"payment":0,"type":"Revolving","limit":null,"rate":null,"status":"open","monthsRemaining":null}]}\n\nOnly open accounts with balance > 0. Skip mortgage (put in mortgage field). Deduplicate cross-bureau.\n\n${text.substring(0, 15000)}`
    }];
  }

  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Could not parse credit report response. Raw: ' + raw.substring(0, 300));
  }
}

export async function parseRateSheet(file, adminMargins = {}) {
  let content;
  const marginNote = `Admin margins to apply: FHA +${adminMargins.fha || 0.5}%, Conventional +${adminMargins.conv || 0.5}%, VA +${adminMargins.va || 0.375}%`;

  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      {
        type: 'text',
        text: `Extract mortgage rate tiers from this lender rate sheet. ${marginNote}

Return ONLY valid JSON, no markdown:
{
  "programs": [
    {
      "type": "FHA|Conventional|VA",
      "term": 30,
      "rates": [
        { "rate": number, "points": number, "credits": number, "adjustedRate": number }
      ],
      "ficoCutoffs": [number],
      "ltvAdjustments": [{ "ltv": number, "adjustment": number }]
    }
  ],
  "effectiveDate": "string"
}

Rules:
- adjustedRate = rate + admin margin for that program type
- points is cost (positive = borrower pays), credits is lender credit (positive = lender pays)
- Include at minimum 3 rate tiers per program: lowest rate, par (0 points/credits), highest credits
- If rate sheet has FICO or LTV adjustments, include them
- Only include 30-year fixed programs`
      }
    ];
  } else {
    const text = await file.text();
    content = [{
      type: 'text',
      text: `Parse this rate sheet and return JSON with programs array. ${marginNote}\n\nFormat: {"programs":[{"type":"Conventional","term":30,"rates":[{"rate":6.5,"points":0,"credits":0,"adjustedRate":7.0}],"ficoCutoffs":[],"ltvAdjustments":[]}],"effectiveDate":""}\n\n${text.substring(0, 10000)}`
    }];
  }

  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) throw new Error(`Rate sheet API error ${response.status}`);

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Could not parse rate sheet. Raw: ' + raw.substring(0, 300));
  }
}
