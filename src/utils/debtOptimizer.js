/**
 * ClearRate Debt Optimizer
 * Analyzes each tradeline and recommends whether to pay it off at closing
 */

export function analyzeDebt(debt, newMortgageRate, newTermYears = 30) {
  const { balance, payment, type } = debt;
  if (!balance || balance <= 0 || !payment || payment <= 0) {
    return { recommendation: 'neutral', score: 0, reason: 'Insufficient data', costToRoll: 0, remainingCost: 0, netBenefit: 0 };
  }

  const paymentToBalanceRatio = (payment / balance) * 100;

  // Cost to roll this debt into the 30yr mortgage
  const monthlyRate = newMortgageRate / 100 / 12;
  const nPayments = newTermYears * 12;
  const mortgagePaymentOnDebt = monthlyRate > 0
    ? balance * monthlyRate * Math.pow(1 + monthlyRate, nPayments) / (Math.pow(1 + monthlyRate, nPayments) - 1)
    : balance / nPayments;
  const costToRoll = mortgagePaymentOnDebt * nPayments - balance; // total interest added

  // Estimate remaining cost of keeping debt as-is (assume ~48mo avg remaining for revolving, actual for installment)
  const estMonthsRemaining = type === 'Student Loan' ? 120 : type === 'Auto' ? 36 : Math.ceil(balance / payment) + 6;
  const remainingCost = payment * estMonthsRemaining - balance;
  const netBenefit = remainingCost - costToRoll; // positive = better to roll in

  let recommendation, reason, badge;

  // Student loan — always warn
  if (type === 'Student Loan' || type === 'Education') {
    recommendation = 'caution';
    badge = 'caution';
    reason = `Rolling student loans into a mortgage removes income-based repayment options and potential forgiveness eligibility. Converts unsecured debt to debt secured against your home.`;
    return { recommendation, badge, score: 20, reason, costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
  }

  // Auto with very low remaining balance
  if (type === 'Auto' && estMonthsRemaining <= 24) {
    recommendation = 'not_recommended';
    badge = 'not_recommended';
    reason = `Auto loan appears nearly paid off (~${estMonthsRemaining}mo remaining). Rolling in $${balance.toLocaleString()} adds ~$${Math.round(costToRoll).toLocaleString()} in mortgage interest vs ~$${Math.round(Math.max(0,remainingCost)).toLocaleString()} remaining on current terms.`;
    return { recommendation, badge, score: 15, reason, costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
  }

  // Low payment-to-balance ratio — not efficient to roll in
  if (paymentToBalanceRatio < 1.0) {
    recommendation = 'not_recommended';
    badge = 'not_recommended';
    reason = `Payment-to-balance ratio is ${paymentToBalanceRatio.toFixed(1)}% — very low. Rolling $${balance.toLocaleString()} into the mortgage adds ~$${Math.round(costToRoll).toLocaleString()} in 30yr interest vs ~$${Math.round(Math.max(0,remainingCost)).toLocaleString()} remaining if paid normally. Net cost: +$${Math.round(costToRoll - Math.max(0,remainingCost)).toLocaleString()}.`;
    return { recommendation, badge, score: 25, reason, costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
  }

  // Borderline — moderate ratio
  if (paymentToBalanceRatio >= 1.0 && paymentToBalanceRatio < 1.8) {
    recommendation = 'consider';
    badge = 'consider';
    reason = `Borderline efficiency (${paymentToBalanceRatio.toFixed(1)}% ratio). Rolling in adds ~$${Math.round(costToRoll).toLocaleString()} in mortgage interest. Worth including if DTI reduction is needed for qualification.`;
    return { recommendation, badge, score: 55, reason, costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
  }

  // High ratio revolving — recommend payoff
  if (paymentToBalanceRatio >= 1.8) {
    recommendation = 'recommended';
    badge = 'recommended';
    reason = `High payment-to-balance ratio (${paymentToBalanceRatio.toFixed(1)}%) — efficient to eliminate. Paying off removes $${payment}/mo from DTI and rolls in a relatively small balance. Net savings vs keeping: ~$${Math.round(Math.max(0, remainingCost - costToRoll)).toLocaleString()}.`;
    return { recommendation, badge, score: 90, reason, costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
  }

  return { recommendation: 'neutral', badge: 'neutral', score: 50, reason: 'Review individually with client.', costToRoll, remainingCost, netBenefit, paymentToBalanceRatio };
}

export function calcPI(balance, annualRate, termYears) {
  if (!balance || !annualRate || !termYears || balance <= 0 || annualRate <= 0 || termYears <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  return balance * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

export function calcTotalInterest(balance, annualRate, termYears) {
  const monthly = calcPI(balance, annualRate, termYears);
  return monthly * termYears * 12 - balance;
}

export function calcBreakeven(closingCosts, monthlySavings) {
  if (!monthlySavings || monthlySavings <= 0) return null;
  return Math.ceil(closingCosts / monthlySavings);
}

export function calcDTI(monthlyDebts, monthlyIncome) {
  if (!monthlyIncome || monthlyIncome <= 0) return null;
  return (monthlyDebts / monthlyIncome) * 100;
}

export const BADGE_CONFIG = {
  recommended: { label: '✓ Recommended', color: 'bg-green-100 text-green-800 border-green-300' },
  consider:    { label: '~ Consider', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  caution:     { label: '⚠ Caution', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  not_recommended: { label: '✗ Not Recommended', color: 'bg-red-100 text-red-800 border-red-300' },
  neutral:     { label: '— Review', color: 'bg-gray-100 text-gray-600 border-gray-300' },
};
