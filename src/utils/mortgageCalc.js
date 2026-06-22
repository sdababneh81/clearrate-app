/**
 * Mortgage calculation utilities
 */

export function calcPI(balance, annualRate, termYears) {
  if (!balance || !annualRate || !termYears) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return balance / n;
  return balance * (r * (1+r)**n) / ((1+r)**n - 1);
}

export function reverseEngineerTerm(balance, annualRate, monthlyPayment) {
  if (!balance || !annualRate || !monthlyPayment) return null;
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(balance / monthlyPayment / 12);
  const val = 1 - (r * balance / monthlyPayment);
  if (val <= 0) return null;
  const n = -Math.log(val) / Math.log(1 + r);
  return Math.round(n / 12 * 10) / 10;
}

export function calcPIFromTerm(balance, annualRate, remainingTermYears) {
  return calcPI(balance, annualRate, remainingTermYears);
}

export function calcBreakeven(netCost, monthlySavings) {
  if (!netCost || netCost <= 0) return 0;
  if (!monthlySavings || monthlySavings <= 0) return 999;
  return Math.ceil(netCost / monthlySavings);
}

/**
 * Analyze rate stack efficiency using cumulative cost analysis.
 * 
 * For each rate, calculates:
 * - stepEff: cost per 0.125% vs the immediately adjacent rate
 * - cumEff: all-in cost per 0.125% measured from the anchor (best credit rate)
 * - cliff: true if this step crosses a major pricing cliff
 * - zone: A (best credit region), B (balanced), C (premium/past cliff)
 * - tag: sweetspot_strong | sweetspot | normal | marginal | avoid | anchor
 *
 * The KEY insight: use CUMULATIVE efficiency to smooth over bad single steps.
 * A rate might look expensive step-by-step but be worth it cumulatively.
 */
export function analyzeRateStack(rates, marginBPS = 0) {
  const marginPct = marginBPS / 100;
  const STEP_CLIFF = 0.50;        // single-step pts per 0.125% — above this is a cliff
  const GOOD_THRESHOLD = 0.30;    // step pts per 0.125% — strong value at or below this
  const MARGINAL_THRESHOLD = 0.50; // step — marginal up to here

  // Apply margin, sort highest rate first (so we walk DOWN the stack)
  const sorted = rates
    .map(r => ({
      ...r,
      clientPoints: r.netPoints + marginPct,
      adjustedRate: parseFloat(r.rate),
    }))
    .filter(r => r.adjustedRate > 0)
    .sort((a, b) => b.adjustedRate - a.adjustedRate);

  if (!sorted.length) return [];

  // Anchor = rate with best (most negative) client points — the "free money" rate
  const anchor = sorted.reduce((best, r) =>
    r.clientPoints < best.clientPoints ? r : best, sorted[0]);

  // First pass: compute step efficiency (vs adjacent) and cumulative efficiency (from anchor)
  const withEff = sorted.map((r, i) => {
    const stepEff = i === 0 ? null : (() => {
      const prev = sorted[i - 1];
      const delta = r.clientPoints - prev.clientPoints;   // positive = costs more going down
      const rateDrop = prev.adjustedRate - r.adjustedRate;
      return rateDrop > 0 ? (delta / rateDrop) * 0.125 : null;
    })();

    const cumEff = r.adjustedRate >= anchor.adjustedRate ? null : (() => {
      const totalCost = r.clientPoints - anchor.clientPoints;
      const totalDrop = anchor.adjustedRate - r.adjustedRate;
      return totalDrop > 0 ? (totalCost / totalDrop) * 0.125 : null;
    })();

    return { ...r, stepEff, cumEff, isAnchor: r.adjustedRate === anchor.adjustedRate };
  });

  // Second pass: walk DOWN from the anchor. Use STEP efficiency (cost to buy down
  // the next 0.125%) for both cliff detection and value grading.
  // A cliff = a single step costing more than STEP_CLIFF pts per 0.125%.
  // Once we cross a cliff, everything below is Zone C (overpriced).
  let pastCliff = false;

  return withEff.map((r) => {
    const stepEff = r.stepEff; // cost per 0.125% vs the rate just above this one

    let zone, tag, tagLabel, tagColor;

    if (r.isAnchor) {
      zone = 'A'; tag = 'anchor'; tagLabel = '🏆 Best Credit'; tagColor = 'blue';
    } else if (r.adjustedRate > anchor.adjustedRate) {
      zone = 'A'; tag = 'normal'; tagLabel = '💰 More Credit'; tagColor = 'gray';
    } else if (pastCliff) {
      // Already crossed the cliff — everything below is overpriced
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Past Cliff — Overpriced'; tagColor = 'red';
    } else if (stepEff === null) {
      zone = 'B'; tag = 'normal'; tagLabel = ''; tagColor = 'gray';
    } else if (stepEff < 0) {
      // This step actually GAINS credit going down — pricing anomaly, take it
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '⚡ Pricing Anomaly'; tagColor = 'purple';
    } else if (stepEff > STEP_CLIFF) {
      // This single step is too expensive — CLIFF. This and everything below = Zone C.
      pastCliff = true;
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Past Cliff — Overpriced'; tagColor = 'red';
    } else if (stepEff <= 0.18) {
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '🟢 Strong Value'; tagColor = 'green';
    } else if (stepEff <= GOOD_THRESHOLD) {
      zone = 'B'; tag = 'sweetspot'; tagLabel = '✅ Good Value'; tagColor = 'green';
    } else {
      zone = 'B'; tag = 'marginal'; tagLabel = '🟡 Marginal'; tagColor = 'yellow';
    }

    return { ...r, zone, tag, tagLabel, tagColor, isCliff: pastCliff && zone === 'C', pastCliff };
  });
}

