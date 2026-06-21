import { calcPI, calcBreakeven, scoreRateOption } from './mortgageCalc';
import { calcTotalInterest } from './debtOptimizer';

/**
 * MARGIN LOGIC:
 * Broker margin (BPS) is earned as yield spread premium (YSP).
 * It does NOT get added to the note rate shown to the borrower.
 * Instead, the margin is SUBTRACTED from the lender credit (or added to points cost).
 * 
 * Example: 200 BPS margin, rate 6.000% with -0.305 net lender credit
 * → After margin: -0.305 - 2.00 = -2.305 → lender now pays 2.305% to broker
 * → Borrower still gets 6.000% rate
 * → Net to borrower: 6.000% with 0 lender credit (margin consumed the credit)
 * 
 * If margin exceeds available credit, borrower pays remaining difference as points.
 */

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

  // Margin is earned from lender — it reduces lender credit or increases points
  // NOT added to the note rate
  const marginPct = marginBPS ? marginBPS / 100 : 0;

  for (const goal of goals) {
    const cashOut = goal === 'cash_out' ? (cashOutAmount || 0) : 0;
    const newLoanBase = currentBalance + debtBalanceTotal + (titleCharges || 0) + cashOut;
    const newLoanAmount = newLoanBase; // margin dollar is not rolled into balance
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
      rates: clientProfile.manualRate ? [{
        rate: parseFloat(clientProfile.manualRate),
        netPoints: 0,
        adjustedRate: parseFloat(clientProfile.manualRate),
      }] : [],
      isFallback: true,
    }));

    for (const program of programsToRun) {
      const rawRates = program.rates || [];
      if (rawRates.length === 0) continue;

      // Normalize rate objects — handle both old and new format
      const normalizedRates = rawRates.map(r => {
        // netPoints: negative = lender credit, positive = borrower pays
        let netPoints;
        if (r.netPoints !== undefined) {
          netPoints = r.netPoints;
        } else {
          // Old format: points (borrower pays) and credits (lender pays) are separate positive numbers
          netPoints = (r.points || 0) - (r.credits || 0);
        }

        // Apply broker margin: margin reduces the lender's payment to us
        // This means we take it from the credit side
        // netPointsAfterMargin = netPoints + marginPct
        // (if lender was paying us -1.0%, and we want 2%, borrower now pays +1.0%)
        const netPointsAfterMargin = netPoints + marginPct;

        return {
          rate: r.rate,
          adjustedRate: r.adjustedRate || r.rate, // rate stays the same — margin doesn't change note rate
          netPoints,
          netPointsAfterMargin,
          // For display:
          borrowerPays: Math.max(0, netPointsAfterMargin),  // positive = borrower pays points
          lenderCredit: Math.max(0, -netPointsAfterMargin), // negative = lender credit to borrower
          isARM: program.isARM || false,
          armType: program.armType || null,
        };
      });

      // Filter: only show rates that save money vs current rate
      // For very low current rates (< 4%), show best available anyway
      const maxBeneficialRate = currentRate > 4.5 ? currentRate - 0.125 : 8.5;
      const beneficialRates = normalizedRates.filter(r => r.adjustedRate <= maxBeneficialRate);
      if (beneficialRates.length === 0) continue;

      const sortedRates = [...beneficialRates].sort((a, b) => a.adjustedRate - b.adjustedRate);

      // Build option set:
      // 1. Lowest rate (max monthly savings, may require points)
      const lowestRate = sortedRates[0];
      // 2. Best lender credit (least cash to close, slightly higher rate)
      const maxCreditRate = [...sortedRates].sort((a, b) => b.lenderCredit - a.lenderCredit)[0];
      // 3. Near-par (closest to zero net cost after margin)
      const parRate = sortedRates.reduce((best, r) =>
        Math.abs(r.netPointsAfterMargin) < Math.abs(best.netPointsAfterMargin) ? r : best,
        sortedRates[0]
      );
      // 4. Smart pick: best recoupment-adjusted savings
      const smartPick = sortedRates.reduce((best, r) => {
        const ratePI = calcPI(newLoanAmount, r.adjustedRate, 30);
        const savings = currentTotalPayment - (ratePI + currentEscrow + remainingPayments);
        if (savings <= 0) return best;
        const pointsCostDollar = r.borrowerPays > 0 ? (r.borrowerPays / 100) * newLoanAmount : 0;
        const creditDollar = r.lenderCredit > 0 ? (r.lenderCredit / 100) * newLoanAmount : 0;
        const netCost = Math.max(0, (titleCharges || 0) + pointsCostDollar - creditDollar);
        const breakeven = netCost > 0 ? Math.ceil(netCost / savings) : 0;
        const score = savings * 5 - (breakeven > 24 ? (breakeven - 24) * 15 : 0);
        if (!best || score > best._score) return { ...r, _score: score };
        return best;
      }, null);

      const candidates = [
        { ...lowestRate, label: 'Best Rate', desc: 'Lowest rate — may require points' },
        { ...parRate, label: 'Near Par', desc: 'Minimal cost to close' },
        { ...maxCreditRate, label: 'Max Credits', desc: 'Lender credit covers closing costs' },
        ...(smartPick ? [{ ...smartPick, label: 'Smart Pick', desc: 'Best savings vs. payback period' }] : []),
      ];

      // Deduplicate by rate
      const seen = new Set();
      const uniqueOptions = candidates.filter(o => {
        const k = o.adjustedRate?.toFixed(3);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const programScenarios = uniqueOptions.map(opt => {
        const rate = opt.adjustedRate;
        const newPI = calcPI(newLoanAmount, rate, 30);
        const newTotalPayment = newPI + currentEscrow + remainingPayments;
        const monthlySavings = currentTotalPayment - newTotalPayment;

        const pointsCostDollar = opt.borrowerPays > 0 ? Math.round((opt.borrowerPays / 100) * newLoanAmount) : 0;
        const creditDollar = opt.lenderCredit > 0 ? Math.round((opt.lenderCredit / 100) * newLoanAmount) : 0;
        const netClosingCosts = Math.max(0, (titleCharges || 0) + pointsCostDollar - creditDollar);
        const breakevenMonths = calcBreakeven(netClosingCosts, monthlySavings);

        const currentInterest = calcTotalInterest(currentBalance, currentRate, currentTermRemaining);
        const newInterest = calcTotalInterest(newLoanAmount, rate, 30);

        const scenario = {
          program: program.type,
          isARM: opt.isARM || false,
          armType: opt.armType || null,
          goal,
          optionLabel: opt.label,
          optionDesc: opt.desc,
          rate,
          netPointsPct: opt.netPointsAfterMargin,
          borrowerPaysPct: opt.borrowerPays,
          lenderCreditPct: opt.lenderCredit,
          pointsCost: pointsCostDollar,
          lenderCredit: creditDollar,
          marginBPS: marginBPS || 0,
          marginEarned: Math.round((marginPct / 100) * newLoanAmount * 100),
          newLoanAmount: Math.round(newLoanAmount),
          currentBalance: Math.round(currentBalance),
          debtBalanceTotal: Math.round(debtBalanceTotal),
          titleCharges: Math.round(titleCharges || 0),
          cashOut,
          newPI: Math.round(newPI),
          newEscrow: Math.round(currentEscrow),
          newTotalPayment: Math.round(newTotalPayment),
          currentTotalPayment: Math.round(currentTotalPayment),
          monthlySavings: Math.round(monthlySavings),
          annualSavings: Math.round(monthlySavings * 12),
          fiveYearSavings: Math.round(monthlySavings * 60),
          netClosingCosts: Math.round(netClosingCosts),
          breakevenMonths,
          lifetimeInterestSavings: Math.round(currentInterest - newInterest),
          ltv: Math.round(ltv * 10) / 10,
          isFallback: !!program.isFallback,
          debtPaymentTotal,
          remainingPayments,
          currentMortgagePI: Math.round(currentMortgagePI),
          currentEscrow: Math.round(currentEscrow),
        };

        scenario.score = scoreRateOption(scenario);
        return scenario;
      }).filter(s => s.monthlySavings > 0);

      scenarios.push(...programScenarios);
    }
  }

  // If no ARM scenarios were generated but we have fixed ones, create estimated ARM options
  const hasARM = scenarios.some(s => s.isARM);
  const hasFixed = scenarios.some(s => !s.isARM);
  
  if (!hasARM && hasFixed) {
    // Generate estimated 5/6 and 7/6 ARM scenarios based on typical ARM discount vs 30yr fixed
    // ARM rates are typically 0.5-1.0% lower than 30yr fixed at same points
    const fixedScenarios = scenarios.filter(s => !s.isARM);
    const bestFixed = fixedScenarios.sort((a, b) => b.score - a.score)[0];
    
    if (bestFixed) {
      const armTypes = [
        { type: '5/6 SOFR ARM', rateDiscount: 0.75, desc: 'Fixed 5 yrs, adjusts every 6 mo' },
        { type: '7/6 SOFR ARM', rateDiscount: 0.5, desc: 'Fixed 7 yrs, adjusts every 6 mo' },
      ];
      
      for (const arm of armTypes) {
        const armRate = Math.round((bestFixed.rate - arm.rateDiscount) * 1000) / 1000;
        if (armRate <= 0) continue;
        const goal = bestFixed.goal;
        const newLoanAmount = bestFixed.newLoanAmount;
        const newPI = calcPI(newLoanAmount, armRate, 30);
        const currentEscrow = bestFixed.currentEscrow;
        const remainingPayments = bestFixed.remainingPayments;
        const newTotalPayment = newPI + currentEscrow + remainingPayments;
        const monthlySavings = bestFixed.currentTotalPayment - newTotalPayment;
        if (monthlySavings <= 0) continue;
        
        const netClosingCosts = bestFixed.titleCharges || 0; // assume par pricing for ARM estimate
        const breakevenMonths = calcBreakeven(netClosingCosts, monthlySavings);
        
        scenarios.push({
          ...bestFixed,
          isARM: true,
          armType: arm.type,
          optionLabel: 'Best Rate',
          optionDesc: arm.desc + ' — estimated pricing',
          rate: armRate,
          borrowerPaysPct: 0,
          lenderCreditPct: 0,
          pointsCost: 0,
          lenderCredit: 0,
          netClosingCosts,
          breakevenMonths,
          newPI: Math.round(newPI),
          newTotalPayment: Math.round(newTotalPayment),
          monthlySavings: Math.round(monthlySavings),
          annualSavings: Math.round(monthlySavings * 12),
          fiveYearSavings: Math.round(monthlySavings * 60),
          isFallback: true,
          score: scoreRateOption({ monthlySavings, breakevenMonths, netClosingCosts }),
        });
      }
    }
  }

  // Recommend best
  let recommended = null;
  if (scenarios.length > 0) {
    const scored = [...scenarios].sort((a, b) => {
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
