/**
 * ClearRate — deterministic LLPA application.
 *
 * The rate sheet is uploaded as BASE prices plus a raw LLPA grid (FICO x LTV
 * matrix, cash-out adjustments, and situational "other" hits). We apply that grid
 * against the REAL borrower at analysis time — no AI, fully auditable, same inputs
 * always yield the same hits. This replaces the old approach of baking LLPAs against
 * a hardcoded fake 700-FICO / 75-LTV borrower at upload time.
 */

// Standard LTV column thresholds used by UWM-style grids (upper bounds).
const LTV_COLS = [60, 65, 70, 75, 80, 85, 90, 95, 97];

function ltvColumnKey(ltv) {
  if (ltv == null || isNaN(ltv)) return null;
  for (const t of LTV_COLS) {
    if (ltv <= t + 1e-9) return `ltv_${t}`;
  }
  return `ltv_97`; // anything above 97 clamps to the top column
}

function ltvColumnLabel(ltv) {
  if (ltv == null || isNaN(ltv)) return '';
  for (const t of LTV_COLS) {
    if (ltv <= t + 1e-9) return `≤${t}%`;
  }
  return '>97%';
}

/**
 * Apply the LLPA grid for one borrower.
 *
 * @param grid     rateSheet.llpaGrid  { creditScore:[{min,max,adjustments:{ltv_XX:hit}}], cashOut:[{ltv_min,ltv_max,hit}], otherHits:[{description,hit,when?}] }
 * @param borrower { fico, ltv, isCashOut, flags? }   flags = { investment, units2, units3, units4, manufactured, secondHome, ... }
 * @returns { totalHit, hits:[{description, hit}] }
 */
export function applyLLPA(grid, borrower) {
  const hits = [];
  if (!grid || typeof grid !== 'object') return { totalHit: 0, hits };

  const fico = borrower?.fico != null ? parseFloat(borrower.fico) : null;
  const ltv = borrower?.ltv != null ? parseFloat(borrower.ltv) : null;
  const isCashOut = !!borrower?.isCashOut;
  const flags = borrower?.flags || {};

  // ── FICO x LTV adjustment ──────────────────────────────────────────────
  if (Array.isArray(grid.creditScore) && grid.creditScore.length && fico != null) {
    // Find the FICO band; clamp to nearest if the borrower is below/above all bands.
    let band = grid.creditScore.find(b => fico >= (b.min ?? -Infinity) && fico <= (b.max ?? Infinity));
    if (!band) {
      const sorted = [...grid.creditScore].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
      band = fico < (sorted[0].min ?? 0) ? sorted[0] : sorted[sorted.length - 1];
    }
    const colKey = ltvColumnKey(ltv);
    const adj = band?.adjustments ? band.adjustments[colKey] : null;
    if (adj != null && !isNaN(parseFloat(adj)) && parseFloat(adj) !== 0) {
      const lo = band.min ?? '', hi = band.max ?? '';
      hits.push({
        description: `Credit ${lo}-${hi} / LTV ${ltvColumnLabel(ltv)}`,
        hit: parseFloat(adj),
      });
    }
  }

  // ── Cash-out adjustment ────────────────────────────────────────────────
  if (isCashOut && Array.isArray(grid.cashOut) && grid.cashOut.length && ltv != null) {
    const band = grid.cashOut.find(b =>
      ltv >= (b.ltv_min ?? -Infinity) - 1e-9 && ltv <= (b.ltv_max ?? Infinity) + 1e-9);
    if (band && parseFloat(band.hit) !== 0 && !isNaN(parseFloat(band.hit))) {
      hits.push({
        description: `Cash-Out (LTV ${ltvColumnLabel(ltv)})`,
        hit: parseFloat(band.hit),
      });
    }
  }

  // ── Situational "other" hits — applied ONLY when we can confirm the flag ──
  // We never auto-apply hits we can't verify (e.g. investment, 2-unit), because
  // a standard primary SFR shouldn't silently inherit them. Flags must be set
  // explicitly on the borrower profile.
  if (Array.isArray(grid.otherHits)) {
    for (const h of grid.otherHits) {
      const key = (h.when || h.flag || '').toString();
      if (key && flags[key] && parseFloat(h.hit) !== 0) {
        hits.push({ description: h.description || key, hit: parseFloat(h.hit) });
      }
    }
  }

  const totalHit = Math.round(hits.reduce((s, h) => s + (h.hit || 0), 0) * 1000) / 1000;
  return { totalHit, hits };
}
