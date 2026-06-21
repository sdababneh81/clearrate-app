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

  const borrowerContext = ficoScore
    ? `Borrower: FICO ${ficoScore}, LTV ~${ltv || 'unknown'}%, loan type: ${loanType || 'Conventional'}, purpose: ${purpose || 'rate/term refi'}${currentRate ? `, current rate: ${currentRate}%` : ''}.`
    : '';

  const userPrompt = `This is a wholesale lender rate sheet PDF. ${borrowerContext}

Extract ALL rate programs and ALL rate rows. Apply FICO and LTV LLPA adjustments from the adjustment tables.

For each rate row, provide:
- rate: the note rate (number, e.g. 6.5)
- netPoints: base price from 30-day lock column PLUS all applicable LLPA adjustments. Negative = lender credit. Positive = borrower pays points.

Include every program: VA 30yr fixed, VA ARM, Conventional 30yr fixed, FHA 30yr fixed — whatever is present.
type must be exactly "VA", "Conventional", or "FHA".
Do NOT add broker margin. Raw lender pricing only.`;

  let userContent;
  if (file.type === 'application/pdf') {
    const base64 = await fileToBase64(file);
    userContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: userPrompt }
    ];
  } else {
    const text = await file.text();
    userContent = [{ type: 'text', text: userPrompt + '\n\n' + text.substring(0, 15000) }];
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  // PREFILL TECHNIQUE: Pre-populate the assistant turn with the opening of the JSON.
  // Claude is forced to CONTINUE the JSON rather than starting with explanation.
  // This is the most reliable way to guarantee JSON output.
  const prefill = '{"programs":[';

  console.log('[ClearRate] Sending rate sheet to Claude (prefill mode)...', { borrowerContext });

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
      max_tokens: 8000,
      system: 'You are a mortgage rate sheet data extractor. You complete JSON objects. You never add explanation or markdown.',
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: prefill }  // prefill forces Claude to continue the JSON
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[ClearRate] Rate sheet API error:', response.status, errText);
    throw new Error(`Rate sheet API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  // Claude continues from the prefill — prepend it back to reconstruct full JSON
  const continuation = data.content.map(b => b.text || '').join('').trim();
  const raw = prefill + continuation;

  console.log('[ClearRate] Raw (prefill + continuation) length:', raw.length);
  console.log('[ClearRate] First 600 chars:', raw.substring(0, 600));

  // Strip trailing markdown fence if Claude added one at the end
  const cleaned = raw.replace(/\s*```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // JSON incomplete? Try to close it gracefully
    // Common case: Claude hit max_tokens mid-object — try to patch the tail
    const patched = tryPatchIncompleteJSON(cleaned);
    if (patched) {
      parsed = patched;
      console.warn('[ClearRate] JSON was incomplete — patched tail successfully');
    } else {
      console.error('[ClearRate] JSON parse failed. Full raw:', raw);
      throw new Error(`Rate sheet JSON parse failed. Got ${raw.length} chars. First 300: ${raw.substring(0, 300)}`);
    }
  }

  // Validate structure
  if (!parsed.programs || !Array.isArray(parsed.programs)) {
    console.error('[ClearRate] No programs array in parsed output:', parsed);
    throw new Error('Rate sheet parsed but missing programs array.');
  }

  // Normalize: adjustedRate = rate (engine applies margin)
  parsed.programs = parsed.programs.map(prog => ({
    ...prog,
    rates: (prog.rates || []).map(r => ({
      ...r,
      adjustedRate: parseFloat(r.rate) || 0,
    })).filter(r => r.adjustedRate > 0)
  })).filter(p => p.rates && p.rates.length > 0);

  console.log('[ClearRate] ✅ Rate sheet parsed successfully');
  console.log('[ClearRate] Programs:', parsed.programs.length,
    parsed.programs.map(p => `${p.type} ${p.isARM ? (p.armType || 'ARM') : '30yr fixed'} (${p.rates.length} rates)`).join(' | '));
  console.log('[ClearRate] Full output:', JSON.stringify(parsed, null, 2));

  return parsed;
}

/**
 * Attempt to patch a truncated JSON string by closing any open structures.
 * Handles the case where Claude hit max_tokens mid-object.
 */
function tryPatchIncompleteJSON(str) {
  // Count open braces/brackets to determine what needs closing
  let braces = 0, brackets = 0;
  let inString = false, escape = false;

  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  if (braces < 0 || brackets < 0) return null; // malformed, can't patch

  // Trim to last complete top-level object boundary we can find
  // Find last complete rate object by finding last '}' before unclosed structures
  let patched = str.trimEnd();

  // Remove trailing incomplete object (find last complete },  or }, pattern)
  // Strip trailing comma and partial object
  patched = patched.replace(/,\s*\{[^}]*$/, '');
  patched = patched.replace(/,\s*$/, '');

  // Close open structures
  for (let i = 0; i < brackets; i++) patched += ']';
  for (let i = 0; i < braces; i++) patched += '}';

  try {
    return JSON.parse(patched);
  } catch {
    return null;
  }
}
