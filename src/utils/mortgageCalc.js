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
  const CLIFF_THRESHOLD = 0.50;  // pts per 0.125% — cliff if step exceeds this
  const GOOD_THRESHOLD = 0.35;   // pts per 0.125% — good value below this
  const MARGINAL_THRESHOLD = 0.50; // pts per 0.125% — marginal below this

  // Apply margin, sort highest rate first
  const sorted = rates
    .map(r => ({
      ...r,
      clientPoints: r.netPoints + marginPct,
      adjustedRate: parseFloat(r.rate),
    }))
    .filter(r => r.adjustedRate > 0)
    .sort((a, b) => b.adjustedRate - a.adjustedRate);

  if (!sorted.length) return [];

  // Find anchor = rate with best (most negative) client points
  const anchor = sorted.reduce((best, r) =>
    r.clientPoints < best.clientPoints ? r : best, sorted[0]);

  // First pass: compute step and cumulative efficiency
  const withEff = sorted.map((r, i) => {
    const stepEff = i === 0 ? null : (() => {
      const prev = sorted[i - 1];
      const delta = r.clientPoints - prev.clientPoints;
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

  // Second pass: detect cliffs and assign zones
  let inCliff = false;
  let cliffCount = 0;

  return withEff.map((r, i) => {
    // Cliff detection: step efficiency > threshold AND it's a large jump
    const isCliff = r.stepEff !== null && r.stepEff > CLIFF_THRESHOLD;
    if (isCliff) { inCliff = true; cliffCount++; }

    // Zone assignment based on cumulative efficiency
    const eff = r.cumEff ?? r.stepEff;
    let zone, tag, tagLabel, tagColor;

    if (r.isAnchor) {
      zone = 'A'; tag = 'anchor'; tagLabel = '🏆 Best Credit'; tagColor = 'blue';
    } else if (r.adjustedRate > anchor.adjustedRate) {
      zone = 'A'; tag = 'normal'; tagLabel = ''; tagColor = 'gray';
    } else if (eff === null) {
      zone = 'B'; tag = 'normal'; tagLabel = ''; tagColor = 'gray';
    } else if (eff < 0) {
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '⚡ Pricing Anomaly — Take It'; tagColor = 'purple';
    } else if (eff <= 0.20) {
      zone = 'B'; tag = 'sweetspot_strong'; tagLabel = '🟢 Strong Value'; tagColor = 'green';
    } else if (eff <= GOOD_THRESHOLD) {
      zone = 'B'; tag = 'sweetspot'; tagLabel = '✅ Good Value'; tagColor = 'green';
    } else if (cliffCount >= 1 && inCliff) {
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Past Cliff'; tagColor = 'red';
    } else if (eff <= MARGINAL_THRESHOLD) {
      zone = 'B'; tag = 'marginal'; tagLabel = '🟡 Marginal'; tagColor = 'yellow';
    } else {
      zone = 'C'; tag = 'avoid'; tagLabel = '🔴 Overpriced'; tagColor = 'red';
    }

    return { ...r, zone, tag, tagLabel, tagColor, isCliff, cliffCount };
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
export function selectRateForStrategy(analyzedRates, strategy, newLoanAmount, titleCharges, lenderFees, marginBPS) {
  const marginPct = marginBPS / 100;
  const totalFixedCosts = (titleCharges || 0) + (lenderFees || 0);

  // Only work with rates that aren't in the "avoid" zone
  const candidates = analyzedRates.filter(r => r.tag !== 'avoid' || strategy === 'no_cost');

  switch (strategy) {
    case 'lowest_rate': {
      // Lowest rate in Zone B (good value) — stop before cliff
      const zoneBRates = analyzedRates.filter(r =>
        (r.zone === 'B' || r.zone === 'A') && r.tag !== 'avoid'
      );
      if (!zoneBRates.length) return null;
      return zoneBRates.reduce((lowest, r) =>
        r.adjustedRate < lowest.adjustedRate ? r : lowest, zoneBRates[0]);
    }

    case 'margin_cost': {
      // Find rate where lender credit ≈ broker margin dollar + title + lender fees
      // i.e., netClosingCosts ≈ 0
      const target = candidates.map(r => {
        const lenderCredit = r.clientPoints < 0 ? Math.abs(r.clientPoints / 100) * newLoanAmount : 0;
        const pointsCost = r.clientPoints > 0 ? (r.clientPoints / 100) * newLoanAmount : 0;
        const netCost = totalFixedCosts + pointsCost - lenderCredit;
        return { ...r, netCostDollar: netCost, absDist: Math.abs(netCost) };
      });
      // Pick the rate closest to $0 net cost, preferring slightly negative (credit)
      return target.reduce((best, r) => {
        if (!best) return r;
        // Prefer rates where netCost is just below $0 (small credit)
        if (r.netCostDollar <= 0 && best.netCostDollar > 0) return r;
        if (r.netCostDollar <= 0 && best.netCostDollar <= 0) {
          // Both credits — pick lower rate (better for client)
          return r.adjustedRate < best.adjustedRate ? r : best;
        }
        return r.absDist < best.absDist ? r : best;
      }, null);
    }

    case 'low_cost': {
      // Lowest rate where borrower pays ≤ 1% of loan in points
      const maxPoints = newLoanAmount * 0.01;
      const eligible = candidates.filter(r => {
        const pointsCost = r.clientPoints > 0 ? (r.clientPoints / 100) * newLoanAmount : 0;
        return pointsCost <= maxPoints;
      });
      if (!eligible.length) return candidates[candidates.length - 1]; // fallback lowest
      return eligible.reduce((lowest, r) =>
        r.adjustedRate < lowest.adjustedRate ? r : lowest, eligible[0]);
    }

    case 'no_cost': {
      // Rate with best lender credit that covers title + lender fees
      // Must generate enough credit to cover all fixed costs
      const nocostRates = analyzedRates.filter(r => {
        const lenderCredit = r.clientPoints < 0 ? Math.abs(r.clientPoints / 100) * newLoanAmount : 0;
        return lenderCredit >= totalFixedCosts;
      });
      if (!nocostRates.length) {
        // No rate covers everything — pick one with highest credit
        return analyzedRates.reduce((best, r) =>
          r.clientPoints < best.clientPoints ? r : best, analyzedRates[0]);
      }
      // Among no-cost rates, pick lowest rate (best for client)
      return nocostRates.reduce((lowest, r) =>
        r.adjustedRate < lowest.adjustedRate ? r : lowest, nocostRates[0]);
    }

    default:
      return candidates[0];
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
