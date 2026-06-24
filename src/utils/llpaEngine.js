/**
 * ClearRate — deterministic LLPA application, modeled on the real UWM rate sheet.
 *
 * UWM uses TWO different adjustment systems:
 *   • Conventional: full FICO × LTV matrices, separate for Purchase / Rate-Term / Cash-Out.
 *   • Government (VA/FHA): a flat FICO adjustor (not LTV-dependent), plus a few VA specials
 *     (e.g. VA Cash-Out LTV > 90% = +1.250).
 *
 * The sheet is uploaded as base prices + this grid; we apply it against the REAL borrower
 * (FICO / LTV / purpose) at analysis time — deterministic, itemized, no AI call.
 *
 * Grid shape (from parseRateSheetBase):
 * {
 *   conventional: {
 *     ltvBands:        [30,60,65,70,75,80,85,90,95,97],
 *     cashOutLtvBands: [30,60,65,70,75,80,85,89.99],
 *     rateTerm: [ { min:780, max:850, cols:[0,0,0,0,0.125,0.5,0.625,0.5,0.375,0.375] }, ... ],
 *     cashOut:  [ { min:780, max:850, cols:[0.375,0.375,0.625,0.625,0.875,1.375,1.625,1.875] }, ... ],
 *     purchase: [ ... ]   // optional
 *   },
 *   government: {
 *     fico: [ {min:740,max:850,hit:-0.5}, {min:700,max:739,hit:-0.25}, {min:640,max:699,hit:0},
 *             {min:620,max:639,hit:0.375}, {min:600,max:619,hit:0.625}, {min:580,max:599,hit:1.0} ],
 *     vaCashOutOver90: 1.25
 *   }
 * }
 */

function findBand(bands, fico) {
  if (!Array.isArray(bands) || fico == null) return null;
  let b = bands.find(x => fico >= (x.min ?? -Infinity) && fico <= (x.max ?? Infinity));
  if (!b) {
    const sorted = [...bands].sort((a, c) => (a.min ?? 0) - (c.min ?? 0));
    b = fico < (sorted[0].min ?? 0) ? sorted[0] : sorted[sorted.length - 1]; // clamp
  }
  return b;
}

// Map an LTV to the column index, given the ordered upper-bound bands.
function ltvColIndex(ltvBands, ltv) {
  if (!Array.isArray(ltvBands) || ltv == null) return -1;
  for (let i = 0; i < ltvBands.length; i++) {
    if (ltv <= ltvBands[i] + 1e-9) return i;
  }
  return ltvBands.length - 1; // above the top band → clamp to last column
}

function ltvColLabel(ltvBands, idx) {
  if (idx < 0) return '';
  const hi = ltvBands[idx];
  const lo = idx === 0 ? 0 : ltvBands[idx - 1];
  return idx === 0 ? `≤${hi}%` : `${lo}.01-${hi}%`;
}

/**
 * @param grid     rateSheet.llpaGrid (shape above)
 * @param borrower { loanType: 'conventional'|'va'|'fha', fico, ltv, isCashOut }
 * @returns { totalHit, hits:[{description, hit}] }
 */
export function applyLLPA(grid, borrower) {
  const hits = [];
  if (!grid || typeof grid !== 'object') return { totalHit: 0, hits };

  const fico = borrower?.fico != null ? parseFloat(borrower.fico) : null;
  const ltv = borrower?.ltv != null ? parseFloat(borrower.ltv) : null;
  const isCashOut = !!borrower?.isCashOut;
  const lt = (borrower?.loanType || 'conventional').toLowerCase();
  const isGov = lt === 'va' || lt === 'fha' || lt === 'government';

  if (isGov && grid.government) {
    // ── VA / FHA: flat FICO adjustor ────────────────────────────────────
    const band = findBand(grid.government.fico, fico);
    if (band && parseFloat(band.hit) !== 0 && !isNaN(parseFloat(band.hit))) {
      hits.push({ description: `${lt.toUpperCase()} Credit ${band.min}-${band.max}`, hit: parseFloat(band.hit) });
    }
    // VA cash-out above 90% LTV
    if (lt === 'va' && isCashOut && ltv != null && ltv > 90 && grid.government.vaCashOutOver90 != null) {
      const h = parseFloat(grid.government.vaCashOutOver90);
      if (h) hits.push({ description: 'VA Cash-Out LTV > 90%', hit: h });
    }
  } else if (grid.conventional) {
    // ── Conventional: FICO × LTV matrix, by purpose ─────────────────────
    const conv = grid.conventional;
    const matrix = isCashOut ? (conv.cashOut || conv.rateTerm) : (conv.rateTerm || conv.purchase);
    const ltvBands = isCashOut ? (conv.cashOutLtvBands || conv.ltvBands) : conv.ltvBands;
    const band = findBand(matrix, fico);
    const idx = ltvColIndex(ltvBands, ltv);
    if (band && Array.isArray(band.cols) && idx >= 0) {
      const raw = band.cols[idx];
      const hit = (raw === 'NA' || raw == null) ? null : parseFloat(raw);
      if (hit != null && !isNaN(hit) && hit !== 0) {
        const purpose = isCashOut ? 'Cash-Out' : 'Rate/Term';
        hits.push({
          description: `${purpose} · Credit ${band.min}-${band.max} / LTV ${ltvColLabel(ltvBands, idx)}`,
          hit,
        });
      } else if (raw === 'NA') {
        hits.push({ description: `⚠️ Not eligible: Credit ${band.min}-${band.max} at LTV ${ltvColLabel(ltvBands, idx)}`, hit: 0, ineligible: true });
      }
    }
  }

  const totalHit = Math.round(hits.reduce((s, h) => s + (h.hit || 0), 0) * 1000) / 1000;
  return { totalHit, hits };
}
