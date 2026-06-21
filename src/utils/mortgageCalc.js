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
  // n = -ln(1 - r*PV/PMT) / ln(1+r)
  const val = 1 - (r * balance / monthlyPayment);
  if (val <= 0) return null;
  const n = -Math.log(val) / Math.log(1 + r);
  return Math.round(n / 12 * 10) / 10; // years rounded to 1 decimal
}

// Given balance, rate, remaining term — calculate P&I
export function calcPIFromTerm(balance, annualRate, remainingTermYears) {
  return calcPI(balance, annualRate, remainingTermYears);
}

// Calculate breakeven in months
export function calcBreakeven(netCost, monthlySavings) {
  if (!netCost || netCost <= 0) return 0;
  if (!monthlySavings || monthlySavings <= 0) return 999;
  return Math.ceil(netCost / monthlySavings);
}

// Score a rate option — balances monthly savings vs recoupment
// Higher score = better recommendation
export function scoreRateOption(scenario) {
  const { monthlySavings, breakevenMonths, netClosingCosts } = scenario;
  if (monthlySavings <= 0) return -9999;
  // Penalize long recoupment heavily — target < 24 months is ideal
  const recoupmentPenalty = breakevenMonths > 48 ? -500 :
    breakevenMonths > 36 ? -200 :
    breakevenMonths > 24 ? -50 : 0;
  // Reward monthly savings
  const savingsScore = monthlySavings * 5;
  // Reward low/no closing costs
  const costScore = Math.max(0, 200 - netClosingCosts / 100);
  return savingsScore + costScore + recoupmentPenalty;
}
