import { useState, useRef } from 'react';
import { Star, TrendingDown, Clock, DollarSign, CheckCircle, AlertCircle, Printer } from 'lucide-react';

const money = v => '$' + Math.round(Math.abs(v || 0)).toLocaleString();
const pct = v => parseFloat(v).toFixed(3) + '%';

function SummaryCell({ label, value, sub, highlight }) {
  return (
    <div className={`p-4 border-r border-gray-200 last:border-r-0 ${highlight ? 'bg-green-50' : ''}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ScenarioCard({ scenario: sc, isRecommended, isSelected, onSelect }) {
  const recoupOk = !sc.breakevenMonths || sc.breakevenMonths <= 24;
  const recoupWarn = sc.breakevenMonths > 24 && sc.breakevenMonths <= 36;

  return (
    <div
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${
        isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:border-blue-300'
      } ${isRecommended ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
      onClick={() => onSelect(sc)}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3" /> AI RECOMMENDED
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-sm text-blue-800">{sc.program} {sc.isARM ? sc.armType || 'ARM' : '30yr Fixed'}</div>
          {sc.strategyLabel && <div className="text-xs text-gray-400 mt-0.5">{sc.strategyLabel}</div>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">{pct(sc.rate)}</div>
          <div className={`text-xs font-semibold mt-0.5 ${sc.borrowerPaysPct > 0 ? 'text-amber-600' : sc.lenderCreditPct > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {sc.borrowerPaysPct > 0 ? `+${sc.borrowerPaysPct?.toFixed(3)}% pts` : sc.lenderCreditPct > 0 ? `-${sc.lenderCreditPct?.toFixed(3)}% credit` : 'Par'}
          </div>
        </div>
      </div>

      {/* Points charged to client — prominent */}
      {sc.borrowerPaysPct > 0 && (
        <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-700">Discount Points</span>
          <span className="text-xs font-bold text-amber-800">{money(sc.pointsCost)} ({sc.borrowerPaysPct?.toFixed(3)}%)</span>
        </div>
      )}
      {sc.lenderCreditPct > 0 && (
        <div className="mb-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-green-700">Lender Credit</span>
          <span className="text-xs font-bold text-green-800">-{money(sc.lenderCredit)} (-{sc.lenderCreditPct?.toFixed(3)}%)</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
          <div className="text-xs text-gray-400">New P&I</div>
          <div className="font-bold text-gray-900 text-sm">{money(sc.newPI)}</div>
        </div>
        <div className="text-center bg-green-50 rounded-lg p-2 border border-green-100">
          <div className="text-xs text-gray-400">Saves/mo</div>
          <div className={`font-bold text-sm ${sc.monthlySavings > 0 ? 'text-green-700' : 'text-red-600'}`}>{sc.monthlySavings > 0 ? '+' : ''}{money(sc.monthlySavings)}</div>
        </div>
        <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
          <div className="text-xs text-gray-400">Recoup</div>
          <div className={`font-bold text-sm ${recoupOk ? 'text-green-700' : recoupWarn ? 'text-amber-600' : 'text-red-600'}`}>
            {sc.breakevenMonths === 0 ? 'Immed.' : `${sc.breakevenMonths}mo`}
          </div>
        </div>
      </div>

      {/* Efficiency tag */}
      {sc.efficiencyLabel && (
        <div className="text-xs text-center py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">{sc.efficiencyLabel}</div>
      )}
    </div>
  );
}

function LoanSummaryBar({ scenario: s, clientProfile }) {
  const cashInHand = s.cashOut > 0 ? Math.max(0, s.cashOut - s.netClosingCosts) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-gray-200">
      <SummaryCell label="Current Balance" value={money(s.currentBalance || clientProfile.currentBalance)} />
      <SummaryCell label="Debts Paid Off" value={money(s.debtBalanceTotal)} />
      <SummaryCell label="Final Loan Amount" value={money(s.newLoanAmount)} highlight />
      {s.cashOut > 0 && <SummaryCell label="Cash to Client" value={`~${money(cashInHand)}`} highlight />}
      <SummaryCell label="Recoupment" value={s.breakevenMonths === 0 ? 'Immediate' : `${s.breakevenMonths} months`} highlight={s.breakevenMonths <= 24} />
      <SummaryCell label="Total Closing Costs" value={money(s.netClosingCosts)} />
    </div>
  );
}

export default function AnalysisReport({ result, clientProfile, selectedDebts, marginBPS, marginDollar, lenderFees = 0, pricingStrategies = [], companyName = 'Priority 1 Lending' }) {
  const [activeScenario, setActiveScenario] = useState(result.recommended);
  const [activeGoalTab, setActiveGoalTab] = useState('rate_term');
  const [productTab, setProductTab] = useState('fixed');
  const [activeStrategy, setActiveStrategy] = useState(
    result.strategyResults?.length ? result.strategyResults[0].strategy : null
  );
  const printRef = useRef(null);

  const { scenarios, recommended, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments, lowRateWarning, currentRate: resultCurrentRate } = result;

  const STRATEGY_META = {
    lowest_rate: { icon: '📉', label: 'Lowest Rate', color: 'blue' },
    margin_cost: { icon: '⚖️', label: 'Margin Cost', color: 'purple' },
    no_cost:     { icon: '🎁', label: 'No Cost',     color: 'green' },
    low_cost:    { icon: '💰', label: 'Low Cost',    color: 'amber' },
  };

  const paidDebts = selectedDebts.filter(d => d.selected);
  const remainingDebts = selectedDebts.filter(d => !d.selected);

  const strategyResults = result.strategyResults || [];
  const activeStrategyResult = strategyResults.find(r => r.strategy === activeStrategy) || strategyResults[0];
  const strategyScenarios = activeStrategyResult?.scenarios || scenarios;

  const goalTabs = [...new Set(strategyScenarios.map(sc => sc.goal))];
  const visibleScenarios = strategyScenarios.filter(sc => sc.goal === activeGoalTab);
  const fixedScenarios = visibleScenarios.filter(sc => !sc.isARM);
  const armScenarios = visibleScenarios.filter(sc => sc.isARM);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head>
        <title>ClearRate — Refinance Analysis</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a2e; padding: 20px; }
          .print-header { background: #0f2d5e; color: white; padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
          .print-header h1 { font-size: 20px; font-weight: 800; }
          .print-header .sub { font-size: 11px; color: #93c5fd; margin-top: 2px; }
          .section { background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
          .section-header { background: #f8fafc; padding: 8px 14px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
          .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
          .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .cell { padding: 10px 14px; }
          .cell-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; }
          .cell-value { font-size: 18px; font-weight: 800; color: #111827; }
          .cell-sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
          .highlight { color: #16a34a !important; }
          .big-savings { font-size: 28px !important; color: #16a34a !important; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th { background: #f8fafc; padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
          td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }
          .row-total { font-weight: 700; background: #f0fdf4; }
          .text-right { text-align: right; }
          .green { color: #16a34a; font-weight: 700; }
          .amber { color: #d97706; font-weight: 700; }
          .red { color: #dc2626; font-weight: 700; }
          .blue { color: #2563eb; font-weight: 700; }
          .disclaimer { font-size: 9px; color: #9ca3af; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
          @media print { body { padding: 10px; } .no-print { display: none; } }
          .rate-big { font-size: 32px; font-weight: 900; color: #2563eb; }
          .tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
          .tag-green { background: #dcfce7; color: #16a34a; }
          .tag-amber { background: #fef3c7; color: #d97706; }
          .tag-blue { background: #dbeafe; color: #2563eb; }
          .divider { border: none; border-top: 1px solid #e5e7eb; margin: 10px 0; }
          .summary-bar { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid #e5e7eb; }
          .summary-bar .cell { border-right: 1px solid #e5e7eb; }
          .summary-bar .cell:last-child { border-right: none; }
        </style>
      </head><body>
    `);
    w.document.write(printContent.innerHTML);
    w.document.write('<div class="disclaimer">This analysis is for illustrative purposes only and is prepared by ' + companyName + '. Final loan terms are subject to underwriting approval, appraisal, and lender guidelines. Not a commitment to lend. NMLS regulated.</div>');
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  const s = activeScenario || result.recommended;
  if (!s) return (
    <div className="space-y-4 p-2">
      {(lowRateWarning || result.status === 'low_rate') ? (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📉</span>
            <div>
              <div className="font-bold text-amber-900 text-base mb-1">Low Rate Borrower — Refi Requires Justification</div>
              <div className="text-amber-800 text-sm leading-relaxed">{lowRateWarning || result.statusReason}</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2.5 border border-amber-200"><div className="font-semibold text-amber-700 mb-1">Current Rate</div><div className="text-2xl font-bold text-amber-900">{resultCurrentRate}%</div><div className="text-amber-600">Today's market: 6–7.5%</div></div>
                <div className="bg-white rounded-lg p-2.5 border border-amber-200"><div className="font-semibold text-amber-700 mb-1">Best Path Forward</div><div className="font-bold text-amber-900">Debt Consolidation</div><div className="text-amber-600">Freed payments offset higher rate</div></div>
                <div className="bg-white rounded-lg p-2.5 border border-amber-200"><div className="font-semibold text-amber-700 mb-1">Or Consider</div><div className="font-bold text-amber-900">Cash-Out + Debts</div><div className="text-amber-600">Go back to Step 3 and select debts</div></div>
              </div>
            </div>
          </div>
        </div>
      ) : result.status === 'no_programs' ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="font-bold text-red-700 mb-1">No rate sheet programs found</div>
          <div className="text-red-500 text-sm">{result.statusReason}</div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="font-bold text-amber-800 mb-1">No scenarios to display</div>
          <div className="text-amber-600 text-sm">{result.statusReason || 'Try selecting debts to consolidate on Step 3, adding a cash-out amount, or adjusting the selected loan programs.'}</div>
        </div>
      )}
    </div>
  );

  const netCashOut = s.cashOut > 0 ? Math.max(0, s.cashOut - (s.netClosingCosts || 0)) : 0;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isCardSelected = (sc) => s === sc || (s.program === sc.program && s.goal === sc.goal && s.isARM === sc.isARM && s.rate === sc.rate);
  const isCardRecommended = (sc) => sc === recommended || (sc.program === recommended?.program && sc.goal === recommended?.goal && sc.isARM === recommended?.isARM && sc.rate === recommended?.rate);

  return (
    <div className="space-y-5">

      {/* All-negative savings banner — scenarios exist but none save money */}
      {result.status === 'all_negative' && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="font-bold text-amber-900 text-sm mb-0.5">No payment savings at current settings</div>
            <div className="text-amber-700 text-xs leading-relaxed">{result.statusReason}</div>
          </div>
        </div>
      )}

      {/* Print button */}
      <div className="flex justify-end">
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      {/* Goal tabs */}
      {goalTabs.length > 1 && (
        <div className="flex gap-2">
          {goalTabs.map(g => (
            <button key={g} onClick={() => setActiveGoalTab(g)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${activeGoalTab === g ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {g === 'rate_term' ? 'Rate & Term' : 'Cash-Out'}
            </button>
          ))}
        </div>
      )}

      {/* Strategy tabs — always show when strategies selected */}
      {strategyResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pricing Strategy — Select to Compare</div>
          <div className="flex flex-wrap gap-2">
            {strategyResults.map(sr => {
              const meta = STRATEGY_META[sr.strategy] || {};
              const isActive = activeStrategy === sr.strategy;
              const rec = sr.recommended;
              const colorMap = { blue: 'border-blue-500 bg-blue-50', purple: 'border-purple-500 bg-purple-50', green: 'border-green-500 bg-green-50', amber: 'border-amber-500 bg-amber-50' };
              const activeColor = colorMap[meta.color] || 'border-blue-500 bg-blue-50';
              return (
                <button key={sr.strategy}
                  onClick={() => { setActiveStrategy(sr.strategy); setActiveScenario(sr.recommended); }}
                  className={`flex-1 min-w-[160px] text-left p-3 rounded-xl border-2 transition-all ${isActive ? activeColor : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{meta.icon}</span>
                    <span className={`text-xs font-bold ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>{meta.label}</span>
                    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-blue-500"></span>}
                  </div>
                  {rec ? (
                    <>
                      <div className="text-lg font-black text-gray-900">{rec.rate?.toFixed(3)}%</div>
                      <div className={`text-xs font-semibold mt-0.5 ${rec.lenderCreditPct > 0 ? 'text-green-600' : rec.borrowerPaysPct > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {rec.lenderCreditPct > 0 ? `-${rec.lenderCreditPct.toFixed(3)}% credit (${money(rec.lenderCredit)})` : rec.borrowerPaysPct > 0 ? `+${rec.borrowerPaysPct.toFixed(3)}% pts (${money(rec.pointsCost)})` : 'Par — no cost'}
                      </div>
                      {rec.monthlySavings > 0 && <div className="text-xs text-gray-500 mt-1">Saves ${rec.monthlySavings}/mo</div>}
                      {rec.efficiencyLabel && <div className="text-xs mt-1 text-gray-500">{rec.efficiencyLabel}</div>}
                    </>
                  ) : <div className="text-xs text-gray-400">No rate found</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scenario cards */}
      <div>
        {/* Fixed/ARM toggle */}
        <div className="bg-gray-100 rounded-xl p-1 flex gap-1 w-fit mb-4">
          <button onClick={() => setProductTab('fixed')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${productTab === 'fixed' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            📋 30-Year Fixed {fixedScenarios.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{fixedScenarios.length}</span>}
          </button>
          <button onClick={() => setProductTab('arm')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${productTab === 'arm' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            📈 ARM Options {armScenarios.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{armScenarios.length}</span>}
          </button>
        </div>

        {productTab === 'fixed' && (
          fixedScenarios.length > 0
            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fixedScenarios.map((sc, i) => <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} />)}
              </div>
            : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm text-center">No 30-year fixed options available for this strategy. Try another strategy tab above or check ARM options.</div>
        )}
        {productTab === 'arm' && (
          armScenarios.length > 0
            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {armScenarios.map((sc, i) => <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} />)}
              </div>
            : <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-400 text-sm text-center">No ARM options available.</div>
        )}
      </div>

      {/* ── PRINTABLE LOAN SUMMARY ── */}
      <div ref={printRef} id="clearrate-print">

        {/* Print Header — hidden on screen via CSS, shown on print */}
        <div className="hidden print:block mb-4 p-4 bg-[#0f2d5e] text-white rounded-xl">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xl font-black">ClearRate — Refinance Analysis</div>
              <div className="text-blue-300 text-xs mt-1">{companyName} · {today}</div>
            </div>
            <div className="text-right">
              <div className="text-blue-300 text-xs">Prepared for</div>
              <div className="font-bold">{clientProfile.borrowerName}</div>
            </div>
          </div>
        </div>

        {/* Loan Summary Header — visible on screen too */}
        <div className="bg-[#0f2d5e] text-white rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-1">{companyName} | Refinance Savings Analysis</div>
              <div className="text-xl font-black">Prepared for: {clientProfile.borrowerName || 'Borrower'}</div>
              <div className="text-blue-300 text-xs mt-1 flex items-center gap-3">
                {s.isARM ? `${s.armType || 'ARM'}` : '30-Year Fixed'}
                {s.goal === 'cash_out' ? ' · Cash-Out Refi' : ' · Rate & Term Refi'}
                {activeStrategyResult?.strategyLabel ? ` · ${activeStrategyResult.strategyLabel}` : ''}
                {s.monthlySavings > 0 && ` · Net savings before sale: +${money(s.monthlySavings * 60)}`}
              </div>
              <div className="text-blue-400 text-xs mt-0.5">{today}</div>
            </div>
            {isCardRecommended(s) && (
              <div className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" /> AI RECOMMENDED
              </div>
            )}
          </div>

          {/* LTV bar */}
          {clientProfile.estimatedValue && (
            <div className="px-5 pb-3 text-xs text-blue-400">
              LTV: {Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100)}% of {money(clientProfile.estimatedValue)} estimated value
            </div>
          )}

          {/* Key numbers row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-blue-800">
            {[
              ['PAYING NOW', money(currentTotalPayment) + '/mo', 'All current obligations', false],
              ['AFTER REFINANCE', money(s.newPI + parseFloat(clientProfile.escrow || 0)) + '/mo', `P&I: ${money(s.newPI)} + Escrow: ${money(clientProfile.escrow || 0)}`, false],
              ['MONTHLY SAVINGS', (s.monthlySavings > 0 ? '+' : '') + money(s.monthlySavings) + '/mo', `${money(s.monthlySavings * 12)}/yr · ${money(s.monthlySavings * 60)} over 5 yrs`, true],
              ...(s.cashOut > 0 ? [['CASH OUT TO CLIENT', '~' + money(netCashOut), 'Net after closing costs', true]] : []),
            ].map(([label, val, sub, green], i) => (
              <div key={i} className={`p-4 border-r border-blue-800 last:border-r-0 ${green ? 'bg-blue-800/40' : ''}`}>
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">{label}</div>
                <div className={`text-2xl font-black ${green ? 'text-green-400' : 'text-white'}`}>{val}</div>
                <div className="text-blue-400 text-xs mt-1">{sub}</div>
              </div>
            ))}
          </div>

          {/* New loan terms */}
          <div className="grid grid-cols-3 sm:grid-cols-5 border-t border-blue-800 text-center">
            {[
              ['LOAN AMOUNT', money(s.newLoanAmount)],
              ['INTEREST RATE', pct(s.rate)],
              ['TERM', s.isARM ? (s.armType || 'ARM') + ' → 30yr' : '30-Year Fixed'],
              ['P&I PAYMENT', money(s.newPI) + '/mo'],
              ['RECOUPMENT', s.breakevenMonths === 0 ? 'Immediate' : s.breakevenMonths + ' months'],
            ].map(([label, val], i) => (
              <div key={i} className="p-3 border-r border-blue-800 last:border-r-0">
                <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">{label}</div>
                <div className={`font-bold text-sm ${label === 'INTEREST RATE' ? 'text-blue-300 text-base' : 'text-white'}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Loan Balance Breakdown */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
            New Loan Balance Breakdown
          </div>
          <div className="px-4 py-3 space-y-1.5 text-sm">
            {[
              ['Current Mortgage Balance', s.currentBalance || clientProfile.currentBalance, null],
              ...(s.debtBalanceTotal > 0 ? [['Debts Being Paid Off', s.debtBalanceTotal, null]] : []),
              ['Title & Settlement Charges', s.titleCharges || parseFloat(clientProfile.titleCharges) || 0, null],
              ...((s.lenderFees || lenderFees) > 0 ? [['Lender Fees (Processing + Underwriting)', s.lenderFees || lenderFees, null]] : []),
              ...(s.cashOut > 0 ? [['Cash-Out Amount', s.cashOut, null]] : []),
              ...(s.borrowerPaysPct > 0 ? [[`Discount Points (${s.borrowerPaysPct?.toFixed(3)}% of loan)`, s.pointsCost, 'amber']] : []),
              ...(s.lenderCreditPct > 0 ? [[`Lender Credit (${s.lenderCreditPct?.toFixed(3)}% of loan)`, -s.lenderCredit, 'green']] : []),
            ].filter(([, v]) => v !== 0 && v != null).map(([label, val, color], i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-gray-100">
                <span className={color === 'amber' ? 'text-amber-700 font-semibold' : color === 'green' ? 'text-green-700 font-semibold' : 'text-gray-600'}>{label}</span>
                <span className={`font-semibold ${color === 'amber' ? 'text-amber-700' : color === 'green' ? 'text-green-700' : ''}`}>
                  {color === 'green' ? '-' : color === 'amber' ? '+' : ''}{money(Math.abs(val))}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t-2 border-gray-300">
              <span className="font-black text-gray-900">New Loan Total</span>
              <span className="font-black text-blue-700 text-base">{money(s.newLoanAmount)}</span>
            </div>
            <div className="mt-2 space-y-1 text-xs border-t border-gray-100 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Net Closing Costs</span>
                <span className={`font-bold ${s.netClosingCosts <= 0 ? 'text-green-600' : 'text-gray-800'}`}>{s.netClosingCosts <= 0 ? '-' : ''}{money(Math.abs(s.netClosingCosts))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recoupment period</span>
                <span className={`font-bold ${s.breakevenMonths <= 24 ? 'text-green-700' : s.breakevenMonths <= 36 ? 'text-amber-700' : 'text-red-700'}`}>
                  {s.breakevenMonths === 0 ? 'Immediate' : `${s.breakevenMonths} months`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* LO-only: Internal Price Stack — not for client */}
        {marginBPS > 0 && (() => {
          const brokerMarginPct = (parseFloat(marginBPS) || 0) / 100;
          const baseNetPoints = (s.netPointsPct ?? 0) - brokerMarginPct;
          const marginDollarAmt = Math.round(brokerMarginPct / 100 * s.newLoanAmount);
          const yspEarned = marginDollar ? parseFloat(marginDollar) : marginDollarAmt;
          const loan = s.newLoanAmount;

          return (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden shadow-sm no-print">
              <div className="bg-[#1e3a5f] px-4 py-2.5 flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-blue-200 flex items-center gap-2">
                  🔒 Internal Pricing & Compensation — Not for Client
                </div>
                <div className="text-xs text-blue-400">{s.program} · {s.rate?.toFixed(3)}% · {s.isARM ? (s.armType || 'ARM') : '30-Year Fixed'}</div>
              </div>

              {/* Quick summary tiles */}
              <div className="grid grid-cols-3 gap-3 p-4 border-b border-blue-200">
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">Rate</div>
                  <div className="text-2xl font-black text-gray-900">{s.rate?.toFixed(3)}%</div>
                  <div className="text-xs text-gray-400">{s.isARM ? (s.armType || 'ARM') : '30-yr Fixed'}</div>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">YSP Earned</div>
                  <div className="text-2xl font-black text-green-700">{money(yspEarned)}</div>
                  <div className="text-xs text-gray-400">{marginBPS} BPS on {money(loan)}</div>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">Net to Client</div>
                  <div className={`text-2xl font-black ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {s.lenderCreditPct > 0 ? `-${money(s.lenderCredit)}` : s.borrowerPaysPct > 0 ? `+${money(s.pointsCost)}` : '$0'}
                  </div>
                  <div className="text-xs text-gray-400">{s.lenderCreditPct > 0 ? 'credit to client' : s.borrowerPaysPct > 0 ? 'points charged' : 'par — no cost'}</div>
                </div>
              </div>

              {/* Full price stack table */}
              <div className="p-4">
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Full Price Stack</div>
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-50 border-b border-blue-100">
                        <th className="text-left px-4 py-2 text-xs font-bold text-blue-600 uppercase">Item</th>
                        <th className="text-right px-4 py-2 text-xs font-bold text-blue-600 uppercase">Points %</th>
                        <th className="text-right px-4 py-2 text-xs font-bold text-blue-600 uppercase">Dollar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Base price */}
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-2.5 text-gray-700 font-medium">
                          Base Price (rate sheet — 30-day lock)
                          <div className="text-xs text-gray-400 font-normal">before LLPA adjustments</div>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${(s.basePoints ?? baseNetPoints) <= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {(s.basePoints ?? baseNetPoints) <= 0 ? '' : '+'}{(s.basePoints ?? baseNetPoints).toFixed(3)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs ${(s.basePoints ?? baseNetPoints) <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {(s.basePoints ?? baseNetPoints) <= 0 ? '-' : '+'}{money(Math.abs((s.basePoints ?? baseNetPoints) / 100 * loan))}
                        </td>
                      </tr>

                      {/* LLPA hits — from parsed rate sheet */}
                      {(s.llpaHits?.length > 0) ? s.llpaHits.map((hit, i) => (
                        <tr key={i} className="border-b border-orange-50 bg-orange-50">
                          <td className="px-4 py-2 text-orange-800 text-xs font-semibold">⚡ LLPA: {hit.description}</td>
                          <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${hit.hit <= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                            {hit.hit <= 0 ? '' : '+'}{hit.hit.toFixed(3)}%
                          </td>
                          <td className={`px-4 py-2 text-right font-mono text-xs ${hit.hit <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                            {hit.hit <= 0 ? '-' : '+'}{money(Math.abs(hit.hit / 100 * loan))}
                          </td>
                        </tr>
                      )) : (() => {
                        const llpaTotal = baseNetPoints - (s.basePoints ?? baseNetPoints);
                        return llpaTotal !== 0 ? (
                          <tr className="border-b border-orange-50 bg-orange-50">
                            <td className="px-4 py-2 text-orange-800 text-xs font-semibold">
                              ⚡ LLPA Adjustments (FICO {clientProfile?.ficoScore}, LTV ~{clientProfile?.estimatedValue ? Math.round((parseFloat(clientProfile.currentBalance) / parseFloat(clientProfile.estimatedValue)) * 100) : '?'}%, {s.goal === 'cash_out' ? 'Cash-Out' : 'Rate/Term'})
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${llpaTotal <= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                              {llpaTotal <= 0 ? '' : '+'}{llpaTotal.toFixed(3)}%
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs ${llpaTotal <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              {llpaTotal <= 0 ? '-' : '+'}{money(Math.abs(llpaTotal / 100 * loan))}
                            </td>
                          </tr>
                        ) : null;
                      })()}

                      {/* Net lender price subtotal */}
                      <tr className="border-b-2 border-blue-200 bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800 font-bold text-xs uppercase tracking-wide">Net Lender Price (after all LLPAs)</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${baseNetPoints <= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                          {baseNetPoints <= 0 ? '' : '+'}{baseNetPoints.toFixed(3)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${baseNetPoints <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {baseNetPoints <= 0 ? '-' : '+'}{money(Math.abs(baseNetPoints / 100 * loan))}
                        </td>
                      </tr>

                      {/* Broker margin */}
                      <tr className="border-b border-amber-100 bg-amber-50">
                        <td className="px-4 py-2.5 text-amber-800 font-semibold">
                          Broker Margin ({marginBPS} BPS)
                          <div className="text-xs text-amber-600 font-normal">your compensation — added to price</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">+{brokerMarginPct.toFixed(3)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-amber-600">+{money(marginDollarAmt)}</td>
                      </tr>

                      {/* Points charged to customer */}
                      {s.borrowerPaysPct > 0 && (
                        <tr className="border-b border-red-100 bg-red-50">
                          <td className="px-4 py-2.5 text-red-800 font-semibold">
                            Discount Points Charged to Client ({s.borrowerPaysPct.toFixed(3)}%)
                            <div className="text-xs text-red-600 font-normal">rolled into loan or paid at closing</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-red-700">+{s.borrowerPaysPct.toFixed(3)}%</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-red-600">+{money(s.pointsCost)}</td>
                        </tr>
                      )}

                      {/* Final client price */}
                      <tr className="bg-blue-50">
                        <td className="px-4 py-3 text-blue-900 font-black">
                          Final Client Price
                          <div className="text-xs font-normal text-blue-600">
                            {s.lenderCreditPct > 0 ? 'credit applied toward closing costs' : s.borrowerPaysPct > 0 ? 'discount points charged to borrower' : 'par — no cost to borrower, no credit'}
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-black text-lg ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-red-600' : 'text-blue-700'}`}>
                          {s.lenderCreditPct > 0 ? `-${s.lenderCreditPct.toFixed(3)}%` : s.borrowerPaysPct > 0 ? `+${s.borrowerPaysPct.toFixed(3)}%` : '0.000%'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-black text-base ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-red-600' : 'text-blue-700'}`}>
                          {s.lenderCreditPct > 0 ? `-${money(s.lenderCredit)}` : s.borrowerPaysPct > 0 ? `+${money(s.pointsCost)}` : '$0'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Narrative */}
                <div className="mt-3 bg-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">Price build:</span> UWM sheet at <span className="font-bold">{s.rate?.toFixed(3)}%</span> → base price <span className="font-bold">{(s.basePoints ?? baseNetPoints) <= 0 ? `${Math.abs(s.basePoints ?? baseNetPoints).toFixed(3)}% credit` : `${(s.basePoints ?? baseNetPoints).toFixed(3)}% cost`}</span> → after LLPAs: <span className="font-bold">{baseNetPoints <= 0 ? `${Math.abs(baseNetPoints).toFixed(3)}% credit` : `${baseNetPoints.toFixed(3)}% cost`}</span> → add <span className="font-bold">{marginBPS} BPS margin</span> → client gets <span className="font-bold">{s.lenderCreditPct > 0 ? `${s.lenderCreditPct.toFixed(3)}% credit (${money(s.lenderCredit)})` : s.borrowerPaysPct > 0 ? `charged ${s.borrowerPaysPct.toFixed(3)}% points (${money(s.pointsCost)})` : 'par'}</span>. YSP: <span className="font-bold text-green-800">{money(yspEarned)}</span>.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Debts paid off */}
        {paidDebts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">Debts Paid Off at Closing</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Creditor</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Balance</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Mo. Payment</th>
                </tr>
              </thead>
              <tbody>
                {paidDebts.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-2 text-gray-500">{d.type}</td>
                    <td className="px-4 py-2 text-right">{money(d.balance)}</td>
                    <td className="px-4 py-2 text-right text-green-700 font-semibold">-{money(d.payment)}/mo</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-2.5" colSpan={2}>Total Eliminated</td>
                  <td className="px-4 py-2.5 text-right">{money(s.debtBalanceTotal)}</td>
                  <td className="px-4 py-2.5 text-right text-green-700">-{money(debtPaymentTotal + currentMortgagePI)}/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-xs text-gray-400 text-center py-2">
          This analysis is for illustrative purposes only. Final loan terms are subject to underwriting approval. Prepared by {companyName}.
        </div>

      </div>{/* end printRef */}
    </div>
  );
}
