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

// Score a rate option — RECOUPMENT is the primary factor
// The question: "How many months until the borrower breaks even on their closing costs?"
// Lower recoupment = better. Monthly savings are secondary.
export function scoreRateOption(scenario) {
  const { monthlySavings, breakevenMonths, netClosingCosts, newLoanAmount } = scenario;
  if (monthlySavings <= 0) return -9999;

  // PRIMARY: Recoupment period — this is the main ranking factor
  // Ideal: under 18 months. Acceptable: under 36. Poor: over 48.
  let recoupmentScore;
  if (breakevenMonths === 0) {
    recoupmentScore = 1000; // no cost = best possible
  } else if (breakevenMonths <= 12) {
    recoupmentScore = 900;
  } else if (breakevenMonths <= 18) {
    recoupmentScore = 750;
  } else if (breakevenMonths <= 24) {
    recoupmentScore = 500;
  } else if (breakevenMonths <= 36) {
    recoupmentScore = 200;
  } else if (breakevenMonths <= 48) {
    recoupmentScore = 50;
  } else {
    recoupmentScore = -500; // over 4 years to break even = bad deal
  }

  // SECONDARY: Monthly savings (tiebreaker when recoupment is similar)
  const savingsScore = monthlySavings * 0.5;

  return recoupmentScore + savingsScore;
}

// Compare two scenarios — returns the better one based on recoupment
// Used to decide between ARM vs Fixed, or between rate options
export function betterScenario(a, b) {
  if (!a) return b;
  if (!b) return a;

  const aBreak = a.breakevenMonths || 0;
  const bBreak = b.breakevenMonths || 0;

  // If recoupment is within 3 months of each other, prefer higher monthly savings
  if (Math.abs(aBreak - bBreak) <= 3) {
    return a.monthlySavings >= b.monthlySavings ? a : b;
  }

  // Otherwise pick lower recoupment
  return aBreak <= bBreak ? a : b;
}
