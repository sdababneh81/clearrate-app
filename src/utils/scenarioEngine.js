import { calcPI, calcBreakeven, scoreRateOption } from './mortgageCalc';
import { calcTotalInterest } from './debtOptimizer';

export function generateScenarios({
  rateSheet,
  clientProfile,
  selectedDebts,
  isVeteran,
  goalType,
  selectedPrograms,
  marginBPS,
  marginDollar,
}) {
  const {
    currentBalance,
    currentRate,
    currentTermRemaining,
    estimatedValue,
    titleCharges,
    cashOutAmount,
    ficoScore,
    escrow,
    currentPI,
  } = clientProfile;

  const paidDebts = selectedDebts.filter(d => d.selected);
  const debtBalanceTotal = paidDebts.reduce((s, d) => s + (d.balance || 0), 0);
  const debtPaymentTotal = paidDebts.reduce((s, d) => s + (d.payment || 0), 0);
  const remainingDebts = selectedDebts.filter(d => !d.selected);
  const remainingPayments = remainingDebts.reduce((s, d) => s + (d.payment || 0), 0);

  const currentMortgagePI = currentPI || calcPI(currentBalance, currentRate, currentTermRemaining);
  const currentEscrow = escrow || 0;
  const currentTotalPayment = currentMortgagePI + currentEscrow + debtPaymentTotal + remainingPayments;

  const goals = goalType === 'both' ? ['rate_term', 'cash_out'] : [goalType];
  const scenarios = [];

  // Convert margin
  const marginPct = marginBPS ? marginBPS / 100 : 0;
  const marginDollarAmt = marginDollar || 0;

  for (const goal of goals) {
    const cashOut = goal === 'cash_out' ? (cashOutAmount || 0) : 0;

    // New loan = current balance + debts being paid off + title charges + cash out
    const newLoanBase = currentBalance + debtBalanceTotal + (titleCharges || 0) + cashOut;
    // Add margin dollar amount to loan if rolling in
    const newLoanAmount = newLoanBase + marginDollarAmt;
    const ltv = estimatedValue > 0 ? (newLoanAmount / estimatedValue) * 100 : 0;

    const programs = rateSheet?.programs || [];
    const filteredPrograms = programs.filter(p => {
      if (!selectedPrograms.includes(p.type)) return false;
      if (p.type === 'VA' && !isVeteran) return false;
      if (p.type === 'FHA' && ltv > 96.5) return false;
      if (p.type === 'Conventional' && ltv > 97) return false;
      return true;
    });

    const programsToRun = filteredPrograms.length > 0 ? filteredPrograms : selectedPrograms.map(type => ({
      type,
      term: 30,
      rates: clientProfile.manualRate ? [{ rate: clientProfile.manualRate, points: 0, credits: 0, adjustedRate: parseFloat(clientProfile.manualRate) + marginPct }] : [],
      isFallback: true,
    }));

    for (const program of programsToRun) {
      const rates = (program.rates || []).map(r => ({
        ...r,
        adjustedRate: (r.adjustedRate || r.rate || 0) + marginPct,
      }));
      if (rates.length === 0) continue;

      const sortedRates = [...rates].sort((a, b) => a.adjustedRate - b.adjustedRate);
      const lowestRate = sortedRates[0];
      const parRate = sortedRates.reduce((best, r) => Math.abs(r.points + r.credits) < Math.abs(best.points + best.credits) ? r : best, sortedRates[0]);
      const bestCredit = [...sortedRates].sort((a, b) => (b.credits - b.points) - (a.credits - a.points))[0];

      const options = [
        { label: 'Best Rate', desc: 'Lowest rate, higher upfront cost', ...lowestRate },
        { label: 'Par Rate', desc: 'No points, no credits', ...parRate },
        { label: 'Max Credits', desc: 'Lender credit reduces cash to close', ...bestCredit },
      ];

      const seen = new Set();
      const uniqueOptions = options.filter(o => {
        const k = (o.adjustedRate || o.rate)?.toFixed(3);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const programScenarios = uniqueOptions.map(opt => {
        const rate = opt.adjustedRate || opt.rate || 6.5;
        const newPI = calcPI(newLoanAmount, rate, 30);
        const newTotalPayment = newPI + currentEscrow + remainingPayments;
        const monthlySavings = currentTotalPayment - newTotalPayment;
        const annualSavings = monthlySavings * 12;

        // Points cost = points% of loan amount
        const pointsCost = (opt.points || 0) > 0 ? (opt.points / 100) * newLoanAmount : 0;
        const lenderCredit = (opt.credits || 0) > 0 ? (opt.credits / 100) * newLoanAmount : 0;
        const netClosingCosts = Math.max(0, (titleCharges || 0) + pointsCost - lenderCredit);
        const breakevenMonths = calcBreakeven(netClosingCosts, monthlySavings);
        const currentInterest = calcTotalInterest(currentBalance, currentRate, currentTermRemaining);
        const newInterest = calcTotalInterest(newLoanAmount, rate, 30);
        const lifetimeInterestSavings = currentInterest - newInterest;

        const scenario = {
          program: program.type,
          goal,
          optionLabel: opt.label,
          optionDesc: opt.desc,
          rate,
          points: opt.points || 0,
          credits: opt.credits || 0,
          pointsCost: Math.round(pointsCost),
          lenderCredit: Math.round(lenderCredit),
          newLoanAmount: Math.round(newLoanAmount),
          newPI: Math.round(newPI),
          newEscrow: Math.round(currentEscrow),
          newTotalPayment: Math.round(newTotalPayment),
          currentTotalPayment: Math.round(currentTotalPayment),
          monthlySavings: Math.round(monthlySavings),
          annualSavings: Math.round(annualSavings),
          fiveYearSavings: Math.round(monthlySavings * 60),
          titleCharges: titleCharges || 0,
          netClosingCosts: Math.round(netClosingCosts),
          breakevenMonths,
          lifetimeInterestSavings: Math.round(lifetimeInterestSavings),
          cashOut,
          ltv: Math.round(ltv * 10) / 10,
          isFallback: !!program.isFallback,
          debtPaymentTotal,
          remainingPayments,
          currentMortgagePI: Math.round(currentMortgagePI),
          currentEscrow: Math.round(currentEscrow),
          debtBalanceTotal: Math.round(debtBalanceTotal),
          marginBPS: marginBPS || 0,
          marginDollar: marginDollarAmt,
        };

        scenario.score = scoreRateOption(scenario);
        return scenario;
      });

      scenarios.push(...programScenarios);
    }
  }

  // Recommend best option: highest score (savings balanced against recoupment)
  const withSavings = scenarios.filter(s => s.monthlySavings > 0);
  let recommended = null;
  if (withSavings.length > 0) {
    const scored = [...withSavings].sort((a, b) => {
      // VA bonus for veterans
      const aScore = a.score + (a.program === 'VA' && isVeteran ? 200 : 0);
      const bScore = b.score + (b.program === 'VA' && isVeteran ? 200 : 0);
      return bScore - aScore;
    });
    recommended = scored[0];
  }

  return {
    scenarios,
    recommended,
    currentTotalPayment: Math.round(currentTotalPayment),
    currentMortgagePI: Math.round(currentMortgagePI),
    currentEscrow: Math.round(currentEscrow),
    debtPaymentTotal: Math.round(debtPaymentTotal),
    remainingPayments: Math.round(remainingPayments),
  };
}
