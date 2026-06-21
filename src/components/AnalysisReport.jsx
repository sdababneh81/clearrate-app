import { useState } from 'react';
import { Star, TrendingDown, Clock, DollarSign, Award } from 'lucide-react';

const money = v => '$' + Math.round(Math.abs(v)).toLocaleString();
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

function ScenarioCard({ scenario, isRecommended, isSelected, onSelect }) {
  return (
    <div
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'} ${isRecommended ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
      onClick={() => onSelect(scenario)}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3" /> RECOMMENDED
        </div>
      )}
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-bold text-sm text-blue-800">{scenario.program} {scenario.isARM ? scenario.armType || 'ARM' : '30yr Fixed'}</span>
          <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{scenario.optionLabel}</span>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-gray-900">{pct(scenario.rate)}</div>
          <div className="text-xs text-gray-500">{scenario.borrowerPaysPct > 0 ? `+${scenario.borrowerPaysPct?.toFixed(2)} pts` : scenario.lenderCreditPct > 0 ? `${money(scenario.lenderCredit)} credit` : 'Par'}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-white rounded-lg p-2 text-center border border-gray-100">
          <div className="text-xs text-gray-500">New payment</div>
          <div className="font-bold text-blue-700">{money(scenario.newPI)}/mo</div>
        </div>
        <div className={`rounded-lg p-2 text-center border ${scenario.monthlySavings > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <div className="text-xs text-gray-500">Monthly savings</div>
          <div className={`font-bold ${scenario.monthlySavings > 0 ? 'text-green-700' : 'text-red-700'}`}>{scenario.monthlySavings > 0 ? '+' : ''}{money(scenario.monthlySavings)}/mo</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500 text-center">{scenario.optionDesc}</div>
    </div>
  );
}

export default function AnalysisReport({ result, clientProfile, selectedDebts, companyName = 'Priority 1 Lending', loName = '' }) {
  const [activeScenario, setActiveScenario] = useState(result.recommended);
  const [activeGoalTab, setActiveGoalTab] = useState('rate_term');

  const { scenarios, recommended, currentTotalPayment, currentMortgagePI, debtPaymentTotal, remainingPayments } = result;

  const paidDebts = selectedDebts.filter(d => d.selected);
  const remainingDebts = selectedDebts.filter(d => !d.selected);

  const goalTabs = [...new Set(scenarios.map(s => s.goal))];
  const visibleScenarios = scenarios.filter(s => s.goal === activeGoalTab);

  const s = activeScenario || result.recommended;

  if (!s) return <div className="text-red-500 p-4">No scenarios could be generated. Check inputs.</div>;

  const netCashOut = s.cashOut > 0 ? Math.max(0, s.cashOut - (s.closingCosts || 0)) : 0;

  return (
    <div className="space-y-6">

      {/* Scenario selector */}
      <div>
        <h3 className="font-bold text-gray-800 mb-3">Select a scenario to view in the analysis</h3>

        {goalTabs.length > 1 && (
          <div className="flex gap-2 mb-4">
            {goalTabs.map(g => (
              <button key={g} onClick={() => setActiveGoalTab(g)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${activeGoalTab === g ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {g === 'rate_term' ? 'Rate & Term' : 'Cash-Out'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleScenarios.map((sc, i) => (
            <ScenarioCard
              key={i}
              scenario={sc}
              isRecommended={sc === recommended || (sc.program === recommended?.program && sc.optionLabel === recommended?.optionLabel && sc.goal === recommended?.goal)}
              isSelected={s === sc || (s.program === sc.program && s.optionLabel === sc.optionLabel && s.goal === sc.goal)}
              onSelect={setActiveScenario}
            />
          ))}
        </div>
      </div>

      {/* THE REPORT — matches Priority 1 Lending layout */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm print:shadow-none" id="analysis-report">

        {/* Header */}
        <div className="bg-[#0f2d5e] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold uppercase tracking-widest">{companyName} | Refinance Savings Analysis</div>
            <div className="text-blue-200 text-sm mt-0.5">
              Prepared for: {clientProfile.borrowerName || 'Client'} &nbsp;·&nbsp; {loName && `LO: ${loName} ·`} {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          {(s === recommended || (recommended && s.program === recommended.program && s.optionLabel === recommended.optionLabel)) && (
            <div className="flex items-center gap-1.5 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-bold">
              <Award className="w-3.5 h-3.5" /> AI RECOMMENDED
            </div>
          )}
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-gray-200">
          <SummaryCell label="Paying Now" value={money(currentTotalPayment) + '/mo'} sub="All current obligations" />
          <SummaryCell label="After Refinance" value={money(s.newTotalPayment) + '/mo'} sub={`New mortgage${remainingDebts.length > 0 ? ' + remaining obligations' : ''}`} />
          <SummaryCell label="Monthly Savings" value={money(s.monthlySavings) + '/mo'} sub={`${money(s.annualSavings)}/yr · ${money(s.fiveYearSavings)} over 5 yrs`} highlight />
          <SummaryCell label="Cash Out to Client" value={s.cashOut > 0 ? '~' + money(netCashOut) : '—'} sub={s.cashOut > 0 ? 'Net after closing costs' : 'Rate & Term refi'} />
        </div>

        {/* New loan terms row */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">New Loan Terms</div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-200">
            {[
              { label: 'Loan Amount', value: money(s.newLoanAmount) },
              { label: 'Interest Rate', value: pct(s.rate), blue: true },
              { label: 'Term', value: s.isARM ? `${s.armType || 'ARM'} → 30yr` : '30 Year Fixed' },
              { label: 'New Mo. Payment', value: money(s.newPI) + '/mo', blue: true },
              { label: 'Cash Out to Client', value: s.cashOut > 0 ? '~' + money(netCashOut) : '—' },
            ].map((item, i) => (
              <div key={i} className="px-4 py-3">
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">{item.label}</div>
                <div className={`text-base font-bold ${item.blue ? 'text-blue-700' : 'text-gray-900'}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* New loan balance breakdown */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">New Loan Balance Breakdown</div>
          <div className="px-4 py-3 space-y-2 text-sm">
            {[
              ['Current Mortgage Balance', s.currentBalance || clientProfile.currentBalance],
              ['Debts Being Paid Off', s.debtBalanceTotal],
              ['Title & Settlement Charges', s.titleCharges],
              ...(s.marginDollar > 0 ? [['Lender Margin (rolled in)', s.marginDollar]] : []),
              ...(s.cashOut > 0 ? [['Cash-Out Amount', s.cashOut]] : []),
            ].map(([label, val], i, arr) => (
              <div key={i} className={`flex justify-between py-1 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold">{money(val)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t-2 border-gray-300">
              <span className="font-bold text-gray-900">New Loan Total</span>
              <span className="font-bold text-blue-700 text-base">{money(s.newLoanAmount)}</span>
            </div>
            {clientProfile.estimatedValue > 0 && (
              <div className="text-xs text-gray-400 text-right">
                LTV: {((s.newLoanAmount / clientProfile.estimatedValue) * 100).toFixed(1)}% of {money(clientProfile.estimatedValue)} estimated value
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs space-y-1">
              {s.borrowerPaysPct > 0 && <div className="flex justify-between text-amber-700"><span>Borrower pays points ({s.borrowerPaysPct?.toFixed(3)}%)</span><span>+{money(s.pointsCost)}</span></div>}
              {s.lenderCreditPct > 0 && <div className="flex justify-between text-green-700"><span>Lender credit ({s.lenderCreditPct?.toFixed(3)}%)</span><span>-{money(s.lenderCredit)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Net closing costs</span><span>{money(s.netClosingCosts)}</span></div>
              {s.marginBPS > 0 && <div className="flex justify-between text-blue-700"><span>Broker margin ({s.marginBPS} BPS)</span><span>earned as YSP</span></div>}
            </div>
          </div>
        </div>

        {/* Debts paid off table */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">Debts Paid Off at Closing</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Creditor</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Old Mo. Pmt</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payoff Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Mortgage first */}
              <tr className="border-b border-gray-50">
                <td className="px-4 py-2.5 font-semibold">Mortgage ({clientProfile.mortgageLender || 'Current Lender'})</td>
                <td className="px-4 py-2.5 text-gray-500">Mortgage</td>
                <td className="px-4 py-2.5 text-right">{money(currentMortgagePI)}/mo</td>
                <td className="px-4 py-2.5 text-right">{money(clientProfile.currentBalance)}</td>
              </tr>
              {paidDebts.map((d, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">{d.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{d.type}</td>
                  <td className="px-4 py-2.5 text-right">{money(d.payment)}/mo</td>
                  <td className="px-4 py-2.5 text-right">{money(d.balance)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold border-t border-gray-200">
                <td className="px-4 py-2.5" colSpan={2}>Total Paid Off at Closing</td>
                <td className="px-4 py-2.5 text-right text-green-700">{money(currentMortgagePI + debtPaymentTotal)}/mo</td>
                <td className="px-4 py-2.5 text-right">{money(clientProfile.currentBalance + paidDebts.reduce((s, d) => s + d.balance, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Remaining obligations */}
        {remainingDebts.length > 0 && (
          <div className="border-b border-gray-200">
            <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">Remaining Obligations (Not Paid Off)</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Creditor</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mo. Payment</th>
                </tr>
              </thead>
              <tbody>
                {remainingDebts.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-2.5">{d.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{d.type}</td>
                    <td className="px-4 py-2.5 text-right">{money(d.payment)}/mo</td>
                  </tr>
                ))}
                {remainingDebts.length > 1 && (
                  <tr className="bg-gray-50 font-bold border-t border-gray-200">
                    <td className="px-4 py-2.5" colSpan={2}>Subtotal</td>
                    <td className="px-4 py-2.5 text-right">{money(remainingPayments)}/mo</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Savings breakdown */}
        <div className="border-b border-gray-200">
          <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">Savings Breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-x divide-y divide-gray-100">
            {[
              { icon: <TrendingDown className="w-4 h-4" />, label: 'Monthly Cash Flow', value: money(s.monthlySavings) + '/mo', color: 'text-green-700' },
              { icon: <DollarSign className="w-4 h-4" />, label: 'Annual Savings', value: money(s.annualSavings) + '/yr', color: 'text-green-700' },
              { icon: <DollarSign className="w-4 h-4" />, label: '5-Year Savings', value: money(s.fiveYearSavings), color: 'text-green-700' },
              { icon: <DollarSign className="w-4 h-4" />, label: 'Lifetime Interest Savings', value: money(s.lifetimeInterestSavings), color: s.lifetimeInterestSavings > 0 ? 'text-green-700' : 'text-orange-600' },
              { icon: <Clock className="w-4 h-4" />, label: 'Break-even on Closing Costs', value: s.breakevenMonths ? `${Math.floor(s.breakevenMonths/12)}y ${s.breakevenMonths%12}mo` : 'N/A', color: 'text-blue-700' },
              { icon: <Award className="w-4 h-4" />, label: 'LTV', value: s.ltv + '%', color: 'text-gray-700' },
            ].map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">{item.icon}</span>
                <div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className={`font-bold text-base ${item.color}`}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendation callout */}
        {recommended && (
          <div className="border-b border-gray-200 bg-blue-50 px-4 py-4">
            <div className="flex gap-3">
              <Award className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-blue-900 text-sm mb-1">Why this recommendation</div>
                <p className="text-sm text-blue-800 leading-relaxed">
                  The <strong>{recommended.program} {recommended.optionLabel}</strong> at <strong>{pct(recommended.rate)}</strong> is recommended because it delivers the best balance of monthly savings
                  ({money(recommended.monthlySavings)}/mo) and closing cost recovery ({recommended.breakevenMonths ? `break-even in ${Math.floor(recommended.breakevenMonths/12)}y ${recommended.breakevenMonths%12}mo` : 'immediate'}).
                  {recommended.program === 'VA' && ' As a veteran, the VA loan offers no PMI and competitive pricing, maximizing your benefit.'}
                  {paidDebts.length > 0 && ` Consolidating ${paidDebts.length} debt${paidDebts.length > 1 ? 's' : ''} (${money(debtPaymentTotal)}/mo) into a single payment simplifies obligations and improves cash flow.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-400 leading-relaxed">
            This analysis is for illustrative purposes only. Final loan terms, payment amounts, and closing costs are subject to underwriting approval and market conditions.
            Contact your loan officer for official figures. Prepared by {companyName}.
          </p>
        </div>
      </div>

      {/* Print button */}
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-900 print:hidden"
      >
        🖨 Print / Save as PDF
      </button>
    </div>
  );
}
