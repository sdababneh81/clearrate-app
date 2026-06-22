/**
 * ClearRate — Claude API PDF Parser
 * Two-step parse: (1) extract rate table + LLPA grid, (2) apply adjustments
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
  "address": "string - CURRENT ADDRESS from credit report, formatted as: street, city, state zip.",
  "ficoScores": { "transunion": number|null, "equifax": number|null, "experian": number|null },
  "mortgage": {
    "lender": "string", "balance": number, "originalAmount": number|null,
    "payment": number|null, "rate": number|null, "opened": "string",
    "monthsRemaining": number|null, "originalTermMonths": number|null
  },
  "tradelines": [
    { "name": "string", "balance": number, "payment": number,
      "type": "Revolving|Auto|Student Loan|Installment|Other",
      "limit": number|null, "rate": number|null, "status": "open|closed|inactive", "monthsRemaining": number|null }
  ]
}

Rules: only open tradelines balance>0 payment>0, skip mortgage (put in mortgage field), deduplicate cross-bureau, middle FICO score.`
      }
    ];
  } else {
    const text = await file.text();
    content = [{ type: 'text', text: `Extract tradelines from this credit report. Return ONLY valid JSON:\n{"borrowerName":"","address":"","ficoScores":{"transunion":null,"equifax":null,"experian":null},"mortgage":{"lender":"","balance":0,"originalAmount":null,"payment":null,"rate":null,"opened":"","monthsRemaining":null,"originalTermMonths":null},"tradelines":[{"name":"","balance":0,"payment":0,"type":"Revolving","limit":null,"rate":null,"status":"open","monthsRemaining":null}]}\n\nOnly open accounts balance>0. Skip mortgage. Deduplicate.\n\n${text.substring(0, 15000)}` }];
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY');

  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content }] })
  });

  if (!response.ok) throw new Error(`API error ${response.status}: ${(await response.text()).substring(0, 200)}`);
  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); }
  catch (e) { throw new Error('Could not parse credit report. Raw: ' + raw.substring(0, 300)); }
}

/**
 * Parse rate sheet PDF in two calls:
 * Call 1: Extract raw base prices (no LLPA) + the full LLPA adjustment grid
 * Call 2: Apply the right LLPA hits for this borrower and build final prices
 */
