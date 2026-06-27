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
// The exact shape is confirmed from a "Try it out" response; until then this
// reads the most likely fields and falls back to summing line items. If it
// can't find a defensible total, it returns null so the UI leaves the field
// for manual entry rather than inserting a wrong number.
function extractTotal(quote) {
  if (!quote || typeof quote !== 'object') return null;
  // 1) An explicit total, if SilkTitle provides one.
  const direct = quote.total ?? quote.totalFees ?? quote.grandTotal
    ?? quote.costs?.total ?? quote.summary?.total;
  if (typeof direct === 'number' && direct > 0) return Math.round(direct);
  // 2) Otherwise sum the line-item costs (title + recording + insurance).
  const lines = quote.costs || quote.fees || quote.lineItems || quote.items;
  if (Array.isArray(lines) && lines.length) {
    const sum = lines.reduce((s, x) => s + (Number(x.amount ?? x.cost ?? x.fee ?? x.value) || 0), 0);
    if (sum > 0) return Math.round(sum);
  }
  return null; // unknown shape — caller leaves the field manual
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
