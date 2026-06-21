/**
 * Mortgage calculation utilities
 */

// Calculate monthly P&I payment
export function calcPI(balance, annualRate, termYears) {
  if (!balance || !annualRate || !termYears) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return balance / n;
  return balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Reverse engineer remaining term from balance, rate, and payment
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
 * Score a rate option using a balanced multi-factor model.
 *
 * Philosophy: The "best" option is NOT always zero-cost recoupment.
 * A 7% rate with lender credit (0-month recoup) is worse than 6.5% with
 * a 6-month recoup if the borrower saves $200/mo more for 30 years.
 *
 * Factors (weighted):
 *   1. 5-Year Net Savings (40%) — total savings over 60 months minus closing costs
 *      This is the most honest single number: what does the borrower actually pocket?
 *   2. Monthly Payment Reduction (30%) — immediate cash flow improvement
 *   3. Recoupment Period (20%) — how fast does the borrower break even
 *   4. Lifetime Interest Savings (10%) — long-term wealth impact
 *
 * Recoupment is a FACTOR, not the boss. A 0-month recoup still gets full
 * recoupment points, but a 6-month recoup with much higher savings can
 * still outscore it on the other 80% of the model.
 */
export function scoreRateOption(scenario) {
  const {
    monthlySavings = 0,
    breakevenMonths = 0,
    netClosingCosts = 0,
    lifetimeInterestSavings = 0,
  } = scenario;

  if (monthlySavings <= 0) return -9999;

  // 1. Five-year net savings (dollars) — normalized to a 0-100 scale
  // Assume max meaningful 5yr savings ~$30,000 for normalization
  const fiveYearNet = (monthlySavings * 60) - netClosingCosts;
  const fiveYearScore = Math.min(100, Math.max(0, (fiveYearNet / 30000) * 100));

  // 2. Monthly savings — normalized, max ~$600 for normalization
  const savingsScore = Math.min(100, (monthlySavings / 600) * 100);

  // 3. Recoupment — 0 to 100 (lower is better)
  // 0mo = 100, 6mo = 90, 12mo = 75, 24mo = 50, 36mo = 20, 48mo+ = 0
  let recoupScore;
  if (breakevenMonths === 0)       recoupScore = 100;
  else if (breakevenMonths <= 6)   recoupScore = 90;
  else if (breakevenMonths <= 12)  recoupScore = 75;
  else if (breakevenMonths <= 18)  recoupScore = 60;
  else if (breakevenMonths <= 24)  recoupScore = 45;
  else if (breakevenMonths <= 36)  recoupScore = 25;
  else if (breakevenMonths <= 48)  recoupScore = 10;
  else                             recoupScore = 0;

  // 4. Lifetime interest savings — normalized, max ~$200k
  const lifetimeScore = Math.min(100, Math.max(0, (lifetimeInterestSavings / 200000) * 100));

  // Weighted composite
  const score = (
    fiveYearScore    * 0.40 +
    savingsScore     * 0.30 +
    recoupScore      * 0.20 +
    lifetimeScore    * 0.10
  );

  return Math.round(score * 10) / 10;
}

export function betterScenario(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (scoreRateOption(a) >= scoreRateOption(b)) ? a : b;
}
