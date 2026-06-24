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
 * Parse a rate sheet into BASE prices + the raw LLPA grid — NO borrower baked in.
 * Two focused Claude calls so neither truncates on UWM's large multi-page sheet:
 *   Call 1 — base rate tables (Conventional / VA / FHA fixed, the refi-relevant ones).
 *   Call 2 — the LLPA grids in UWM's real shape (Conventional FICO×LTV matrices by
 *            purpose; Government flat FICO adjustor + VA cash-out special).
 *
 * Returns: { effectiveDate, programs:[{type,isARM,armType,term,rates:[{rate,basePoints}]}], llpaGrid }
 */
export async function parseRateSheetBase(file) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY');

  let pdfContent = null;
  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    pdfContent = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }
  const fileText = pdfContent ? null : (await file.text()).substring(0, 18000);

  const callClaude = async (promptText, maxTokens) => {
    const content = pdfContent
      ? [pdfContent, { type: 'text', text: promptText }]
      : [{ type: 'text', text: promptText + '\n\n' + fileText }];
    const resp = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages: [{ role: 'user', content }] })
    });
    if (!resp.ok) throw new Error(`Rate sheet API error ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
    const d = await resp.json();
    const raw = d.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    return { obj: parseJsonLoose(raw), stop: d.stop_reason, raw };
  };

  // ── CALL 1: base rate tables (programs only) ──────────────────────────────
  console.log('[Parser] Call 1: base rate tables…');
  const prog = await callClaude(
`Extract the BASE RATE TABLES from this UWM rate sheet. Return ONLY valid JSON, no markdown.

Focus on these standard refinance products (IGNORE Jumbo, Non-QM, HELOC, DPA, Home Sweet Texas, Doctor, Bank Statement, DSCR/Investor Flex):

FIXED RATE:
- CONF CONV 21-30 YEAR  → type "Conventional", term 30
- CONF CONV 11-15 YEAR  → type "Conventional", term 15
- HIGH BALANCE 21-30 YEAR → type "Conventional High Balance", term 30
- VA FIXED RATE 16-30 YEAR → type "VA", term 30   (the standard one, NOT "ELITE", NOT "Jumbo")
- VA FIXED RATE 8-15 YEAR  → type "VA", term 15
- FHA FIXED RATE 16-30 YEAR → type "FHA", term 30
- FHA FIXED RATE 8-15 YEAR  → type "FHA", term 15
- ELITE 21-30 YEAR → type "Conventional Elite", term 30 (700+ FICO, ≤80% LTV, ≥$125K)
- ELITE VA FIXED RATE 16-30 YEAR → type "VA Elite", term 30
- ELITE FHA FIXED RATE 16-30 YEAR → type "FHA Elite", term 30

ARM (set isARM:true and armType to the ARM name):
- ELITE 5/6 SOFR ARM → type "Conventional Elite", armType "5/6 ARM", term 30
- ELITE 7/6 SOFR ARM → type "Conventional Elite", armType "7/6 ARM", term 30
- ELITE 10/6 SOFR ARM → type "Conventional Elite", armType "10/6 ARM", term 30
- 5/6 SOFR ARM (standard) → type "Conventional", armType "5/6 ARM", term 30
- 7/6 SOFR ARM (standard) → type "Conventional", armType "7/6 ARM", term 30
- 10/6 SOFR ARM (standard) → type "Conventional", armType "10/6 ARM", term 30
- VA 5/1 ARMs → type "VA", armType "5/1 ARM", term 30
- VA 3/1 ARMs → type "VA", armType "3/1 ARM", term 30
- FHA 5/1 ARMs → type "FHA", armType "5/1 ARM", term 30
- FHA 3/1 ARMs → type "FHA", armType "3/1 ARM", term 30

Use the 30 DAY price column for basePoints.

{
  "effectiveDate": "string",
  "programs": [
    { "type": "Conventional", "isARM": false, "armType": null, "term": 30,
      "rates": [ { "rate": 6.500, "basePoints": -0.722 } ] },
    { "type": "Conventional", "isARM": true, "armType": "5/6 ARM", "term": 30,
      "rates": [ { "rate": 6.500, "basePoints": 0.699 } ] }
  ]
}

Rules: basePoints = the 30 DAY price (negative = credit to borrower, positive = cost). Include EVERY rate row in each table. Set isARM:true ONLY for the ARM products above. Do NOT invent rows.`,
    16000);
  if (!prog.obj) {
    throw new Error((prog.stop === 'max_tokens' ? 'Base-rate response was cut off. ' : 'Could not parse base rates. ') + 'Raw: ' + prog.raw.substring(0, 400));
  }

  // ── CALL 2: LLPA grids (UWM real structure) ───────────────────────────────
  console.log('[Parser] Call 2: LLPA grids…');
  const grid = await callClaude(
`Extract ONLY the LLPA / pricing-adjustment grids from this UWM rate sheet. Return ONLY valid JSON, no markdown.

UWM has two systems:

A) CONVENTIONAL — full FICO × LTV matrices on the "CONVENTIONAL PRICING ADJUSTMENTS" page. There are separate matrices for Rate/Term Refinance and Cash/Out Refinance. Each row is a FICO band (780+, 760-779, 740-759, 720-739, 700-719, 680-699, 660-679, 640-659, 620-639). Each column is an LTV bracket.
- Rate/Term columns (10): <=30, 30.01-60, 60.01-65, 65.01-70, 70.01-75, 75.01-80, 80.01-85, 85.01-90, 90.01-95, 95.01-97
- Cash-Out columns (8): <=30, 30.01-60, 60.01-65, 65.01-70, 70.01-75, 75.01-80, 80.01-85, 85.01-89.99
- Put each row's values in a "cols" array IN COLUMN ORDER. Use the string "NA" for not-available cells.