/**
 * Select the best rate for a given pricing strategy.
 * 
 * Strategies:
 *   'lowest_rate'  — Lowest rate before the first cliff. Best zone B rate.
 *   'margin_cost'  — Rate where lender credit covers broker margin + title/lender fees. Net $0 to borrower.
 *   'low_cost'     — Lowest rate achievable with borrower paying ≤1% points.
 *   'no_cost'      — Rate with best lender credit that still saves money. Zone A.
 */
export function selectRateForStrategy(analyzedRates, strategy, newLoanAmount, titleCharges, lenderFees, marginBPS, maxPointsPct = 5.0) {
  const totalFixedCosts = (titleCharges || 0) + (lenderFees || 0);
  const maxPointsDollar = (maxPointsPct / 100) * newLoanAmount;

  // Enforce the max-points cap on EVERY strategy.
  // A rate is eligible only if the borrower's out-of-pocket points are within the cap.
  const withinCap = analyzedRates.filter(r => {
    const pointsCost = r.clientPoints > 0 ? (r.clientPoints / 100) * newLoanAmount : 0;
    return pointsCost <= maxPointsDollar + 1; // +1 for rounding
  });

  // Helpers
  const lowestRateOf = (arr) => arr.length ? arr.reduce((lo, r) => r.adjustedRate < lo.adjustedRate ? r : lo, arr[0]) : null;
  const bestCreditOf = (arr) => arr.length ? arr.reduce((b, r) => r.clientPoints < b.clientPoints ? r : b, arr[0]) : null;

  switch (strategy) {
    case 'lowest_rate': {
      // The LOWEST rate that still makes sense — not past the cliff, within points cap.
      // We want the lowest rate among all non-cliff, non-avoid rates within the cap.
      const eligible = withinCap.filter(r => !r.pastCliff && r.tag !== 'avoid');
      if (eligible.length) return lowestRateOf(eligible);
      // fallback: anything within cap that isn't past the cliff
      const notPastCliff = withinCap.filter(r => !r.pastCliff);
      if (notPastCliff.length) return lowestRateOf(notPastCliff);
      return lowestRateOf(withinCap);
    }

    case 'margin_cost': {
      // Rate where lender credit covers margin + title + lender fees → net ≈ $0 to borrower.
      // Among within-cap rates, find the one whose net cost is closest to $0 (prefer small credit).
      const scored = withinCap.map(r => {
        const lenderCredit = r.clientPoints < 0 ? Math.abs(r.clientPoints / 100) * newLoanAmount : 0;
        const pointsCost = r.clientPoints > 0 ? (r.clientPoints / 100) * newLoanAmount : 0;
        const netCost = totalFixedCosts + pointsCost - lenderCredit;
        return { ...r, netCostDollar: netCost, absDist: Math.abs(netCost) };
      });
      if (!scored.length) return null;
      return scored.reduce((best, r) => {
        if (!best) return r;
        // Prefer net cost <= 0 (covered), then lowest rate among covered
        const rCovered = r.netCostDollar <= 0;
        const bCovered = best.netCostDollar <= 0;
        if (rCovered && !bCovered) return r;
        if (!rCovered && bCovered) return best;
        if (rCovered && bCovered) return r.adjustedRate < best.adjustedRate ? r : best;
        return r.absDist < best.absDist ? r : best; // neither covered — closest to $0
      }, null);
    }

    case 'low_cost': {
      // Lowest rate where borrower pays <= 1% of loan in points (tighter than maxPointsPct).
      const lowCostCap = newLoanAmount * 0.01;
      const eligible = withinCap.filter(r => {
        const pointsCost = r.clientPoints > 0 ? (r.clientPoints / 100) * newLoanAmount : 0;
        return pointsCost <= lowCostCap + 1 && !r.pastCliff;
      });
      if (eligible.length) return lowestRateOf(eligible);
      // fallback: closest to 1% within cap
      const sorted = withinCap.filter(r => !r.pastCliff)
        .sort((a, b) => {
          const ap = a.clientPoints > 0 ? a.clientPoints : 0;
          const bp = b.clientPoints > 0 ? b.clientPoints : 0;
          return ap - bp;
        });
      return sorted[0] || lowestRateOf(withinCap);
    }

    case 'no_cost': {
      // Lender credit must cover ALL fixed costs (title + lender fees).
      // Among those, pick the LOWEST rate (best for client) that still fully covers.
      const covers = analyzedRates.filter(r => {
        const lenderCredit = r.clientPoints < 0 ? Math.abs(r.clientPoints / 100) * newLoanAmount : 0;
        return lenderCredit >= totalFixedCosts;
      });
      if (covers.length) return lowestRateOf(covers);
      // No rate covers everything — pick the one with the most credit (anchor)
      return bestCreditOf(analyzedRates);
    }

    default:
      return lowestRateOf(withinCap);
  }
}

