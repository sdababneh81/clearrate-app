import { calcPI, calcBreakeven, scoreRateOption, analyzeRateStack, selectRateForStrategy } from './mortgageCalc.js';

const PROGRAMS_30YR = ['Conventional', 'VA', 'FHA'];
const PROGRAMS_15YR = ['Conventional 15yr', 'VA 15yr', 'FHA 15yr'];

function isARMProgram(programType) {
  const t = (programType || '').toLowerCase();
  return t.includes('arm') || t.includes('5/6') || t.includes('7/6') || t.includes('10/6') || t.includes('sofr');
}

function matchProgram(sheetProgram, selectedProgram) {
  const t = sheetProgram.type?.toLowerCase() || '';
  const s = selectedProgram?.toLowerCase() || '';
  
  // Never match ARM programs to fixed-rate selections
  const isArm = isARMProgram(sheetProgram.type);
  
  if (s.includes('arm')) return isArm;
  if (isArm) return false; // ARM program won't match fixed selections
  
  if (s.includes('15') || s.includes('15yr')) {
    return (t.includes('15') || t.includes('15yr')) && (
      (s.includes('va') && t.includes('va')) ||
      (s.includes('fha') && t.includes('fha')) ||
      (s.includes('conv') && (t.includes('conv') || t.includes('conventional')))
    );
  }
  if (t.includes('15') || t.includes('15yr')) return false;
  if (s === 'va') return t.includes('va');
  if (s === 'fha') return t.includes('fha');
  if (s === 'conventional') return t.includes('conv') || t.includes('conventional');
  return false;
}

function buildScenario({
  rate, netPoints, basePoints = null, llpaHits = null, program, goal, loanAmount, termYears,
  clientProfile, selectedDebts, marginBPS, marginDollar,
  yearsInHome, isARM = false, armInfo = null,
  strategyTag = null, strategyLabel = null, efficiencyTag = null, efficiencyLabel = null,
}) {
  const {
    currentBalance, currentRate, currentTermRemaining,
    escrow = 0, titleCharges = 0, lenderFees = 0, cashOutAmount = 0,
  } = clientProfile;

  const marginPct = (marginBPS || 0) / 100;
  const clientNetPoints = netPoints + marginPct;

  const lenderCreditPct = clientNetPoints < 0 ? Math.abs(clientNetPoints) : 0;
  const borrowerPaysPct = clientNetPoints > 0 ? clientNetPoints : 0;

  const lenderCredit = Math.round((lenderCreditPct / 100) * loanAmount);
  const pointsCost = Math.round((borrowerPaysPct / 100) * loanAmount);

  const debtBalanceTotal = selectedDebts.filter(d => d.selected).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
  const debtPaymentTotal = selectedDebts.filter(d => d.selected).reduce((s, d) => s + (parseFloat(d.payment) || 0), 0);

  const netClosingCosts = Math.round(titleCharges + lenderFees + pointsCost - lenderCredit);
  const newLoanAmount = Math.round(currentBalance + debtBalanceTotal + titleCharges + lenderFees + (cashOutAmount || 0) + pointsCost - lenderCredit);

  const newPI = calcPI(newLoanAmount, rate, termYears);
  const oldPI = calcPI(currentBalance, currentRate, currentTermRemaining);
  const monthlySavings = Math.round((oldPI + parseFloat(debtPaymentTotal) + (parseFloat(escrow) || 0)) - (newPI + (parseFloat(escrow) || 0)));
  const lifetimeInterestSavings = Math.round((oldPI * (currentTermRemaining * 12)) - (newPI * (termYears * 12)));
  const breakevenMonths = calcBreakeven(netClosingCosts, monthlySavings);

  const score = scoreRateOption({ monthlySavings, breakevenMonths, netClosingCosts, lifetimeInterestSavings }, yearsInHome);

  return {
    rate, netPoints, basePoints: basePoints ?? netPoints, llpaHits: llpaHits || null, program, goal, loanAmount: newLoanAmount, termYears, isARM, armInfo,
    lenderCreditPct, borrowerPaysPct, lenderCredit, pointsCost,
    debtBalanceTotal, debtPaymentTotal,
    titleCharges, lenderFees,
    netClosingCosts, newLoanAmount, newPI, oldPI,
    currentBalance, cashOut: cashOutAmount || 0,
    monthlySavings, lifetimeInterestSavings, breakevenMonths, score,
    netPointsPct: clientNetPoints,
    strategyTag, strategyLabel, efficiencyTag, efficiencyLabel,
  };
}

/**
 * Generate scenarios for all selected pricing strategies.
 * Returns { strategyResults, recommended, lowRateWarning, currentRate, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments }
 * 
 * strategyResults: array of { strategy, strategyLabel, scenarios, recommended }
 * For backward compatibility, also returns flat scenarios array.
 */
