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

function DebtRow({ debt, index, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const { analysis } = debt;

  return (
    <div className={`border rounded-lg transition-all ${debt.selected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => onToggle(index)}
      >
        {/* Checkbox */}
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${debt.selected ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`}>
          {debt.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{debt.name}</span>
            <span className="text-xs text-gray-400">· {debt.type}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <BadgePill recommendation={analysis?.badge || 'neutral'} />
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
                <div className="text-xs text-gray-500">Pmt/Balance ratio</div>
                <div className="font-semibold text-sm">{analysis.paymentToBalanceRatio?.toFixed(1)}%</div>
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

export default function DebtChecklist({ debts, onToggle, onAddDebt }) {
  const [newName, setNewName] = useState('');
  const [newBal, setNewBal] = useState('');
  const [newPmt, setNewPmt] = useState('');
  const [newType, setNewType] = useState('Revolving');

  const selectedCount = debts.filter(d => d.selected).length;
  const selectedBalance = debts.filter(d => d.selected).reduce((s, d) => s + d.balance, 0);
  const selectedPayments = debts.filter(d => d.selected).reduce((s, d) => s + d.payment, 0);

  const handleAdd = () => {
    if (!newName || !newBal || !newPmt) return;
    onAddDebt({ name: newName, balance: parseFloat(newBal), payment: parseFloat(newPmt), type: newType });
    setNewName(''); setNewBal(''); setNewPmt('');
  };

  return (
    <div>
      {/* Selection summary */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{selectedCount}</span> of {debts.length} debts selected for payoff
        </span>
        <span className="text-sm font-semibold text-blue-700">{money(selectedPayments)}/mo eliminated · {money(selectedBalance)} balance</span>
      </div>

      <div className="flex flex-col gap-2">
        {debts.map((debt, i) => (
          <DebtRow key={i} debt={debt} index={i} onToggle={onToggle} />
        ))}
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
