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
 * - cliff: true if this step crosses a major pricing cliff
 * - zone: A (best credit region), B (balanced), C (premium/past cliff)
 * - tag: sweetspot_strong | sweetspot | normal | marginal | avoid | anchor
 *
 * Cliff detection, zone grading, and the points cap all operate on the LENDER
 * NET PRICE (netPoints) — the discount points the BORROWER actually pays. The
 * broker margin is YSP comp earned separately and is NOT part of the borrower's
 * points; it's added only for the cost-to-borrower display downstream.
 */
export function analyzeRateStack(rates, marginBPS = 0) {
  const marginPct = marginBPS / 100;
  // Cliff = the first buydown step that costs more than STEP_CLIFF points per 0.125%.
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
 * THE POINTS CAP IS A HARD CEILING. maxPointsPct caps (borrower discount points +
 * settlement fees) — margin excluded as YSP, per business rule. The selector will
 * NEVER return a rate whose discount points + settlement exceed the cap when ANY
 * rate is within the cap. A final guard enforces this for every strategy.
 *
 * The three core strategies are distinct points on the buydown curve, ordered:
 *   no_cost (highest rate, borrower pays least) >
 *   margin_cost (middle) >
 *   lowest_rate (lowest rate, borrower pays most — but still within cap)
 */
export function selectRateForStrategy(analyzedRates, strategy, newLoanAmount, titleCharges, lenderFees, marginBPS, maxPointsPct = 5.0) {
  if (!analyzedRates?.length) return null;

  const marginPct = marginBPS / 100;
  const totalFixedCosts = (titleCharges || 0) + (lenderFees || 0);
  const settlementPct = newLoanAmount > 0 ? (totalFixedCosts / newLoanAmount) * 100 : 0;

  // Robust cap: blank / NaN / non-finite => no usable cap, fall back to a sane 5.0.
  const capRaw = parseFloat(maxPointsPct);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 5.0;
  const CAP_EPS = 0.001;

  // Borrower discount points = positive lender net price. Margin is separate YSP.
  const discountPoints = (r) => Math.max(0, r.netPoints);

  // Cap is on DISCOUNT POINTS + SETTLEMENT FEES (per Sam). Margin excluded.
  const totalBorrowerPointCost = (r) => discountPoints(r) + settlementPct;
  const withinCap = (r) => totalBorrowerPointCost(r) <= cap + CAP_EPS;

  // Net cash to close after margin applied (used only for no_cost coverage test)
  const borrowerNetCost = (r) => {
    const clientPts = r.netPoints + marginPct;
    return totalFixedCosts + (clientPts / 100) * newLoanAmount;
  };

  const lowestRateOf = (arr) => arr.length ? arr.reduce((lo, r) => r.adjustedRate < lo.adjustedRate ? r : lo, arr[0]) : null;
  const mostCreditOf = (arr) => arr.length ? arr.reduce((b, r) => r.netPoints < b.netPoints ? r : b, arr[0]) : null;

  // Pools, all already filtered to the hard cap.
  const capped = analyzedRates.filter(withinCap);
  const cappedClean = capped.filter(r => !r.pastCliff && r.tag !== 'avoid');
  const cappedNotCliff = capped.filter(r => !r.pastCliff);

  // The eligible pool prefers clean (within cap, before cliff, not avoid),
  // then within-cap-not-cliff, then any within-cap. Only if the cap excludes
  // everything do we fall to the least-cost rate overall (degenerate sheet).
  const pool =
    cappedClean.length ? cappedClean :
    cappedNotCliff.length ? cappedNotCliff :
    capped.length ? capped : null;

  let pick;

  switch (strategy) {
    case 'lowest_rate': {
      // Lowest rate that still lives within the hard cap.
      pick = pool ? lowestRateOf(pool)
                  : [...analyzedRates].sort((a, b) => discountPoints(a) - discountPoints(b))[0];
      break;
    }

    case 'no_cost': {
      // Borrower brings ~$0: lender credit (after margin) covers all closing costs.
      // No-cost rates are inherently within cap (zero/negative discount points).
      const covers = analyzedRates.filter(r => borrowerNetCost(r) <= 0);
      pick = covers.length ? lowestRateOf(covers) : mostCreditOf(analyzedRates);
      break;
    }

    case 'margin_cost': {
      // Middle ground: target ~1.0 borrower discount point, within cap.
      const TARGET = 1.0;
      const cand = pool || analyzedRates;
      pick = [...cand].sort((a, b) =>
        Math.abs(discountPoints(a) - TARGET) - Math.abs(discountPoints(b) - TARGET))[0];
      break;
    }

    case 'low_cost': {
      // Lowest rate where borrower discount points <= 1.0% (catches anomalies), within cap.
      const cand = (pool || analyzedRates).filter(r => discountPoints(r) <= 1.0 + CAP_EPS);
      pick = cand.length ? lowestRateOf(cand)
                         : [...(pool || analyzedRates)].sort((a, b) => discountPoints(a) - discountPoints(b))[0];
      break;
    }

    default:
      pick = pool ? lowestRateOf(pool) : mostCreditOf(analyzedRates);
  }

  // ── HARD CAP GUARD ──────────────────────────────────────────────────────
  // No strategy may ever return a rate that blows the cap when a within-cap
  // rate exists. If the pick exceeds the cap, walk UP the stack (higher rate =
  // fewer discount points) to the cheapest rate that fits under the ceiling.
  if (pick && !withinCap(pick) && capped.length) {
    // Prefer the lowest rate within cap for lowest_rate/low_cost; the
    // least-cost (most credit) within cap otherwise.
    pick = (strategy === 'lowest_rate' || strategy === 'low_cost')
      ? lowestRateOf(capped)
      : mostCreditOf(capped);
  }

  return pick || lowestRateOf(analyzedRates);
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
