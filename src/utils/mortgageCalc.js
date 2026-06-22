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
  // IMPORTANT: cliff detection, zone grading, and the points cap all operate on the
  // LENDER NET PRICE (netPoints) — the discount points the BORROWER actually pays.
  // The broker margin is YSP comp earned separately and is NOT part of the borrower's
  // points. We add it only for the final cost-to-borrower display downstream.
  const marginPct = marginBPS / 100;
  // Cliff = the first buydown step that costs more than STEP_CLIFF points per 0.125%.
  // Buydown cost is the LENDER net price delta (the discount points the borrower pays).
  // The broker margin is YSP comp and is NOT part of this.
  const STEP_CLIFF = 0.80;   // first step above this pt/0.125% = the cliff
  const STRONG = 0.35;       // step <= this = strong value
  const GOOD = 0.60;         // step <= this = good value

  const sorted = rates
    .map(r => ({
      ...r,
      netPoints: parseFloat(r.netPoints),
      clientPoints: parseFloat(r.netPoints) + marginPct, // borrower price after margin (display)
      adjustedRate: parseFloat(r.rate),
    }))
    .filter(r => r.adjustedRate > 0 && !isNaN(r.netPoints))
    .sort((a, b) => b.adjustedRate - a.adjustedRate);

  if (!sorted.length) return [];

  const anchor = sorted.reduce((best, r) =>
    r.netPoints < best.netPoints ? r : best, sorted[0]);

  const withEff = sorted.map((r, i) => {
    const stepEff = i === 0 ? null : (() => {
      const prev = sorted[i - 1];
      const delta = r.netPoints - prev.netPoints;
      const rateDrop = prev.adjustedRate - r.adjustedRate;
      return rateDrop > 0 ? (delta / rateDrop) * 0.125 : null;
    })();
    return { ...r, stepEff, isAnchor: r.adjustedRate === anchor.adjustedRate };
  });

  // Walk down from anchor. First step above STEP_CLIFF marks the cliff;
  // that rate and everything below it is Zone C (overpriced buydown).
  let pastCliff = false;

  return withEff.map((r) => {
    const stepEff = r.stepEff;
    let zone, tag, tagLabel, tagColor;
    const belowAnchor = r.adjustedRate < anchor.adjustedRate;
    const isThisCliff = !pastCliff && belowAnchor && stepEff !== null && stepEff > STEP_CLIFF;

    if (r.isAnchor) {
      zone = 'A'; tag = 'anchor'; tagLabel = '🏆 Best Credit'; tagColor = 'blue';
    } else if (r.adjustedRate > anchor.adjustedRate) {
      zone = 'A'; tag = 'normal'; tagLabel = '💰 More Credit'; tagColor = 'gray';
    } else if (pastCliff) {
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Past Cliff — Overpriced'; tagColor = 'red';
    } else if (isThisCliff) {
      pastCliff = true;
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Past Cliff — Overpriced'; tagColor = 'red';
    } else if (stepEff === null) {
      zone = 'B'; tag = 'normal'; tagLabel = ''; tagColor = 'gray';
    } else if (stepEff < 0) {
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '⚡ Pricing Anomaly'; tagColor = 'purple';
    } else if (stepEff <= STRONG) {
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '🟢 Strong Value'; tagColor = 'green';
    } else if (stepEff <= GOOD) {
      zone = 'B'; tag = 'sweetspot'; tagLabel = '✅ Good Value'; tagColor = 'green';
    } else {
      zone = 'B'; tag = 'marginal'; tagLabel = '🟡 Marginal'; tagColor = 'yellow';
    }

    return { ...r, zone, tag, tagLabel, tagColor, isCliff: isThisCliff, pastCliff };
  });
}

/**
 * Select the optimal rate for a given strategy. All point math is on the LENDER
 * net price (netPoints = borrower discount points). Margin is added only for the
 * cost-to-borrower figures used to decide no_cost / margin_cost coverage.
 *
 * The three core strategies are distinct points on the buydown curve, ordered:
 *   no_cost (highest rate, borrower pays least) >
 *   margin_cost (middle) >
 *   lowest_rate (lowest rate, borrower pays most)
 */