export async function parseRateSheet(file, clientProfile, adminMargins = {}) {
  const { ficoScore, ltv, loanType, purpose, currentRate, estimatedValue, currentBalance, cashOutAmount } = clientProfile || {};

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY');

  let pdfContent = null;
  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    pdfContent = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }

  // ── CALL 1: Extract base prices AND LLPA grid from PDF ─────────────────────
  console.log('[Parser] Step 1: Extracting base rates and LLPA grid...');

  const call1Content = pdfContent
    ? [
        pdfContent,
        {
          type: 'text',
          text: `Extract two things from this UWM rate sheet PDF:

1. BASE RATE PRICES — the raw 30-day lock prices BEFORE any LLPA adjustments
2. LLPA ADJUSTMENT GRID — all the pricing hit tables (credit score, LTV, cash-out, loan type, etc.)

Return ONLY valid JSON, no markdown, no explanation:

{
  "effectiveDate": "string or empty",
  "programs": [
    {
      "type": "VA|Conventional|FHA",
      "isARM": false,
      "armType": null,
      "term": 30,
      "rates": [
        { "rate": 6.500, "basePoints": -0.250 }
      ]
    }
  ],
  "llpaGrid": {
    "creditScore": [
      { "min": 740, "max": 759, "adjustments": { "ltv_60": 0.000, "ltv_65": 0.000, "ltv_70": 0.250, "ltv_75": 0.250, "ltv_80": 0.500, "ltv_85": 0.500, "ltv_90": 0.750, "ltv_95": 0.750, "ltv_97": 0.750 } }
    ],
    "cashOut": [
      { "ltv_min": 0, "ltv_max": 60, "hit": 0.000 },
      { "ltv_min": 60.01, "ltv_max": 70, "hit": 0.500 },
      { "ltv_min": 70.01, "ltv_max": 75, "hit": 0.750 },
      { "ltv_min": 75.01, "ltv_max": 80, "hit": 1.500 }
    ],
    "otherHits": [
      { "description": "Investment Property", "hit": 1.750 },
      { "description": "2-unit property", "hit": 1.000 }
    ]
  }
}

Rules:
- basePoints: the raw price from the rate table, negative = credit, positive = cost
- Include ALL rates for each program
- For the LLPA grid, extract every adjustment table you can find
- If a table doesn't exist in the PDF, omit that key
- For VA loans, note if there are separate grids`
        }
      ]
    : [{ type: 'text', text: `Extract base rates and LLPA grid from this rate sheet. Return JSON with programs[{type,isARM,armType,term,rates[{rate,basePoints}]}] and llpaGrid{creditScore,cashOut,otherHits}. ${(await file.text()).substring(0, 15000)}` }];

  const r1 = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 6000, messages: [{ role: 'user', content: call1Content }] })
  });

  if (!r1.ok) throw new Error(`Rate sheet API error ${r1.status}: ${(await r1.text()).substring(0, 200)}`);
  const d1 = await r1.json();
  const raw1 = d1.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  let extracted;
  try { extracted = JSON.parse(raw1); }
  catch (e) { throw new Error('Could not parse rate sheet step 1. Raw: ' + raw1.substring(0, 400)); }

  console.log('[Parser] Step 1 done:', {
    programs: extracted.programs?.length,
    hasLLPA: !!extracted.llpaGrid,
    llpaKeys: Object.keys(extracted.llpaGrid || {}),
  });

  // ── CALL 2: Apply LLPA hits for THIS specific borrower ─────────────────────
  const computedLTV = (ltv !== undefined && ltv !== null)
    ? parseFloat(ltv)
    : (estimatedValue && currentBalance)
      ? Math.round((parseFloat(currentBalance) / parseFloat(estimatedValue)) * 1000) / 10
      : null;

  const isCashOut = purpose?.toLowerCase().includes('cash') || parseFloat(cashOutAmount) > 0;

  console.log('[Parser] Step 2: Applying LLPAs for borrower:', {
    ficoScore, ltv: computedLTV, loanType, isCashOut
  });

  const borrowerDesc = `
Borrower profile:
- FICO score: ${ficoScore || 'unknown'}
- LTV: ${computedLTV !== null ? computedLTV + '%' : 'unknown'}
- Loan type: ${loanType || 'Conventional'}
- Purpose: ${isCashOut ? 'Cash-Out Refinance' : 'Rate/Term Refinance'}
- Property: Single Family Residence, Primary Residence
`;

  const call2Content = [
    {
      type: 'text',
      text: `You have a UWM rate sheet with base prices and LLPA adjustment grids.

Here is the extracted rate sheet data:
${JSON.stringify(extracted, null, 2)}

${borrowerDesc}

Calculate the FINAL net price for each rate by applying ALL applicable LLPA hits for this borrower.

Return ONLY valid JSON, no markdown:

{
  "effectiveDate": "string",
  "borrowerLLPAs": [
    { "description": "Credit Score 680-699 / LTV 54%", "hit": 0.250 },
    { "description": "Cash-Out Refinance / LTV ≤60%", "hit": 0.000 }
  ],
  "totalLLPAHit": 0.250,
  "programs": [
    {
      "type": "VA",
      "isARM": false,
      "armType": null,
      "term": 30,
      "rates": [
        {
          "rate": 6.500,
          "basePoints": -1.500,
          "llpaHit": 0.250,
          "netPoints": -1.250
        }
      ]
    }
  ]
}

Rules:
- basePoints: from the rate sheet (before LLPA)
- llpaHit: sum of all applicable adjustments for this borrower (positive = cost)
- netPoints: basePoints + llpaHit (this is what the borrower effectively pays/receives)
- Apply EVERY applicable hit: credit score + LTV combination, cash-out, property type, etc.
- If VA loan, apply VA-specific grids if present
- List each hit separately in borrowerLLPAs so the LO can see exactly what was applied`
    }
  ];

  const r2 = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 6000, messages: [{ role: 'user', content: call2Content }] })
  });

  if (!r2.ok) throw new Error(`Rate sheet LLPA apply error ${r2.status}: ${(await r2.text()).substring(0, 200)}`);
  const d2 = await r2.json();
  const raw2 = d2.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();

  let final;
  try { final = JSON.parse(raw2); }
  catch (e) { throw new Error('Could not parse rate sheet step 2. Raw: ' + raw2.substring(0, 400)); }

  console.log('[Parser] Step 2 done:', {
    programs: final.programs?.length,
    totalLLPAHit: final.totalLLPAHit,
    llpaHits: final.borrowerLLPAs,
  });

  // Normalize output to match what scenarioEngine expects
  return {
    programs: (final.programs || []).map(p => ({
      ...p,
      rates: (p.rates || []).map(r => ({
        rate: parseFloat(r.rate),
        netPoints: parseFloat(r.netPoints ?? r.basePoints),
        basePoints: parseFloat(r.basePoints),
        llpaHit: parseFloat(r.llpaHit || 0),
        adjustedRate: parseFloat(r.rate),
      })).filter(r => !isNaN(r.rate) && !isNaN(r.netPoints)),
    })).filter(p => p.rates.length > 0),
    effectiveDate: final.effectiveDate || extracted.effectiveDate || '',
    borrowerLLPAs: final.borrowerLLPAs || [],
    totalLLPAHit: final.totalLLPAHit || 0,
    llpasApplied: (final.borrowerLLPAs || []).map(h => h.description),
  };
}