export function generateScenarios({
  rateSheet, clientProfile, selectedDebts, isVeteran,
  goalType, selectedPrograms, marginBPS, marginDollar,
  yearsInHome, maxPointsPct = 5.0,
  pricingStrategies = ['lowest_rate', 'margin_cost', 'no_cost', 'low_cost'],
}) {
  const {
    currentBalance, currentRate, currentTermRemaining,
    escrow = 0, titleCharges = 0, lenderFees = 0,
    cashOutAmount = 0, ficoScore, estimatedValue,
  } = clientProfile;

  const STRATEGY_LABELS = {
    lowest_rate: '📉 Lowest Rate',
    margin_cost: '⚖️ Margin Cost',
    no_cost:     '🎁 No Cost',
    low_cost:    '💰 Low Cost',
  };

  const currentMortgagePI = calcPI(currentBalance, currentRate, currentTermRemaining);
  const debtPaymentTotal = selectedDebts.filter(d => d.selected).reduce((s, d) => s + (parseFloat(d.payment) || 0), 0);
  const currentTotalPayment = Math.round(currentMortgagePI + debtPaymentTotal + (parseFloat(escrow) || 0));
  const remainingPayments = Math.round((currentTermRemaining || 30) * 12);

  // Low rate warning
  const lowRateWarning = parseFloat(currentRate) < 5.5 && !selectedDebts.some(d => d.selected) && !cashOutAmount
    ? `This borrower's current rate of ${currentRate}% is well below today's market (6–7.5%). A straight rate/term refi would increase their payment. To make a refinance worthwhile, consider: (1) selecting debts to consolidate on Step 3, or (2) adding a cash-out amount.`
    : null;

  if (lowRateWarning) {
    return { scenarios: [], strategyResults: [], recommended: null, lowRateWarning, currentRate, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments };
  }

  const goals = goalType === 'both' ? ['rate_term', 'cash_out'] : [goalType];
  const programs = rateSheet?.programs || [];

  const allScenarios = [];
  const strategyResults = [];

  for (const strategy of pricingStrategies) {
    const strategyScenarios = [];

    for (const goal of goals) {
      const cashOut = goal === 'cash_out' ? (parseFloat(cashOutAmount) || 0) : 0;
      const debtBalanceTotal = selectedDebts.filter(d => d.selected).reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
      const baseLoanAmount = parseFloat(currentBalance) + debtBalanceTotal + (parseFloat(titleCharges) || 0) + (parseFloat(lenderFees) || 0) + cashOut;

      const matchedPrograms = programs.filter(p =>
        selectedPrograms.some(sp => matchProgram(p, sp))
      );

      if (!matchedPrograms.length) {
        // Manual rate fallback
        if (clientProfile.manualRate) {
          const rate = parseFloat(clientProfile.manualRate);
          const sc = buildScenario({
            rate, netPoints: 0, program: 'Manual Rate', goal,
            loanAmount: baseLoanAmount, termYears: 30,
            clientProfile: { ...clientProfile, cashOutAmount: cashOut },
            selectedDebts, marginBPS, marginDollar, yearsInHome,
            strategyTag: strategy, strategyLabel: STRATEGY_LABELS[strategy],
          });
          if (sc.monthlySavings > 0) strategyScenarios.push(sc);
        }
        continue;
      }

      for (const program of matchedPrograms) {
        const rawRates = program.rates || [];
        if (!rawRates.length) continue;

        const term = program.type?.includes('15') ? 15 : 30;
        const isArm = isARMProgram(program.type);

        // Analyze the rate stack for this program
        const analyzedRates = analyzeRateStack(rawRates, marginBPS);

        // Select the best rate for this strategy
        const selected = selectRateForStrategy(
          analyzedRates, strategy, baseLoanAmount,
          parseFloat(titleCharges) || 0,
          parseFloat(lenderFees) || 0,
          marginBPS
        );

        if (!selected) continue;

        const sc = buildScenario({
          rate: selected.adjustedRate,
          netPoints: selected.netPoints,
          basePoints: selected.basePoints ?? selected.netPoints,
          llpaHits: rateSheet?.borrowerLLPAs || null,
          program: program.type,
          goal, loanAmount: baseLoanAmount, termYears: term,
          clientProfile: { ...clientProfile, cashOutAmount: cashOut },
          selectedDebts, marginBPS, marginDollar, yearsInHome,
          strategyTag: strategy,
          strategyLabel: STRATEGY_LABELS[strategy],
          efficiencyTag: selected.tag,
          efficiencyLabel: selected.tagLabel,
          isARM: isArm,
          armType: isArm ? program.type : null,
        });

        if (sc.monthlySavings > -9999) strategyScenarios.push(sc);
      }
    }

    if (strategyScenarios.length) {
      const best = strategyScenarios.reduce((b, s) => s.score > b.score ? s : b, strategyScenarios[0]);
      strategyResults.push({
        strategy,
        strategyLabel: STRATEGY_LABELS[strategy],
        scenarios: strategyScenarios,
        recommended: best,
      });
      allScenarios.push(...strategyScenarios);
    }
  }

  const recommended = allScenarios.length
    ? allScenarios.reduce((b, s) => s.score > b.score ? s : b, allScenarios[0])
    : null;

  return {
    scenarios: allScenarios,
    strategyResults,
    recommended,
    lowRateWarning: null,
    currentRate,
    currentTotalPayment,
    currentMortgagePI,
    debtPaymentTotal,
    remainingPayments,
  };
}


