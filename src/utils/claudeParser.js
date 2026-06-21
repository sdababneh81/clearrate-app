/**
 * ClearRate — Claude API PDF Parser
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

export async function parseRateSheet(file, clientProfile, adminMargins = {}) {
  const { ficoScore, ltv, loanType, purpose, currentRate } = clientProfile || {};

  const borrowerContext = ficoScore
    ? `Borrower profile: FICO ${ficoScore}, LTV ${ltv || 'unknown'}%, loan type ${loanType || 'Conventional'}, purpose ${purpose || 'rate/term refi'}${currentRate ? `, current rate ${currentRate}%` : ''}.`
    : '';

  // Two-call strategy:
  // Call 1: Extract raw rate data as a simple text table (Claude won't narrate this)
  // Call 2: Convert that text to JSON (small, structured, can't fail)
  // This sidesteps the "thinking out loud" problem entirely.

  let rawTableContent;
  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    rawTableContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      {
        type: 'text',
        text: `${borrowerContext}

From this rate sheet, extract a pipe-delimited table of ALL rate rows.
Apply FICO and LTV LLPA adjustments from the pricing adjustment tables.

Output ONLY this table, no other text:

PROGRAM|ARM|ARM_TYPE|RATE|NET_POINTS
Conventional|false||6.500|-0.250
Conventional|false||6.750|0.125
VA|false||6.250|-1.500
VA|true|5/6 SOFR|5.875|-0.750

Rules:
- PROGRAM: VA, Conventional, or FHA only
- NET_POINTS: 30-day lock base price PLUS FICO and LTV adjustments. Negative=credit, Positive=borrower pays.
- Include ALL rate rows for each program
- First line must be the header exactly as shown above`
      }
    ];
  } else {
    const text = await file.text();
    rawTableContent = [{ type: 'text', text: `${borrowerContext}\n\nExtract rate table from this rate sheet as pipe-delimited with header PROGRAM|ARM|ARM_TYPE|RATE|NET_POINTS. Apply LLPAs. One row per rate.\n\n${text.substring(0, 15000)}` }];
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  console.log('[ClearRate] Step 1: Extracting rate table...', { borrowerContext });

  const r1 = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: rawTableContent }] })
  });

  if (!r1.ok) throw new Error(`Rate sheet API error ${r1.status}: ${(await r1.text()).substring(0, 200)}`);

  const d1 = await r1.json();
  const tableText = d1.content.map(b => b.text || '').join('').trim();
  console.log('[ClearRate] Step 1 table output:', tableText.substring(0, 800));

  // Parse the pipe-delimited table into a programs structure
  const parsed = parseTableToPrograms(tableText);

  if (!parsed.programs || parsed.programs.length === 0) {
    console.error('[ClearRate] No programs parsed from table. Raw table:', tableText);
    throw new Error('No rate programs found in rate sheet. Raw: ' + tableText.substring(0, 300));
  }

  console.log('[ClearRate] ✅ Rate sheet parsed:',
    parsed.programs.map(p => `${p.type} ${p.isARM ? (p.armType || 'ARM') : 'fixed'} (${p.rates.length} rates)`).join(' | '));
  console.log('[ClearRate] Full output:', JSON.stringify(parsed, null, 2));

  return parsed;
}

/**
 * Parse pipe-delimited table output into programs structure.
 * Handles Claude adding explanation before/after the table.
 */
function parseTableToPrograms(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Find the header line
  const headerIdx = lines.findIndex(l =>
    l.toUpperCase().includes('PROGRAM') && l.includes('|') && l.toUpperCase().includes('RATE')
  );

  if (headerIdx === -1) {
    // Fallback: try to parse any line with pipe-delimited numbers
    return parseFallback(text);
  }

  const dataLines = lines.slice(headerIdx + 1).filter(l => l.includes('|') && !l.match(/^[-|]+$/));

  const programMap = {};

  for (const line of dataLines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 4) continue;

    const [programRaw, armRaw, armType, rateRaw, netPointsRaw] = parts;

    // Normalize program type
    let type = programRaw.trim();
    if (/va/i.test(type)) type = 'VA';
    else if (/fha/i.test(type)) type = 'FHA';
    else if (/conv/i.test(type)) type = 'Conventional';
    else continue; // skip unknown programs

    const isARM = armRaw?.toLowerCase() === 'true';
    const rate = parseFloat(rateRaw);
    const netPoints = parseFloat(netPointsRaw);

    if (!rate || isNaN(rate) || isNaN(netPoints)) continue;

    const key = `${type}|${isARM}|${armType || ''}`;
    if (!programMap[key]) {
      programMap[key] = { type, term: 30, isARM, armType: armType || null, rates: [] };
    }
    programMap[key].rates.push({ rate, netPoints, adjustedRate: rate });
  }

  const programs = Object.values(programMap).filter(p => p.rates.length > 0);
  return { programs, effectiveDate: '', llpasApplied: [] };
}

/**
 * Fallback parser: extract any rate-like data from free-form text.
 */
function parseFallback(text) {
  const programs = [];
  const seen = new Set();

  // Look for patterns like "6.500  -1.250" or "6.500 | -1.250" or "6.500: -1.25 points"
  const ratePattern = /\b(\d\.\d{3,4})\s*[|:]?\s*(-?\d+\.?\d*)\s*(?:pts?|points?|credit)?/gi;
  const matches = [...text.matchAll(ratePattern)];

  if (matches.length === 0) return { programs: [], effectiveDate: '', llpasApplied: [] };

  // Determine dominant program type from text
  const isVA = /\bva\b/i.test(text);
  const isFHA = /\bfha\b/i.test(text);
  const type = isVA ? 'VA' : isFHA ? 'FHA' : 'Conventional';

  const rates = [];
  for (const m of matches) {
    const rate = parseFloat(m[1]);
    const netPoints = parseFloat(m[2]);
    if (rate < 3 || rate > 12 || isNaN(netPoints)) continue;
    const key = rate.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ rate, netPoints, adjustedRate: rate });
  }

  if (rates.length > 0) {
    programs.push({ type, term: 30, isARM: false, armType: null, rates });
  }

  return { programs, effectiveDate: '', llpasApplied: ['fallback-parser'] };
}
