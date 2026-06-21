/**
 * Mortgage calculation utilities
 */

export function calcPI(balance, annualRate, termYears) {
  if (!balance || !annualRate || !termYears) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return balance / n;
  return balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
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
 * Score a rate option using a time-horizon-aware multi-factor model.
 *
 * When yearsInHome is provided, the scoring window = min(yearsInHome, 30).
 * This means a client selling in 2 years will heavily favor lender credits
 * over a lower rate that requires points they'll never recoup.
 *
 * Factors (weighted):
 *   1. Horizon Net Savings (50%) — total savings over the planning horizon minus closing costs
 *      THE most important number: what does the borrower actually pocket before they sell?
 *   2. Monthly Payment Reduction (25%) — immediate cash flow improvement
 *   3. Recoupment Period vs Horizon (15%) — does recoupment fit within their window?
 *   4. Lifetime Interest Savings (10%) — long-term wealth (weighted less when horizon is short)
 */
export function scoreRateOption(scenario, yearsInHome = null) {
  const {
    monthlySavings = 0,
    breakevenMonths = 0,
    netClosingCosts = 0,
    lifetimeInterestSavings = 0,
  } = scenario;

  if (monthlySavings <= 0) return -9999;

  // Planning horizon in months — default 5yr if not specified
  const horizonMonths = yearsInHome ? Math.min(yearsInHome * 12, 360) : 60;

  // 1. Horizon net savings — what the borrower pockets before they sell (or 5yr default)
  const horizonNet = (monthlySavings * horizonMonths) - netClosingCosts;
  // Normalize: max expected horizon net scales with horizon length
  const maxHorizonNet = monthlySavings > 0 ? monthlySavings * horizonMonths : 30000;
  const horizonScore = Math.min(100, Math.max(0, (horizonNet / Math.max(maxHorizonNet, 1)) * 100));

  // 2. Monthly savings — normalized, max ~$600
  const savingsScore = Math.min(100, (monthlySavings / 600) * 100);

  // 3. Recoupment relative to horizon
  // If recoupment > horizon, this option costs money — heavily penalize
  // If recoupment <= horizon, score by how quickly within the window
  let recoupScore;
  if (breakevenMonths === 0) {
    recoupScore = 100;
  } else if (yearsInHome && breakevenMonths > horizonMonths) {
    // Won't recoup before selling — negative score
    recoupScore = -50;
  } else {
    const recoupRatio = horizonMonths > 0 ? breakevenMonths / horizonMonths : 1;
    if (recoupRatio <= 0.1)      recoupScore = 95;
    else if (recoupRatio <= 0.2) recoupScore = 85;
    else if (recoupRatio <= 0.4) recoupScore = 70;
    else if (recoupRatio <= 0.6) recoupScore = 50;
    else if (recoupRatio <= 0.8) recoupScore = 30;
    else                         recoupScore = 10;
  }

  // 4. Lifetime interest savings — normalized, max ~$200k
  // Weight reduced when horizon is short (client won't capture lifetime savings)
  const lifetimeScore = Math.min(100, Math.max(0, (lifetimeInterestSavings / 200000) * 100));
  const lifetimeWeight = yearsInHome && yearsInHome <= 5 ? 0.05 : 0.10;
  const horizonWeight = yearsInHome && yearsInHome <= 5 ? 0.55 : 0.50;
  const savingsWeight = 0.25;
  const recoupWeight = yearsInHome ? 0.20 : 0.15;

  // Normalize weights to sum to 1
  const totalWeight = horizonWeight + savingsWeight + recoupWeight + lifetimeWeight;

  const score = (
    horizonScore  * (horizonWeight / totalWeight) +
    savingsScore  * (savingsWeight / totalWeight) +
    recoupScore   * (recoupWeight  / totalWeight) +
    lifetimeScore * (lifetimeWeight / totalWeight)
  );

  return Math.round(score * 10) / 10;
}

export function betterScenario(a, b, yearsInHome = null) {
  if (!a) return b;
  if (!b) return a;
  return (scoreRateOption(a, yearsInHome) >= scoreRateOption(b, yearsInHome)) ? a : b;
}
