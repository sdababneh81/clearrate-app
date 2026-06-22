import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { BADGE_CONFIG } from '../utils/debtOptimizer';

const money = v => '$' + Math.round(v).toLocaleString();

function BadgePill({ recommendation }) {
  const cfg = BADGE_CONFIG[recommendation] || BADGE_CONFIG.neutral;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function MortgageRow({ debt }) {
  return (
    <div className="border-2 border-blue-200 rounded-lg bg-blue-50 mb-1">
      <div className="flex items-center gap-3 p-3">
        {/* Lock icon — mortgage is being refinanced, not paid off */}
        <div className="w-5 h-5 rounded border-2 border-blue-400 bg-blue-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-blue-900 truncate">{debt.name}</span>
            <span className="text-xs text-blue-500">· Being Refinanced</span>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-300 bg-blue-100 text-blue-700">🔄 Replaced by new loan</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-sm text-blue-900">{debt.payment > 0 ? `${money(debt.payment)}/mo` : '—'}</div>
          <div className="text-xs text-blue-600">Bal: {money(debt.balance)}</div>
        </div>
      </div>
    </div>
  );
}

function ratioColor(ratio) {
  if (ratio >= 4) return 'bg-green-100 text-green-800 border-green-300';
  if (ratio >= 2.5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (ratio >= 1.5) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

function DebtRow({ debt, index, rank, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const { analysis } = debt;
  const ratio = analysis?.paymentToBalanceRatio || 0;

  return (
    <div className={`border rounded-lg transition-all ${debt.selected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => onToggle(index)}
      >
        {/* Rank badge — payoff priority by DTI-relief efficiency */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${rank <= 3 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`} title="Payoff priority — best DTI relief per dollar">
          {rank}
        </div>

        {/* Checkbox */}
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${debt.selected ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`}>
          {debt.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>

        {/* Name + type + ratio */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{debt.name}</span>
            <span className="text-xs text-gray-400">· {debt.type}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <BadgePill recommendation={analysis?.badge || 'neutral'} />
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ratioColor(ratio)}`} title="Monthly payment ÷ balance — higher means more DTI relief per dollar paid off">
              {ratio.toFixed(1)}% relief ratio
            </span>
          </div>
        </div>

        {/* Numbers */}
        <div className="text-right flex-shrink-0 mr-1">
          <div className="font-bold text-sm text-gray-900">{money(debt.payment)}/mo</div>
          <div className="text-xs text-gray-500">Bal: {money(debt.balance)}</div>
        </div>

        {/* Expand */}
        <button
          className="p-1 text-gray-400 hover:text-gray-600"
          onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && analysis && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100">
          <div className="bg-gray-50 rounded-lg p-3 mt-2">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-700 leading-relaxed">{analysis.reason}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <div className="text-xs text-gray-500">Relief ratio (pmt÷bal)</div>
                <div className="font-semibold text-sm">{ratio.toFixed(2)}%</div>
                <div className="text-xs text-gray-400">{money(debt.payment)}/mo per {money(debt.balance)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">30yr interest cost</div>
                <div className="font-semibold text-sm text-orange-600">{money(analysis.costToRoll || 0)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Remaining if kept</div>
                <div className="font-semibold text-sm text-gray-700">{money(Math.max(0, analysis.remainingCost || 0))}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DebtChecklist({ debts, onToggle, onAddDebt, onSelectRecommended }) {
  const mortgageDebts = debts.filter(d => d.isMortgage);
  const regularDebts = debts.filter(d => !d.isMortgage);
  const [newName, setNewName] = useState('');
  const [newBal, setNewBal] = useState('');
  const [newPmt, setNewPmt] = useState('');
  const [newType, setNewType] = useState('Revolving');

  const selectedCount = debts.filter(d => d.selected && !d.isMortgage).length;
  const selectedBalance = debts.filter(d => d.selected).reduce((s, d) => s + d.balance, 0);
  const selectedPayments = debts.filter(d => d.selected).reduce((s, d) => s + d.payment, 0);

  const handleAdd = () => {
    if (!newName || !newBal || !newPmt) return;
    onAddDebt({ name: newName, balance: parseFloat(newBal), payment: parseFloat(newPmt), type: newType });
    setNewName(''); setNewBal(''); setNewPmt('');
  };

  return (
    <div>
      {/* Ratio explainer */}
      <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 leading-relaxed">
        <span className="font-semibold">Relief ratio = monthly payment ÷ balance.</span> Higher is better — it means more monthly DTI relief for every dollar rolled into the loan. Debts are ranked by this ratio, so <span className="font-semibold">#1 is the most efficient debt to pay off</span> when you need to clear DTI. Only the current mortgage is pre-selected (it's being refinanced); check the debts you want to consolidate.
      </div>

      {/* Selection summary */}
      <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
        <span className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{selectedCount}</span> of {regularDebts.length} debts selected for payoff
        </span>
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <span className="text-sm font-semibold text-blue-700">{money(selectedPayments)}/mo eliminated · {money(selectedBalance)} balance</span>
          )}
          <button
            onClick={() => onSelectRecommended && onSelectRecommended()}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline whitespace-nowrap">
            Select all recommended
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {mortgageDebts.map((debt, i) => (
          <MortgageRow key={`m-${i}`} debt={debt} />
        ))}
        {regularDebts.map((debt, i) => {
          const originalIndex = debts.indexOf(debt);
          return <DebtRow key={i} debt={debt} index={originalIndex} rank={i + 1} onToggle={onToggle} />;
        })}
      </div>

      {/* Add manual debt */}
      <div className="mt-4 border border-dashed border-gray-300 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Add debt manually</p>
        <div className="flex gap-2 flex-wrap">
          <input className="flex-1 min-w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Creditor name" value={newName} onChange={e => setNewName(e.target.value)} />
          <input className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Balance $" type="number" value={newBal} onChange={e => setNewBal(e.target.value)} />
          <input className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Payment $" type="number" value={newPmt} onChange={e => setNewPmt(e.target.value)} />
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={newType} onChange={e => setNewType(e.target.value)}>
            <option>Revolving</option><option>Auto</option><option>Student Loan</option><option>Installment</option><option>Other</option>
          </select>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">+ Add</button>
        </div>
      </div>
    </div>
  );
}

