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

export default function AnalysisReport({ result, clientProfile, selectedDebts, marginBPS, companyName = 'Priority 1 Lending' }) {
  const [activeScenario, setActiveScenario] = useState(result.recommended);
  const [activeGoalTab, setActiveGoalTab] = useState('rate_term');
  const [productTab, setProductTab] = useState('fixed'); // 'fixed' | 'arm'

  const { scenarios, recommended, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments } = result;

  const paidDebts = selectedDebts.filter(d => d.selected);
  const remainingDebts = selectedDebts.filter(d => !d.selected);

  const goalTabs = [...new Set(scenarios.map(s => s.goal))];
  const visibleScenarios = scenarios.filter(s => s.goal === activeGoalTab);
  const fixedScenarios = visibleScenarios.filter(sc => !sc.isARM);
  const armScenarios = visibleScenarios.filter(sc => sc.isARM);

  const s = activeScenario || result.recommended;
  if (!s) return <div className="text-red-500 p-4">No scenarios could be generated. Check inputs.</div>;

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
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-400">
              No 30-year fixed options available. Upload a rate sheet for pricing.
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
              ['Current Mortgage Balance', s.currentBalance || clientProfile.currentBalance],
              ['Debts Being Paid Off', s.debtBalanceTotal],
              ['Title & Settlement Charges', s.titleCharges],
              ...(s.cashOut > 0 ? [['Cash-Out Amount', s.cashOut]] : []),
            ].map(([label, val], i, arr) => (
              <div key={i} className={`flex justify-between py-1.5 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold">{money(val)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t-2 border-gray-300">
              <span className="font-bold text-gray-900">New Loan Total</span>
              <span className="font-bold text-blue-700 text-base">{money(s.newLoanAmount)}</span>
            </div>
            {/* Closing costs breakdown */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
              {s.borrowerPaysPct > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Borrower pays points ({s.borrowerPaysPct?.toFixed(3)}%)</span>
                  <span>+{money(s.pointsCost)}</span>
                </div>
              )}
              {s.lenderCreditPct > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Lender credit ({s.lenderCreditPct?.toFixed(3)}%)</span>
                  <span>-{money(s.lenderCredit)}</span>
                </div>
              )}
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
              {marginBPS > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>Broker margin ({marginBPS} BPS)</span>
                  <span>earned as YSP</span>
                </div>
              )}
            </div>
          </div>
        </div>

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

