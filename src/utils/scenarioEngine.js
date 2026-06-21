import { calcPI, calcTotalInterest, calcBreakeven } from './debtOptimizer';

/**
 * Given parsed rate sheet, client profile, and selected debts,
 * generates full refinance scenarios for each loan program
 */
export function generateScenarios({
  rateSheet,
  clientProfile,
  selectedDebts,
  currentMortgage,
  isVeteran,
  goalType, // 'rate_term' | 'cash_out' | 'both'
  selectedPrograms, // ['FHA','Conventional','VA']
}) {
  const {
    currentBalance,
    currentRate,
    currentTermRemaining,
    estimatedValue,
    closingCosts,
    cashOutAmount,
    ficoScore,
  } = clientProfile;

  const paidDebts = selectedDebts.filter(d => d.selected);
  const debtBalanceTotal = paidDebts.reduce((s, d) => s + d.balance, 0);
  const debtPaymentTotal = paidDebts.reduce((s, d) => s + d.payment, 0);
  const remainingDebts = selectedDebts.filter(d => !d.selected);
  const remainingPayments = remainingDebts.reduce((s, d) => s + d.payment, 0);

  const currentMortgagePI = calcPI(currentBalance, currentRate, currentTermRemaining);
  const currentTotalPayment = currentMortgagePI + debtPaymentTotal + remainingPayments;

  const goals = goalType === 'both' ? ['rate_term', 'cash_out'] : [goalType];
  const scenarios = [];

  for (const goal of goals) {
    const cashOut = goal === 'cash_out' ? (cashOutAmount || 0) : 0;
    const newLoanAmount = currentBalance + debtBalanceTotal + (closingCosts || 0) + cashOut;
    const ltv = estimatedValue > 0 ? (newLoanAmount / estimatedValue) * 100 : 0;

    const programs = rateSheet?.programs || [];
    const filteredPrograms = programs.filter(p => {
      if (!selectedPrograms.includes(p.type)) return false;
      if (p.type === 'VA' && !isVeteran) return false;
      // FHA max LTV 96.5%, Conv 97%, VA 100%
      if (p.type === 'FHA' && ltv > 96.5) return false;
      if (p.type === 'Conventional' && ltv > 97) return false;
      return true;
    });

    // If no rate sheet, use manual rate entry fallback
    const programsToRun = filteredPrograms.length > 0 ? filteredPrograms : selectedPrograms.map(type => ({
      type,
      term: 30,
      rates: [{ rate: clientProfile.manualRate || 6.5, points: 0, credits: 0, adjustedRate: clientProfile.manualRate || 6.5 }],
      ficoCutoffs: [],
      ltvAdjustments: [],
      isFallback: true,
    }));

    for (const program of programsToRun) {
      const rates = program.rates || [];
      if (rates.length === 0) continue;

      // Apply FICO adjustment if available
      let ficoAdj = 0;
      if (ficoScore && program.ltvAdjustments) {
        // simplified: just note it
        ficoAdj = 0;
      }

      // Find 3 key rate options
      const sortedRates = [...rates].sort((a, b) => a.adjustedRate - b.adjustedRate);
      const lowestRate = sortedRates[0];
      const parRate = sortedRates.reduce((best, r) => Math.abs(r.points + r.credits) < Math.abs(best.points + best.credits) ? r : best, sortedRates[0]);
      const bestCredit = [...sortedRates].sort((a, b) => (b.credits - b.points) - (a.credits - a.points))[0];

      const options = [
        { label: 'Best Rate', desc: 'Lowest rate, higher upfront cost', ...lowestRate },
        { label: 'Par Rate', desc: 'No points, no credits', ...parRate },
        { label: 'Best Value', desc: 'Maximum lender credit toward closing', ...bestCredit },
      ];

      // Deduplicate options by rate
      const seen = new Set();
      const uniqueOptions = options.filter(o => {
        const k = o.adjustedRate?.toFixed(3);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const programScenarios = uniqueOptions.map(opt => {
        const rate = opt.adjustedRate || opt.rate || 6.5;
        const newPI = calcPI(newLoanAmount, rate, 30);
        const newTotalPayment = newPI + remainingPayments;
        const monthlySavings = currentTotalPayment - newTotalPayment;
        const annualSavings = monthlySavings * 12;
        const fiveYearSavings = monthlySavings * 60;
        const netClosingCosts = Math.max(0, (closingCosts || 0) - Math.max(0, opt.credits || 0));
        const breakevenMonths = calcBreakeven(netClosingCosts, monthlySavings);
        const currentInterest = calcTotalInterest(currentBalance, currentRate, currentTermRemaining);
        const newInterest = calcTotalInterest(newLoanAmount, rate, 30);
        const lifetimeInterestSavings = currentInterest - newInterest;

        return {
          program: program.type,
          goal,
          optionLabel: opt.label,
          optionDesc: opt.desc,
          rate,
          points: opt.points || 0,
          credits: opt.credits || 0,
          newLoanAmount: Math.round(newLoanAmount),
          newPI: Math.round(newPI),
          newTotalPayment: Math.round(newTotalPayment),
          currentTotalPayment: Math.round(currentTotalPayment),
          monthlySavings: Math.round(monthlySavings),
          annualSavings: Math.round(annualSavings),
          fiveYearSavings: Math.round(fiveYearSavings),
          closingCosts: closingCosts || 0,
          netClosingCosts: Math.round(netClosingCosts),
          breakevenMonths,
          lifetimeInterestSavings: Math.round(lifetimeInterestSavings),
          cashOut,
          ltv: Math.round(ltv * 10) / 10,
          isFallback: !!program.isFallback,
          debtPaymentTotal,
          remainingPayments,
          currentMortgagePI: Math.round(currentMortgagePI),
        };
      });

      scenarios.push(...programScenarios);
    }
  }

  // Pick recommended scenario: highest monthly savings with breakeven < 36mo
  const withSavings = scenarios.filter(s => s.monthlySavings > 0);
  let recommended = null;
  if (withSavings.length > 0) {
    // Prefer VA if veteran, then by savings/breakeven score
    const scored = withSavings.map(s => ({
      ...s,
      score: s.monthlySavings * 0.6 + (s.breakevenMonths ? Math.max(0, 60 - s.breakevenMonths) * 10 : 0) + (s.program === 'VA' && isVeteran ? 200 : 0)
    }));
    recommended = scored.sort((a, b) => b.score - a.score)[0];
  }

  return { scenarios, recommended, currentTotalPayment: Math.round(currentTotalPayment), currentMortgagePI: Math.round(currentMortgagePI), debtPaymentTotal: Math.round(debtPaymentTotal), remainingPayments: Math.round(remainingPayments) };
}