export function scoreRateOption(scenario, yearsInHome = null) {
  const { monthlySavings = 0, breakevenMonths = 0, netClosingCosts = 0, lifetimeInterestSavings = 0 } = scenario;
  if (monthlySavings <= 0) return -9999;
  const horizonMonths = yearsInHome ? Math.min(yearsInHome * 12, 360) : 60;
  const horizonNet = (monthlySavings * horizonMonths) - netClosingCosts;
  const maxHorizonNet = monthlySavings * horizonMonths;
  const horizonScore = Math.min(100, Math.max(0, (horizonNet / Math.max(maxHorizonNet, 1)) * 100));
  const savingsScore = Math.min(100, (monthlySavings / 600) * 100);
  let recoupScore;
  if (breakevenMonths === 0) recoupScore = 100;
  else if (yearsInHome && breakevenMonths > horizonMonths) recoupScore = -50;
  else {
    const rr = breakevenMonths / horizonMonths;
    recoupScore = rr <= 0.1 ? 95 : rr <= 0.2 ? 85 : rr <= 0.4 ? 70 : rr <= 0.6 ? 50 : rr <= 0.8 ? 30 : 10;
  }
  const lifetimeScore = Math.min(100, Math.max(0, (lifetimeInterestSavings / 200000) * 100));
  const lw = yearsInHome && yearsInHome <= 5 ? 0.05 : 0.10;
  const hw = yearsInHome && yearsInHome <= 5 ? 0.55 : 0.50;
  const sw = 0.25; const rw = yearsInHome ? 0.20 : 0.15;
  const tw = hw + sw + rw + lw;
  return Math.round((horizonScore*(hw/tw) + savingsScore*(sw/tw) + recoupScore*(rw/tw) + lifetimeScore*(lw/tw)) * 10) / 10;
}

