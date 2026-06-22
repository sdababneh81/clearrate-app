import { calcPI, calcBreakeven, scoreRateOption, analyzeRateStack, selectRateForStrategy } from './mortgageCalc.js';

const PROGRAMS_30YR = ['Conventional', 'VA', 'FHA'];
const PROGRAMS_15YR = ['Conventional 15yr', 'VA 15yr', 'FHA 15yr'];

/**
 * Detect ARM programs. Prefer the explicit isARM flag set by the parser; fall back
 * to sniffing the type/armType strings for older sheets that didn't carry the flag.
 */
function isARMProgram(program) {
  if (program && typeof program === 'object') {
    if (program.isARM === true) return true;
    const s = `${program.type || ''} ${program.armType || ''}`.toLowerCase();
    return /arm|\d\/\d|sofr|adjustable/.test(s);
  }
  const t = (program || '').toString().toLowerCase();
  return /arm|\d\/\d|sofr|adjustable/.test(t);
}

function baseLoanType(programType) {
  const t = (programType || '').toLowerCase();
  if (t.includes('va')) return 'va';
  if (t.includes('fha')) return 'fha';
  if (t.includes('conv')) return 'conventional';
  return 'conventional';
}

function matchProgram(sheetProgram, selectedProgram) {
  // Match by base loan type (VA/FHA/Conventional). Both fixed AND ARM programs
  // of that type match — they get split into separate fixed/ARM tabs later via
  // the isARM flag. 15-year programs are excluded unless explicitly selected.
  const t = sheetProgram.type?.toLowerCase() || '';
  const s = selectedProgram?.toLowerCase() || '';

  const sheetBase = baseLoanType(sheetProgram.type);
  const selBase = baseLoanType(selectedProgram);

  const sheetIs15 = t.includes('15');
  const selWants15 = s.includes('15');
  if (selWants15) return sheetIs15 && sheetBase === selBase;
  if (sheetIs15) return false;

  return sheetBase === selBase;
}

/** Short human-referenceable run id, e.g. CR-7F3K9Q. Stable for the life of a result. */
function makeRunRef() {
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().slice(2, 4);
  return `CR-${t}${r}`;
}

function buildScenario({
  rate, netPoints, basePoints = null, llpaHits = null, program, goal, loanAmount, termYears,
  clientProfile, selectedDebts, marginBPS, marginDollar,
  yearsInHome, isARM = false, armType = null,
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
    rate, netPoints, basePoints: basePoints ?? netPoints, llpaHits: llpaHits || null, program, goal, loanAmount: newLoanAmount, termYears, isARM, armType,
    lenderCreditPct, borrowerPaysPct, lenderCredit, pointsCost,
    debtBalanceTotal, debtPaymentTotal,
    titleCharges, lenderFees,
    netClosingCosts, newLoanAmount, newPI, oldPI,
    currentBalance, cashOut: cashOutAmount || 0,
    monthlySavings, lifetimeInterestSavings, breakevenMonths, score,
    netPointsPct: clientNetPoints,
    marginBPS: marginBPS || 0,
    strategyTag, strategyLabel, efficiencyTag, efficiencyLabel,
  };
}

/**
 * Generate scenarios for all selected pricing strategies.
 */
export function generateScenarios({
  rateSheet, clientProfile, selectedDebts, isVeteran,
  goalType, selectedPrograms, marginBPS, marginDollar,
  marginsByType = null,
  yearsInHome, maxPointsPct = 5.0,
  pricingStrategies = ['lowest_rate', 'margin_cost', 'no_cost', 'low_cost'],
  runRef = null,
}) {
  const {
    currentBalance, currentRate, currentTermRemaining,
    escrow = 0, titleCharges = 0, lenderFees = 0,
    cashOutAmount = 0, ficoScore, estimatedValue,
  } = clientProfile;

  const ref = runRef || makeRunRef();

  // Resolve the broker margin (BPS) for a program by its base loan type. Managers
  // set these centrally in Admin; the LO never sees or enters them. Falls back to
  // the legacy single marginBPS if no per-type map was provided.
  const resolveMargin = (programType) => {
    if (marginsByType && typeof marginsByType === 'object') {
      const base = baseLoanType(programType); // 'conventional' | 'fha' | 'va'
      const v = parseFloat(marginsByType[base]);
      if (Number.isFinite(v)) return v;
      const fallback = parseFloat(marginsByType.conventional);
      if (Number.isFinite(fallback)) return fallback;
    }
    return parseFloat(marginBPS) || 0;
  };

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

  const lowRateWarning = parseFloat(currentRate) < 5.5 && !selectedDebts.some(d => d.selected) && !cashOutAmount
    ? `This borrower's current rate of ${currentRate}% is well below today's market (6–7.5%). A straight rate/term refi would increase their payment. To make a refinance worthwhile, consider: (1) selecting debts to consolidate on Step 3, or (2) adding a cash-out amount.`
    : null;

  if (lowRateWarning) {
    return { scenarios: [], strategyResults: [], recommended: null, status: 'low_rate', statusReason: lowRateWarning, lowRateWarning, runRef: ref, currentRate, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments };
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
        const isArm = isARMProgram(program);
        const progMargin = resolveMargin(program.type);

        const analyzedRates = analyzeRateStack(rawRates, progMargin);

        const selected = selectRateForStrategy(
          analyzedRates, strategy, baseLoanAmount,
          parseFloat(titleCharges) || 0,
          parseFloat(lenderFees) || 0,
          progMargin,
          maxPointsPct
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
          selectedDebts, marginBPS: progMargin, marginDollar, yearsInHome,
          strategyTag: strategy,
          strategyLabel: STRATEGY_LABELS[strategy],
          efficiencyTag: selected.tag,
          efficiencyLabel: selected.tagLabel,
          isARM: isArm,
          armType: isArm ? (program.armType || program.type) : null,
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

  let status = 'ok';
  let statusReason = null;

  if (!allScenarios.length) {
    if (!programs.length) {
      status = 'no_programs';
      statusReason = 'No active rate sheet found, or the rate sheet has no programs. Upload a rate sheet in the Admin portal.';
    } else {
      status = 'no_scenarios';
      statusReason = 'No rates matched the selected loan programs. Check the selected programs and that the rate sheet covers them.';
    }
  } else {
    const anyBeneficial = allScenarios.some(s => s.monthlySavings > 0);
    if (!anyBeneficial) {
      status = 'all_negative';
      statusReason = 'Every available rate increases the monthly payment. To make this refinance worthwhile, select debts to consolidate (Step 3) or add a cash-out amount. The scenarios below are shown for reference.';
    }
  }

  // Diagnostics: did the sheet even contain ARM programs for the selected types?
  const armProgramsInSheet = programs.filter(p => isARMProgram(p)).length;

  return {
    scenarios: allScenarios,
    strategyResults,
    recommended,
    status,
    statusReason,
    lowRateWarning: null,
    runRef: ref,
    armProgramsInSheet,
    currentRate,
    currentTotalPayment,
    currentMortgagePI,
    debtPaymentTotal,
    remainingPayments,
  };
}
