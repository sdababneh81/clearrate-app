import { useState } from 'react';
import { Star, TrendingDown, Clock, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';

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
  const recoupBad = sc.breakevenMonths > 36;

  return (
    <div
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${
        isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:border-blue-300'
      } ${isRecommended ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
      onClick={() => onSelect(sc)}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3" /> RECOMMENDED
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-sm text-blue-800">{sc.program} {sc.isARM ? sc.armType || 'ARM' : '30yr Fixed'}</div>
          <div className="text-xs text-gray-500 mt-0.5">{sc.optionLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">{pct(sc.rate)}</div>
          <div className="text-xs text-gray-500">
            {sc.borrowerPaysPct > 0 ? `+${sc.borrowerPaysPct?.toFixed(3)} pts` : sc.lenderCreditPct > 0 ? `${sc.lenderCreditPct?.toFixed(3)} credit` : 'Par'}
          </div>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-white rounded-lg p-1.5 text-center border border-gray-100">
          <div className="text-xs text-gray-400">P&I</div>
          <div className="font-bold text-blue-700 text-xs">{money(sc.newPI)}</div>
        </div>
        <div className="bg-white rounded-lg p-1.5 text-center border border-gray-100">
          <div className="text-xs text-gray-400">Escrow</div>
          <div className="font-bold text-gray-600 text-xs">{sc.newEscrow > 0 ? money(sc.newEscrow) : '—'}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-1.5 text-center border border-blue-100">
          <div className="text-xs text-gray-400">Total</div>
          <div className="font-bold text-blue-800 text-xs">{money(sc.newTotalPayment)}</div>
        </div>
      </div>
      {/* Monthly savings */}
      <div className={`rounded-lg p-2 text-center border mb-2 ${sc.monthlySavings > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
        <div className="text-xs text-gray-500">Monthly savings vs today</div>
        <div className={`font-bold text-sm ${sc.monthlySavings > 0 ? 'text-green-700' : 'text-red-700'}`}>
          {sc.monthlySavings > 0 ? '+' : ''}{money(sc.monthlySavings)}/mo
        </div>
      </div>

      {/* Recoupment + Closing Costs */}
      {(() => {
        const horizon = sc.yearsInHome ? sc.yearsInHome * 12 : null;
        const wontRecoup = horizon && sc.breakevenMonths > 0 && sc.breakevenMonths > horizon;
        const recoupColor = wontRecoup ? 'bg-red-50 border-red-200' : recoupOk ? 'bg-green-50 border-green-200' : recoupWarn ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
        const recoupTextColor = wontRecoup ? 'text-red-700' : recoupOk ? 'text-green-700' : recoupWarn ? 'text-amber-700' : 'text-red-700';
        const clockColor = wontRecoup ? 'text-red-500' : recoupOk ? 'text-green-600' : recoupWarn ? 'text-amber-600' : 'text-red-600';
        return (
          <div className={`rounded-lg px-3 py-2 flex items-center justify-between text-xs border ${recoupColor}`}>
            <div className="flex items-center gap-1.5">
              <Clock className={`w-3 h-3 ${clockColor}`} />
              <span className={`font-semibold ${recoupTextColor}`}>
                {sc.breakevenMonths === 0 ? 'No cost' : wontRecoup ? `⚠️ ${sc.breakevenMonths}mo — won't recoup` : `${sc.breakevenMonths}mo recoup`}
              </span>
            </div>
            <span className="text-gray-600">Closing: {money(sc.netClosingCosts)}</span>
          </div>
        );
      })()}
      {/* Horizon savings */}
      {sc.yearsInHome && (
        <div className="mt-1.5 rounded-lg px-3 py-1.5 bg-blue-50 border border-blue-100 text-xs flex justify-between">
          <span className="text-blue-600">Net savings in {sc.yearsInHome} yrs</span>
          <span className={`font-bold ${sc.horizonNet >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
            {sc.horizonNet >= 0 ? '+' : ''}{money(sc.horizonNet)}
          </span>
        </div>
      )}

      {/* Points / Credits detail */}
      {(sc.borrowerPaysPct > 0 || sc.lenderCreditPct > 0) && (
        <div className="mt-2 text-xs text-center text-gray-400">
          {sc.borrowerPaysPct > 0 && `Borrower pays ${money(sc.pointsCost)} in points`}
          {sc.lenderCreditPct > 0 && `Lender credit: ${money(sc.lenderCredit)}`}
        </div>
      )}
    </div>
  );
}

// Bottom summary bar shown on every scenario
function LoanSummaryBar({ scenario: s, clientProfile }) {
  const estValue = parseFloat(clientProfile.estimatedValue) || 0;
  const cashInHand = s.cashOut > 0 ? Math.max(0, s.cashOut - s.netClosingCosts) : 0;

  return (
    <div className="bg-[#0f2d5e] text-white rounded-2xl p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-blue-300 mb-3">Loan Summary</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <div className="bg-white/10 rounded-lg p-2.5">
          <div className="text-blue-300 text-xs mb-1">Current Balance</div>
          <div className="font-bold">{money(s.currentBalance || clientProfile.currentBalance)}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-2.5">
          <div className="text-blue-300 text-xs mb-1">Debts Paid Off</div>
          <div className="font-bold">{money(s.debtBalanceTotal)}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-2.5">
          <div className="text-blue-300 text-xs mb-1">Final Loan Amount</div>
          <div className="font-bold text-yellow-300">{money(s.newLoanAmount)}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-2.5">
          <div className="text-blue-300 text-xs mb-1">Cash to Client</div>
          <div className={`font-bold ${cashInHand > 0 ? 'text-green-300' : 'text-gray-300'}`}>
            {cashInHand > 0 ? money(cashInHand) : '—'}
          </div>
        </div>
        <div className={`rounded-lg p-2.5 ${!s.breakevenMonths || s.breakevenMonths <= 24 ? 'bg-green-600/40' : s.breakevenMonths <= 36 ? 'bg-amber-600/40' : 'bg-red-600/40'}`}>
          <div className="text-blue-300 text-xs mb-1">Recoupment</div>
          <div className="font-bold">{s.breakevenMonths === 0 ? 'Immediate' : `${s.breakevenMonths} months`}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-2.5">
          <div className="text-blue-300 text-xs mb-1">Total Closing Costs</div>
          <div className="font-bold">{money(s.netClosingCosts)}</div>
          {s.borrowerPaysPct > 0 && <div className="text-yellow-300 text-xs">incl. {s.borrowerPaysPct?.toFixed(2)}% pts</div>}
          {s.lenderCreditPct > 0 && <div className="text-green-300 text-xs">-{s.lenderCreditPct?.toFixed(2)}% credit</div>}
        </div>
      </div>
      {estValue > 0 && (
        <div className="mt-2 text-xs text-blue-400 text-right">
          LTV: {((s.newLoanAmount / estValue) * 100).toFixed(1)}% of {money(estValue)} estimated value
        </div>
      )}
    </div>
  );
}

export default function AnalysisReport({ result, clientProfile, selectedDebts, marginBPS, marginDollar, lenderFees = 0, pricingStrategies = [], companyName = 'Priority 1 Lending' }) {
  const [activeScenario, setActiveScenario] = useState(result.recommended);
  const [activeGoalTab, setActiveGoalTab] = useState('rate_term');
  const [productTab, setProductTab] = useState('fixed'); // 'fixed' | 'arm'
  const [activeStrategy, setActiveStrategy] = useState(
    result.strategyResults?.length ? result.strategyResults[0].strategy : null
  );

  const { scenarios, recommended, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments, lowRateWarning, currentRate: resultCurrentRate } = result;

  const STRATEGY_META = {
    lowest_rate: { icon: '📉', label: 'Lowest Rate', color: 'blue' },
    margin_cost: { icon: '⚖️', label: 'Margin Cost', color: 'purple' },
    no_cost:     { icon: '🎁', label: 'No Cost',     color: 'green' },
    low_cost:    { icon: '💰', label: 'Low Cost',    color: 'amber' },
  };

  const paidDebts = selectedDebts.filter(d => d.selected);
  const remainingDebts = selectedDebts.filter(d => !d.selected);

  // Strategy-aware scenario filtering
  const strategyResults = result.strategyResults || [];
  const activeStrategyResult = strategyResults.find(r => r.strategy === activeStrategy) || strategyResults[0];
  const strategyScenarios = activeStrategyResult?.scenarios || scenarios;

  const goalTabs = [...new Set(strategyScenarios.map(s => s.goal))];
  const visibleScenarios = strategyScenarios.filter(s => s.goal === activeGoalTab);
  const fixedScenarios = visibleScenarios.filter(sc => !sc.isARM);
  const armScenarios = visibleScenarios.filter(sc => sc.isARM);

  const s = activeScenario || result.recommended;
  if (!s) return (
    <div className="space-y-4 p-2">
      {lowRateWarning ? (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📉</span>
            <div>
              <div className="font-bold text-amber-900 text-base mb-1">Low Rate Borrower — Refi Requires Justification</div>
              <div className="text-amber-800 text-sm leading-relaxed">{lowRateWarning}</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2.5 border border-amber-200">
                  <div className="font-semibold text-amber-700 mb-1">Current Rate</div>
                  <div className="text-2xl font-bold text-amber-900">{resultCurrentRate}%</div>
                  <div className="text-amber-600">Today's market: 6–7.5%</div>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-amber-200">
                  <div className="font-semibold text-amber-700 mb-1">Best Path Forward</div>
                  <div className="font-bold text-amber-900">Debt Consolidation</div>
                  <div className="text-amber-600">Freed payments offset higher rate</div>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-amber-200">
                  <div className="font-semibold text-amber-700 mb-1">Or Consider</div>
                  <div className="font-bold text-amber-900">Cash-Out + Debts</div>
                  <div className="text-amber-600">Go back to Step 3 and select debts</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <div className="text-red-500 font-semibold mb-1">No scenarios could be generated</div>
          <div className="text-red-400 text-sm">Check that a rate sheet is uploaded, loan type is set, and borrower profile is complete.</div>
        </div>
      )}
    </div>
  );

  const netCashOut = s.cashOut > 0 ? Math.max(0, s.cashOut - (s.netClosingCosts || 0)) : 0;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const isCardSelected = (sc) => s === sc || (s.program === sc.program && s.optionLabel === sc.optionLabel && s.goal === sc.goal && s.isARM === sc.isARM);
  const isCardRecommended = (sc) => sc === recommended || (sc.program === recommended?.program && sc.optionLabel === recommended?.optionLabel && sc.goal === recommended?.goal && sc.isARM === recommended?.isARM);

  return (
    <div className="space-y-5">

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

      {/* Strategy tabs */}
      {strategyResults.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pricing Strategy</div>
          <div className="flex flex-wrap gap-2">
            {strategyResults.map(sr => {
              const meta = STRATEGY_META[sr.strategy] || {};
              const isActive = activeStrategy === sr.strategy;
              const rec = sr.recommended;
              return (
                <button key={sr.strategy} onClick={() => { setActiveStrategy(sr.strategy); setActiveScenario(sr.recommended); }}
                  className={`flex-1 min-w-[140px] text-left p-3 rounded-xl border-2 transition-all ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{meta.icon}</span>
                    <span className={`text-xs font-bold ${isActive ? 'text-blue-700' : 'text-gray-600'}`}>{meta.label}</span>
                    {isActive && <span className="ml-auto text-blue-500 text-xs">●</span>}
                  </div>
                  {rec && (
                    <>
                      <div className="text-base font-bold text-gray-900">{rec.rate?.toFixed(3)}%</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {rec.lenderCreditPct > 0 ? `${rec.lenderCreditPct.toFixed(3)}% credit` : rec.borrowerPaysPct > 0 ? `${rec.borrowerPaysPct.toFixed(3)}% pts` : 'Par'}
                        {rec.monthlySavings > 0 ? ` · saves $${rec.monthlySavings}/mo` : ''}
                      </div>
                      {rec.efficiencyLabel && <div className="text-xs mt-1">{rec.efficiencyLabel}</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fixed / ARM toggle tabs */}
      <div className="bg-gray-100 rounded-xl p-1 flex gap-1 w-fit">
        <button
          onClick={() => setProductTab('fixed')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${productTab === 'fixed' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
          📋 30-Year Fixed {fixedScenarios.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{fixedScenarios.length}</span>}
        </button>
        <button
          onClick={() => setProductTab('arm')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${productTab === 'arm' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
          📈 ARM Options {armScenarios.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{armScenarios.length}</span>}
        </button>
      </div>

      {/* Scenario cards */}
      <div>
        {productTab === 'fixed' && (
          fixedScenarios.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fixedScenarios.map((sc, i) => (
                <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} />
              ))}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
              <div className="text-amber-700 font-semibold mb-1">
                {lowRateWarning ? '📉 No beneficial fixed rates found' : 'No 30-year fixed options available'}
              </div>
              <div className="text-amber-600 text-sm">
                {lowRateWarning
                  ? `Borrower's current ${resultCurrentRate}% rate is below today's market. Add debts to pay off or cash-out to offset the payment increase.`
                  : 'Upload a rate sheet to enable automatic pricing.'}
              </div>
            </div>
          )
        )}
        {productTab === 'arm' && (
          armScenarios.length > 0 ? (
            <div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                ⚠️ ARM rates are fixed for the initial period then adjust every 6 months based on SOFR index + margin. Best for clients who plan to sell or refinance before the fixed period ends.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {armScenarios.map((sc, i) => (
                  <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">
              No ARM options parsed from rate sheet. Rate sheet may not include ARM pricing.
            </div>
          )
        )}
      </div>

      {/* Loan Summary Bar — always visible */}
      <LoanSummaryBar scenario={s} clientProfile={clientProfile} />

      {/* Full analysis report */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        {/* Report header */}
        <div className="bg-[#0f2d5e] text-white p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-1">{companyName} | Refinance Savings Analysis</div>
            <div className="text-base font-bold">Prepared for: {clientProfile.borrowerName || 'Client'}</div>
            {s.yearsInHome && (
              <div className="text-blue-300 text-xs mt-0.5">
                🏠 {s.yearsInHome}-yr horizon · Net savings before sale: {s.horizonNet >= 0 ? '+' : ''}{money(s.horizonNet || 0)}
              </div>
            )}
            <div className="text-blue-300 text-xs mt-0.5">{today}</div>
          </div>
          {(s === recommended || isCardRecommended(s)) && (
            <div className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Star className="w-3 h-3" /> AI RECOMMENDED
            </div>
          )}
        </div>

        {/* Top summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 border-b border-gray-200">
          <SummaryCell label="Paying Now" value={`${money(currentTotalPayment)}/mo`} sub="All current obligations" />
          <SummaryCell label="After Refinance" value={`${money(s.newTotalPayment)}/mo`} sub={`P&I: ${money(s.newPI)} + Escrow: ${s.newEscrow > 0 ? money(s.newEscrow) : '—'}`} />
          <SummaryCell label="Monthly Savings" value={`${money(s.monthlySavings)}/mo`} highlight
            sub={s.yearsInHome
              ? `${money(s.annualSavings)}/yr · ${money(s.horizonSavings || s.fiveYearSavings)} over ${s.yearsInHome} yrs`
              : `${money(s.annualSavings)}/yr · ${money(s.fiveYearSavings)} over 5 yrs`}
          />
          <SummaryCell label="Cash Out to Client" value={s.cashOut > 0 ? `~${money(netCashOut)}` : '—'} sub={s.cashOut > 0 ? 'Net after closing costs' : 'Rate & Term refi'} />
        </div>

        {/* New loan terms */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">New Loan Terms</div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-200">
            {[
              { label: 'Loan Amount', value: money(s.newLoanAmount) },
              { label: 'Interest Rate', value: pct(s.rate), blue: true },
              { label: 'Term', value: s.isARM ? `${s.armType || 'ARM'} → 30yr` : '30 Year Fixed' },
              { label: 'P&I Payment', value: money(s.newPI) + '/mo', blue: true },
              { label: 'Escrow (T&I)', value: s.newEscrow > 0 ? money(s.newEscrow) + '/mo' : '—' },
              { label: 'Total Payment', value: money(s.newTotalPayment) + '/mo', blue: true },
              { label: 'Recoupment', value: s.breakevenMonths === 0 ? 'Immediate' : `${s.breakevenMonths} months` },
            ].map((item, i) => (
              <div key={i} className="px-4 py-3">
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">{item.label}</div>
                <div className={`text-base font-bold ${item.blue ? 'text-blue-700' : 'text-gray-900'}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Loan balance breakdown */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">New Loan Balance Breakdown</div>
          <div className="px-4 py-3 space-y-2 text-sm">
            {[
              ['Current Mortgage Balance', s.currentBalance || clientProfile.currentBalance, null],
              ...(s.debtBalanceTotal > 0 ? [['Debts Being Paid Off', s.debtBalanceTotal, null]] : []),
              ['Title & Settlement Charges', s.titleCharges || clientProfile.titleCharges, null],
              ...((s.lenderFees || lenderFees) > 0 ? [['Lender Fees (Processing + Underwriting)', s.lenderFees || lenderFees, null]] : []),
              ...(s.cashOut > 0 ? [['Cash-Out Amount', s.cashOut, null]] : []),
              ...(s.borrowerPaysPct > 0 ? [[`Discount Points (${s.borrowerPaysPct?.toFixed(3)}% of loan)`, s.pointsCost, 'amber']] : []),
              ...(s.lenderCreditPct > 0 ? [[`Lender Credit (${s.lenderCreditPct?.toFixed(3)}% of loan)`, -s.lenderCredit, 'green']] : []),
            ].map(([label, val, color], i, arr) => (
              <div key={i} className={`flex justify-between py-1.5 border-b border-gray-100`}>
                <span className={color === 'amber' ? 'text-amber-700 font-medium' : color === 'green' ? 'text-green-700 font-medium' : 'text-gray-600'}>{label}</span>
                <span className={`font-semibold ${color === 'amber' ? 'text-amber-700' : color === 'green' ? 'text-green-700' : ''}`}>
                  {color === 'green' ? '-' : color === 'amber' ? '+' : ''}{money(Math.abs(val))}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t-2 border-gray-300">
              <span className="font-bold text-gray-900">New Loan Total</span>
              <span className="font-bold text-blue-700 text-base">{money(s.newLoanAmount)}</span>
            </div>
            {/* Closing costs summary */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-sm">
                <span>Net Closing Costs</span>
                <span>{money(s.netClosingCosts)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Recoupment period</span>
                <span className={`font-semibold ${s.breakevenMonths <= 24 ? 'text-green-700' : s.breakevenMonths <= 36 ? 'text-amber-700' : 'text-red-700'}`}>
                  {s.breakevenMonths === 0 ? 'Immediate' : `${s.breakevenMonths} months`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* LO-only: Compensation / YSP box — not shown to client */}
        {marginBPS > 0 && (() => {
          const brokerMarginPct = (parseFloat(marginBPS) || 0) / 100;
          // baseNetPoints = what the lender sheet actually pays (before broker margin)
          // clientNetPoints (s.netPointsPct) = baseNetPoints + brokerMarginPct
          const baseNetPoints = (s.netPointsPct ?? 0) - brokerMarginPct;
          const baseDollar = Math.round(Math.abs(baseNetPoints) / 100 * s.newLoanAmount);
          const marginDollarAmt = Math.round(brokerMarginPct / 100 * s.newLoanAmount);
          const yspEarned = marginDollar ? parseFloat(marginDollar) : marginDollarAmt;

          // Build price stack rows
          // UWM rate sheet shows "net points" already adjusted for standard LLPAs
          // We show: Base Price → LLPA hits → Net Lender Price → Broker Margin → Final Client Price
          const priceRows = [
            {
              label: 'Rate',
              value: `${s.rate?.toFixed(3)}%`,
              note: s.isARM ? (s.armType || 'ARM') : '30-Year Fixed',
              style: 'header',
            },
            {
              label: 'Lender Base Price (from rate sheet)',
              value: baseNetPoints <= 0
                ? `-${Math.abs(baseNetPoints).toFixed(3)}%`
                : `+${baseNetPoints.toFixed(3)}%`,
              dollar: baseNetPoints <= 0
                ? `-${money(baseDollar)}`
                : `+${money(baseDollar)}`,
              note: baseNetPoints <= 0 ? 'lender paying credit' : 'cost to borrower',
              style: baseNetPoints <= 0 ? 'credit' : 'cost',
            },
            {
              label: `Broker Margin (${marginBPS} BPS)`,
              value: `+${brokerMarginPct.toFixed(3)}%`,
              dollar: `+${money(marginDollarAmt)}`,
              note: 'your compensation — added to price',
              style: 'margin',
            },
            {
              label: 'Final Client Price',
              value: s.lenderCreditPct > 0
                ? `-${s.lenderCreditPct.toFixed(3)}% credit`
                : s.borrowerPaysPct > 0
                  ? `+${s.borrowerPaysPct.toFixed(3)}% points`
                  : 'Par (0.000%)',
              dollar: s.lenderCreditPct > 0
                ? `-${money(s.lenderCredit)}`
                : s.borrowerPaysPct > 0
                  ? `+${money(s.pointsCost)}`
                  : '$0',
              note: s.lenderCreditPct > 0
                ? 'client receives as closing credit'
                : s.borrowerPaysPct > 0
                  ? 'client pays as discount points'
                  : 'no cost to client, no credit',
              style: 'final',
            },
          ];

          return (
            <div className="border-b border-blue-200 bg-blue-50">
              <div className="bg-blue-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-2">
                <span>🔒</span> Internal Pricing & Compensation — Not for Client
              </div>
              <div className="px-4 py-4 space-y-3">

                {/* Price Stack Table */}
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                  <div className="bg-blue-700 px-4 py-2 flex items-center justify-between">
                    <div className="text-xs font-bold text-blue-100 uppercase tracking-wider">Price Stack — {s.program} {s.rate?.toFixed(3)}%</div>
                    <div className="text-xs text-blue-300">{s.isARM ? (s.armType || 'ARM') : '30-Year Fixed'}</div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-100 bg-blue-50">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-blue-600">Item</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-blue-600">Points %</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-blue-600">Dollar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Base price from rate sheet */}
                      <tr className="border-b border-blue-50">
                        <td className="px-4 py-2.5 text-gray-700 font-medium">
                          Base Price (rate sheet, 30-day lock)
                          <div className="text-xs text-gray-400 font-normal">before LLPA adjustments</div>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${(s.basePoints ?? baseNetPoints) <= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {((s.basePoints ?? baseNetPoints) <= 0 ? '' : '+')}{(s.basePoints ?? baseNetPoints).toFixed(3)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs ${(s.basePoints ?? baseNetPoints) <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {(s.basePoints ?? baseNetPoints) <= 0 ? '-' : '+'}{money(Math.abs((s.basePoints ?? baseNetPoints) / 100 * s.newLoanAmount))}
                        </td>
                      </tr>
                      {/* LLPA hits */}
                      {(s.llpaHits?.length > 0) ? (
                        s.llpaHits.map((hit, i) => (
                          <tr key={i} className="border-b border-orange-50 bg-orange-50">
                            <td className="px-4 py-2 text-orange-800 text-xs font-medium">⚡ LLPA: {hit.description}</td>
                            <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${hit.hit <= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                              {hit.hit <= 0 ? '' : '+'}{hit.hit.toFixed(3)}%
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs ${hit.hit <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              {hit.hit <= 0 ? '-' : '+'}{money(Math.abs(hit.hit / 100 * s.newLoanAmount))}
                            </td>
                          </tr>
                        ))
                      ) : (() => {
                        const llpaTotal = baseNetPoints - (s.basePoints ?? baseNetPoints);
                        return llpaTotal !== 0 ? (
                          <tr className="border-b border-orange-50 bg-orange-50">
                            <td className="px-4 py-2 text-orange-800 text-xs font-medium">
                              ⚡ LLPA Adjustments (FICO {clientProfile?.ficoScore}, LTV ~{Math.round((clientProfile?.currentBalance / clientProfile?.estimatedValue) * 100)}%, {s.goal === 'cash_out' ? 'Cash-Out' : 'Rate/Term'})
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${llpaTotal <= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                              {llpaTotal <= 0 ? '' : '+'}{llpaTotal.toFixed(3)}%
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs ${llpaTotal <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              {llpaTotal <= 0 ? '-' : '+'}{money(Math.abs(llpaTotal / 100 * s.newLoanAmount))}
                            </td>
                          </tr>
                        ) : null;
                      })()}
                      {/* Net lender price subtotal */}
                      <tr className="border-b-2 border-blue-200 bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800 font-semibold text-xs uppercase tracking-wide">Net Lender Price (after LLPAs)</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${baseNetPoints <= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                          {baseNetPoints <= 0 ? '' : '+'}{baseNetPoints.toFixed(3)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs ${baseNetPoints <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {baseNetPoints <= 0 ? '-' : '+'}{money(Math.abs(baseNetPoints / 100 * s.newLoanAmount))}
                        </td>
                      </tr>
                      {/* Broker margin */}
                      <tr className="border-b border-amber-100 bg-amber-50">
                        <td className="px-4 py-2.5 text-amber-800 font-medium">
                          Broker Margin ({marginBPS} BPS)
                          <div className="text-xs text-amber-600 font-normal">your compensation — added to price</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">+{brokerMarginPct.toFixed(3)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-600">+{money(marginDollarAmt)}</td>
                      </tr>
                      {/* Final client price */}
                      <tr className="bg-blue-50 font-bold">
                        <td className="px-4 py-3 text-blue-900 font-bold">
                          Final Client Price
                          <div className="text-xs font-normal text-blue-600">{s.lenderCreditPct > 0 ? 'credit toward closing costs' : s.borrowerPaysPct > 0 ? 'charged as discount points' : 'no cost, no credit — par'}</div>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold text-base ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-red-600' : 'text-blue-700'}`}>
                          {s.lenderCreditPct > 0 ? `-${s.lenderCreditPct.toFixed(3)}%` : s.borrowerPaysPct > 0 ? `+${s.borrowerPaysPct.toFixed(3)}%` : '0.000%'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-red-600' : 'text-blue-700'}`}>
                          {s.lenderCreditPct > 0 ? `-${money(s.lenderCredit)}` : s.borrowerPaysPct > 0 ? `+${money(s.pointsCost)}` : '$0'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                    <div className="text-xs text-blue-500 font-semibold uppercase mb-1">Rate</div>
                    <div className="font-bold text-gray-900 text-lg">{s.rate?.toFixed(3)}%</div>
                    <div className="text-xs text-gray-400">{s.isARM ? 'ARM' : '30yr Fixed'}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                    <div className="text-xs text-blue-500 font-semibold uppercase mb-1">YSP Earned</div>
                    <div className="font-bold text-green-700 text-lg">{money(yspEarned)}</div>
                    <div className="text-xs text-gray-400">{marginBPS} BPS on {money(s.newLoanAmount)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                    <div className="text-xs text-blue-500 font-semibold uppercase mb-1">Lender Base</div>
                    <div className={`font-bold text-lg ${baseNetPoints <= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                      {baseNetPoints <= 0 ? `${Math.abs(baseNetPoints).toFixed(3)}% cr` : `${baseNetPoints.toFixed(3)}% cost`}
                    </div>
                    <div className="text-xs text-gray-400">sheet price pre-margin</div>
                  </div>
                </div>

                {/* Narrative */}
                <div className="bg-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">Price build:</span> UWM rate sheet at {s.rate?.toFixed(3)}% shows <span className="font-semibold">{baseNetPoints <= 0 ? `${Math.abs(baseNetPoints).toFixed(3)}% lender credit` : `${baseNetPoints.toFixed(3)}% cost`}</span> as the base price. After adding your <span className="font-semibold">{marginBPS} BPS broker margin</span>, the final price to client is <span className="font-semibold">{s.lenderCreditPct > 0 ? `${s.lenderCreditPct.toFixed(3)}% credit (${money(s.lenderCredit)})` : s.borrowerPaysPct > 0 ? `${s.borrowerPaysPct.toFixed(3)}% in points (${money(s.pointsCost)})` : 'par — no cost, no credit'}</span>. Your YSP is <span className="font-semibold text-green-800">{money(yspEarned)}</span>.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Debts paid off */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">Debts Paid Off at Closing</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Creditor</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Mo. Payment</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Payoff Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-4 py-2.5 font-semibold">{clientProfile.mortgageLender || 'Current Mortgage'}</td>
                <td className="px-4 py-2.5 text-gray-500">Mortgage</td>
                <td className="px-4 py-2.5 text-right">{money(currentMortgagePI)}/mo</td>
                <td className="px-4 py-2.5 text-right font-semibold">{money(clientProfile.currentBalance)}</td>
              </tr>
              {paidDebts.map((d, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">{d.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{d.type}</td>
                  <td className="px-4 py-2.5 text-right">{money(d.payment)}/mo</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{money(d.balance)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-2.5" colSpan={2}>Total Eliminated</td>
                <td className="px-4 py-2.5 text-right text-green-700">-{money(debtPaymentTotal + currentMortgagePI)}/mo</td>
                <td className="px-4 py-2.5 text-right">{money((clientProfile.currentBalance || 0) + (s.debtBalanceTotal || 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Disclaimer */}
        <div className="px-4 py-3 text-xs text-gray-400">
          This analysis is for illustrative purposes only. Final loan terms are subject to underwriting approval. ARM rates adjust after the initial fixed period based on SOFR index.
        </div>
      </div>
    </div>
  );
}