B) GOVERNMENT (VA/FHA) — on the "GOVERNMENT PRICE ADJUSTMENTS" page there is a flat "Credit Score Adjustors" table by FICO only (e.g. 740+ = -0.500, 700-739 = -0.250, 620-639 = 0.375, 600-619 = 0.625, 580-599 = 1.000). Also capture "VA Cash-Out LTV > 90%" (e.g. 1.250).

Return exactly:
{
  "conventional": {
    "ltvBands":        [30,60,65,70,75,80,85,90,95,97],
    "cashOutLtvBands": [30,60,65,70,75,80,85,89.99],
    "rateTerm": [ { "min":780, "max":850, "cols":[0,0,0,0,0.125,0.5,0.625,0.5,0.375,0.375] } ],
    "cashOut":  [ { "min":780, "max":850, "cols":[0.375,0.375,0.625,0.625,0.875,1.375,1.625,1.875] } ]
  },
  "government": {
    "fico": [ {"min":740,"max":850,"hit":-0.5}, {"min":700,"max":739,"hit":-0.25}, {"min":640,"max":699,"hit":0}, {"min":620,"max":639,"hit":0.375}, {"min":600,"max":619,"hit":0.625}, {"min":580,"max":599,"hit":1.0} ],
    "vaCashOutOver90": 1.25
  }
}

Rules: transcribe values EXACTLY as printed. "cols" length must match the band count (10 for rateTerm, 8 for cashOut). Use "NA" (string) for blank/NA cells. Do NOT invent values; if a matrix is missing, return it as an empty array.`,
    8000);
  if (!grid.obj) {
    console.warn('[Parser] LLPA grid call failed to parse; storing base rates without grid. Raw:', grid.raw.substring(0, 300));
  }

  // Normalize programs: rates carry basePoints; netPoints defaults to basePoints
  // until the engine applies the borrower's LLPA hits at analysis time.
  const programs = (prog.obj.programs || []).map(p => ({
    type: p.type,
    isARM: !!p.isARM,
    armType: p.armType || null,
    term: p.term || 30,
    rates: (p.rates || []).map(rt => ({
      rate: parseFloat(rt.rate),
      basePoints: parseFloat(rt.basePoints),
      netPoints: parseFloat(rt.basePoints),
    })).filter(rt => !isNaN(rt.rate) && !isNaN(rt.basePoints)),
  })).filter(p => p.rates.length > 0);

  return {
    effectiveDate: prog.obj.effectiveDate || (grid.obj && grid.obj.effectiveDate) || '',
    programs,
    llpaGrid: grid.obj || null,
  };
}

/**
 * Parse JSON, tolerating a response that was truncated mid-stream (max_tokens).
 * Strategy: try strict parse; if it fails, trim back to the last complete object
 * inside the most recent array, then close any still-open brackets/braces.
 */
function parseJsonLoose(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) {}

  let s = text;
  // Drop any trailing partial token after the last complete value boundary.
  const lastBoundary = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBoundary === -1) return null;
  s = s.slice(0, lastBoundary + 1);

  // Walk the string tracking depth + string state, then append the closers needed.
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // Remove a dangling comma before closing.
  s = s.replace(/,\s*$/, '');
  let closers = '';
  for (let i = stack.length - 1; i >= 0; i--) closers += stack[i] === '{' ? '}' : ']';
  try { return JSON.parse(s + closers); } catch (_) { return null; }
}


/**
 * LEGACY two-call parser (kept for backward compatibility / fallback). Bakes LLPAs
 * for a supplied borrower. New uploads use parseRateSheetBase + the engine instead.
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
