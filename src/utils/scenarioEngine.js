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

  // Margin logic:
  // marginBPS is YOUR yield spread — it gets added to the rate the borrower pays
  // But we find the best combination of:
  //   A) Lender credits to offset closing costs (lower BPS = lender pays more)
  //   B) Borrower paying points to buy down rate further
  //   C) Par rate with margin rolled in
  // The goal is max monthly savings within acceptable recoupment
  const marginPct = marginBPS ? marginBPS / 100 : 0;
  const marginDollarAmt = marginDollar || 0;

  for (const goal of goals) {
    const cashOut = goal === 'cash_out' ? (cashOutAmount || 0) : 0;

    const newLoanBase = currentBalance + debtBalanceTotal + (titleCharges || 0) + cashOut;
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
      // Apply margin to each rate option
      // marginPct added to rate = borrower's rate (our yield)
      // We then evaluate ALL rate options including:
      //   - rates where borrower pays points (negative credits = cost)
      //   - rates where lender pays credits (positive credits = lender pays closing)
      //   - par rates (zero points/credits)
      const rates = (program.rates || []).map(r => ({
        ...r,
        adjustedRate: (r.adjustedRate || r.rate || 0) + marginPct,
      }));
      if (rates.length === 0) continue;

      // CRITICAL: Only show rates that actually make sense for this borrower
      // Filter out rates higher than their current rate (no benefit)
      // Exception: if current rate is very low (< 4%), still show best available
      const maxBeneficialRate = currentRate > 4 ? currentRate - 0.125 : 8.5;
      const beneficialRates = rates.filter(r => r.adjustedRate <= maxBeneficialRate);
      
      // If no beneficial rates found, skip this program
      if (beneficialRates.length === 0) continue;

      const sortedRates = [...beneficialRates].sort((a, b) => a.adjustedRate - b.adjustedRate);

      // Build comprehensive option set:
      // 1. Lowest rate (borrower may pay points — max savings, longer recoup)
      // 2. Par/near-par rate (no cost to either side)
      // 3. Max lender credit (borrower pays nothing, shorter recoup)
      // 4. BEST VALUE: optimal combo considering margin BPS and recoupment
      const lowestRate = sortedRates[0];
      const parRate = sortedRates.reduce((best, r) => 
        Math.abs((r.points || 0) + (r.credits || 0)) < Math.abs((best.points || 0) + (best.credits || 0)) ? r : best, 
        sortedRates[0]
      );
      const maxCreditRate = [...sortedRates].sort((a, b) => 
        ((b.credits || 0) - (b.points || 0)) - ((a.credits || 0) - (a.points || 0))
      )[0];

      // Find the SMART PICK: best savings within 30-month recoupment window
      // This accounts for: borrower paying points to buy down rate vs lender paying credits
      const smartPick = sortedRates.reduce((best, r) => {
        const ratePI = calcPI(newLoanAmount, r.adjustedRate, 30);
        const savings = currentTotalPayment - (ratePI + currentEscrow + remainingPayments);
        if (savings <= 0) return best;
        const pointsCost = (r.points || 0) > 0 ? (r.points / 100) * newLoanAmount : 0;
        const credit = (r.credits || 0) > 0 ? (r.credits / 100) * newLoanAmount : 0;
        const net = Math.max(0, (titleCharges || 0) + pointsCost - credit);
        const breakeven = net > 0 ? Math.ceil(net / savings) : 0;
        // Score: maximize savings, penalize breakeven > 30 months
        const score = savings * 5 - (breakeven > 30 ? (breakeven - 30) * 20 : 0);
        
        if (!best || score > best.score) return { ...r, score };
        return best;
      }, null);

      const options = [
        { label: 'Best Rate', desc: 'Lowest rate — borrower may pay points', ...lowestRate },
        { label: 'Par Rate', desc: 'No points, no lender credits', ...parRate },
        { label: 'Max Credits', desc: 'Lender credit covers closing costs', ...maxCreditRate },
      ];

      // Add smart pick if different from above
      if (smartPick) {
        const isDuplicate = options.some(o => Math.abs((o.adjustedRate) - (smartPick.adjustedRate)) < 0.001);
        if (!isDuplicate) {
          options.push({ label: 'Smart Pick', desc: 'Best savings vs. recoupment balance', ...smartPick });
        }
      }

      // Deduplicate by rate
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
          newLoanBase: Math.round(newLoanBase),
          currentBalance: Math.round(currentBalance),
          debtBalanceTotal: Math.round(debtBalanceTotal),
          titleCharges: Math.round(titleCharges || 0),
          marginDollar: Math.round(marginDollarAmt),
          cashOut,
          newPI: Math.round(newPI),
          newEscrow: Math.round(currentEscrow),
          newTotalPayment: Math.round(newTotalPayment),
          currentTotalPayment: Math.round(currentTotalPayment),
          monthlySavings: Math.round(monthlySavings),
          annualSavings: Math.round(annualSavings),
          fiveYearSavings: Math.round(monthlySavings * 60),
          netClosingCosts: Math.round(netClosingCosts),
          breakevenMonths,
          lifetimeInterestSavings: Math.round(lifetimeInterestSavings),
          ltv: Math.round(ltv * 10) / 10,
          isFallback: !!program.isFallback,
          debtPaymentTotal,
          remainingPayments,
          currentMortgagePI: Math.round(currentMortgagePI),
          currentEscrow: Math.round(currentEscrow),
          marginBPS: marginBPS || 0,
        };

        scenario.score = scoreRateOption(scenario);
        return scenario;
      });

      scenarios.push(...programScenarios);
    }
  }

  // Recommend best: highest score, VA preferred for veterans
  const withSavings = scenarios.filter(s => s.monthlySavings > 0);
  let recommended = null;
  if (withSavings.length > 0) {
    const scored = [...withSavings].sort((a, b) => {
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
