// api/title-fees.js — Vercel serverless function
// Proxies a title-fee quote request to SilkTitle so the credentials stay
// server-side (never in the browser). The frontend POSTs the property/loan
// fields; this route authenticates to SilkTitle, calls /v1/quotes, and returns
// the total title + settlement charges.
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   SILKTITLE_BASE   e.g. https://api.uats.silktitleco.com   (defaults to UAT)
//   SILKTITLE_USER   e.g. chl_uat_int
//   SILKTITLE_PASS   the API password  (ROTATE the one shared in chat)

const BASE = process.env.SILKTITLE_BASE || 'https://api.uats.silktitleco.com';

// Pull the total title + settlement charge out of SilkTitle's quote response.
// Confirmed shape: { premium: { lender, owner }, fees: [ { amount, description,
// mismoType, hudLine, ... } ], notes }. Amounts come back as strings. The total
// the borrower owes = lender premium + owner premium + sum of all fee amounts.
// Returns null if the shape is unrecognized so the UI leaves the field manual.
function num(v) { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }

function extractTotal(quote) {
  if (!quote || typeof quote !== 'object') return null;
  let total = 0, found = false;
  // Title insurance premiums
  if (quote.premium && typeof quote.premium === 'object') {
    total += num(quote.premium.lender) + num(quote.premium.owner);
    found = true;
  }
  // Settlement / recording / title fee line items
  if (Array.isArray(quote.fees)) {
    for (const f of quote.fees) { total += num(f.amount); }
    found = found || quote.fees.length > 0;
  }
  // Fallback: an explicit total field, if the shape ever changes
  if (!found) {
    const direct = quote.total ?? quote.totalFees ?? quote.grandTotal ?? quote.summary?.total;
    if (typeof direct === 'number' && direct > 0) return Math.round(direct);
    return null;
  }
  return total > 0 ? Math.round(total) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = process.env.SILKTITLE_USER;
  const pass = process.env.SILKTITLE_PASS;
  if (!user || !pass) {
    return res.status(500).json({ error: 'SilkTitle credentials not configured on the server.' });
  }

  try {
    const b = req.body || {};
    // Map ClearRate fields → SilkTitle /v1/quotes request body.
    const quoteReq = {
      type: b.type || 'refinance',
      loanNumber: b.loanNumber || `cr-${Date.now()}`,
      loanAmount: Number(b.loanAmount) || 0,
      loanProgram: (b.loanProgram || 'conventional').toLowerCase(),
      product: b.product || 'standard',
      estimatedPropertyValue: Number(b.estimatedPropertyValue) || 0,
      estimatedCashOut: b.estimatedCashOut != null ? Number(b.estimatedCashOut) : null,
      property: {
        city: b.property?.city || '',
        state: (b.property?.state || '').toLowerCase(),
        zipCode: b.property?.zipCode || '',
        county: b.property?.county || '',
      },
      priorLoan: b.priorLoan || null,
      endorsements: Array.isArray(b.endorsements) ? b.endorsements : [],
    };

    // Basic auth (default per current docs). If SilkTitle uses a bearer token
    // instead, this is the one spot to switch to a /auth token exchange.
    const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    const r = await fetch(`${BASE}/v1/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify(quoteReq),
    });

    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      return res.status(r.status).json({ error: 'SilkTitle quote failed', status: r.status, detail: data });
    }

    const total = extractTotal(data);
    // Return the total plus the raw quote so the frontend (and we) can confirm
    // the shape and finish field-mapping if needed.
    return res.status(200).json({ total, quote: data });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach SilkTitle', detail: String(e.message || e) });
  }
}