export function selectRateForStrategy(analyzedRates, strategy, newLoanAmount, titleCharges, lenderFees, marginBPS, maxPointsPct = 5.0) {
  const marginPct = marginBPS / 100;
  const totalFixedCosts = (titleCharges || 0) + (lenderFees || 0);
  const settlementPct = newLoanAmount > 0 ? (totalFixedCosts / newLoanAmount) * 100 : 0;

  // Borrower discount points = positive lender net price. Margin is separate YSP.
  const discountPoints = (r) => Math.max(0, r.netPoints);

  // Points cap limits DISCOUNT POINTS + SETTLEMENT FEES (per Sam). Margin excluded.
  const totalBorrowerPointCost = (r) => discountPoints(r) + settlementPct;
  const withinCap = analyzedRates.filter(r => totalBorrowerPointCost(r) <= maxPointsPct + 0.001);

  // Net cash to close after margin applied (used only for no_cost coverage test)
  const borrowerNetCost = (r) => {
    const clientPts = r.netPoints + marginPct;
    return totalFixedCosts + (clientPts / 100) * newLoanAmount;
  };

  const lowestRateOf = (arr) => arr.length ? arr.reduce((lo, r) => r.adjustedRate < lo.adjustedRate ? r : lo, arr[0]) : null;
  const mostCreditOf = (arr) => arr.length ? arr.reduce((b, r) => r.netPoints < b.netPoints ? r : b, arr[0]) : null;

  // Window of usable rates: not past cliff AND within the points+settlement cap.
  // Cascade fallbacks so we never return null even when the cap excludes everything.
  const eligible = withinCap.filter(r => !r.pastCliff && r.tag !== 'avoid');
  const notPastCliffInCap = withinCap.filter(r => !r.pastCliff);
  const notPastCliffAny = analyzedRates.filter(r => !r.pastCliff);
  const safePool =
    eligible.length ? eligible :
    notPastCliffInCap.length ? notPastCliffInCap :
    withinCap.length ? withinCap :
    notPastCliffAny.length ? notPastCliffAny :
    analyzedRates;

  switch (strategy) {
    case 'lowest_rate': {
      // Lowest rate before the cliff AND within the cap. Borrower pays discount points.
      // If the cap excluded everything (degenerate, e.g. 0% cap with real fees),
      // fall back to the least-cost rate so we never recommend an over-cap rate.
      const capped = withinCap.filter(r => !r.pastCliff && r.tag !== 'avoid');
      if (capped.length) return lowestRateOf(capped);
      const cappedAny = withinCap.filter(r => !r.pastCliff);
      if (cappedAny.length) return lowestRateOf(cappedAny);
      // Nothing within cap — pick the least discount-points rate available
      return [...safePool].sort((a, b) => discountPoints(a) - discountPoints(b))[0] || lowestRateOf(safePool);
    }

    case 'no_cost': {
      // Borrower brings ~$0: lender credit (after margin) covers all closing costs.
      // Lowest rate that fully covers; if margin eats the credit and none cover,
      // fall back to the most-credit rate (least cost to borrower).
      const covers = analyzedRates.filter(r => borrowerNetCost(r) <= 0);
      if (covers.length) return lowestRateOf(covers);
      return mostCreditOf(analyzedRates) || lowestRateOf(safePool);
    }

    case 'margin_cost': {
      // Middle ground: borrower pays ~1 discount point on top of settlement/closing costs.
      // Target borrower discount points ≈ 1.0%.
      const TARGET = 1.0;
      const cand = safePool.length ? safePool : analyzedRates;
      const ranked = [...cand].sort((a, b) =>
        Math.abs(discountPoints(a) - TARGET) - Math.abs(discountPoints(b) - TARGET));
      return ranked[0] || lowestRateOf(cand);
    }

    case 'low_cost': {
      // Lowest rate where borrower discount points <= 1.0% (catches pricing anomalies).
      const eligibleLow = safePool.filter(r => discountPoints(r) <= 1.0 + 0.001);
      if (eligibleLow.length) return lowestRateOf(eligibleLow);
      return [...safePool].sort((a, b) => discountPoints(a) - discountPoints(b))[0] || lowestRateOf(safePool);
    }

    default:
      return lowestRateOf(safePool);
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


