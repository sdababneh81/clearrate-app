import { useState } from 'react';
import { FileText, ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Loader, Shield, TrendingDown, DollarSign } from 'lucide-react';
import DropZone from './components/DropZone';
import DebtChecklist from './components/DebtChecklist';
import AnalysisReport from './components/AnalysisReport';
import { parseCreditReport, parseRateSheet } from './utils/claudeParser';
import { analyzeDebt } from './utils/debtOptimizer';
import { generateScenarios } from './utils/scenarioEngine';

const STEPS = ['Upload', 'Client Profile', 'Debts', 'Goals & Programs', 'Analysis'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${i === current ? 'bg-blue-600 text-white' : i < current ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            {i < current ? <CheckCircle className="w-3 h-3" /> : <span>{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${i < current ? 'bg-green-300' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );
}

function Card({ title, children, className }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-2xl p-6 shadow-sm ${className || ''}`}>
      {title && <h2 className="text-lg font-bold text-gray-900 mb-5">{title}</h2>}
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function App() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [creditFile, setCreditFile] = useState(null);
  const [creditStatus, setCreditStatus] = useState('idle');
  const [rateSheetFile, setRateSheetFile] = useState(null);
  const [rateSheetStatus, setRateSheetStatus] = useState('idle');
  const [parsedCredit, setParsedCredit] = useState(null);
  const [parsedRateSheet, setParsedRateSheet] = useState(null);
  const [profile, setProfile] = useState({ borrowerName:'', currentBalance:'', currentRate:'', currentTermRemaining:'', estimatedValue:'', closingCosts:'', cashOutAmount:'', ficoScore:'', mortgageLender:'', manualRate:'' });
  const [isVeteran, setIsVeteran] = useState(null);
  const [debts, setDebts] = useState([]);
  const [goalType, setGoalType] = useState('rate_term');
  const [selectedPrograms, setSelectedPrograms] = useState(['Conventional', 'FHA']);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const adminMargins = { fha: 0.5, conv: 0.5, va: 0.375 };
  const setP = (key, val) => setProfile(p => ({ ...p, [key]: val }));

  const handleCreditReport = async (file) => {
    setCreditFile(file); setCreditStatus('loading'); setError('');
    try {
      const data = await parseCreditReport(file);
      setParsedCredit(data);
      if (data.borrowerName) setP('borrowerName', data.borrowerName);
      if (data.mortgage) { setP('currentBalance', data.mortgage.balance || ''); setP('mortgageLender', data.mortgage.lender || ''); if (data.mortgage.rate) setP('currentRate', data.mortgage.rate); }
      const fico = data.ficoScores?.transunion || data.ficoScores?.equifax || data.ficoScores?.experian;
      if (fico) setP('ficoScore', fico);
      const tradelineDebts = (data.tradelines || []).map(t => ({ ...t, selected: true, analysis: analyzeDebt(t, 6.5) }));
      setDebts(tradelineDebts);
      setCreditStatus('success');
    } catch (e) { setCreditStatus('error'); setError('Credit report error: ' + e.message); }
  };

  const handleRateSheet = async (file) => {
    setRateSheetFile(file); setRateSheetStatus('loading'); setError('');
    try {
      const data = await parseRateSheet(file, adminMargins);
      setParsedRateSheet(data); setRateSheetStatus('success');
    } catch (e) { setRateSheetStatus('error'); setError('Rate sheet error: ' + e.message); }
  };

  const handleToggleDebt = (index) => setDebts(prev => prev.map((d, i) => i === index ? { ...d, selected: !d.selected } : d));

  const handleAddDebt = (debt) => {
    setDebts(prev => [...prev, { ...debt, selected: true, analysis: analyzeDebt(debt, parseFloat(profile.manualRate) || 6.5) }]);
  };

  const toggleProgram = (p) => setSelectedPrograms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const reAnalyzeDebts = (rate) => setDebts(prev => prev.map(d => ({ ...d, analysis: analyzeDebt(d, parseFloat(rate) || 6.5) })));

  const canProceed = (s) => {
    if (s === 0) return creditStatus === 'success';
    if (s === 1) return !!(profile.currentBalance && profile.currentRate && profile.currentTermRemaining && profile.estimatedValue && isVeteran !== null);
    if (s === 2) return true;
    if (s === 3) return selectedPrograms.length > 0;
    return true;
  };

  const handleGenerate = () => {
    setError(''); setGenerating(true);
    try {
      const clientProfile = {
        borrowerName: profile.borrowerName,
        currentBalance: parseFloat(profile.currentBalance) || 0,
        currentRate: parseFloat(profile.currentRate) || 0,
        currentTermRemaining: parseFloat(profile.currentTermRemaining) || 30,
        estimatedValue: parseFloat(profile.estimatedValue) || 0,
        closingCosts: parseFloat(profile.closingCosts) || 0,
        cashOutAmount: parseFloat(profile.cashOutAmount) || 0,
        ficoScore: parseFloat(profile.ficoScore) || null,
        mortgageLender: profile.mortgageLender,
        manualRate: parseFloat(profile.manualRate) || null,
      };
      const res = generateScenarios({ rateSheet: parsedRateSheet, clientProfile, selectedDebts: debts, currentMortgage: parsedCredit?.mortgage, isVeteran, goalType, selectedPrograms: isVeteran ? selectedPrograms : selectedPrograms.filter(p => p !== 'VA') });
      if (!res.scenarios.length) { setError('No scenarios generated. Upload a rate sheet or enter a manual rate.'); setGenerating(false); return; }
      setResult(res); setStep(4);
    } catch (e) { setError('Error: ' + e.message); }
    setGenerating(false);
  };

  const handleReset = () => { setStep(0); setResult(null); setParsedCredit(null); setParsedRateSheet(null); setCreditStatus('idle'); setRateSheetStatus('idle'); setCreditFile(null); setRateSheetFile(null); setDebts([]); setProfile({ borrowerName:'', currentBalance:'', currentRate:'', currentTermRemaining:'', estimatedValue:'', closingCosts:'', cashOutAmount:'', ficoScore:'', mortgageLender:'', manualRate:'' }); setIsVeteran(null); setSelectedPrograms(['Conventional','FHA']); setGoalType('rate_term'); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-[#0f2d5e] text-white px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-400/20 p-2 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
            <div><div className="font-bold text-lg tracking-tight">ClearRate</div><div className="text-blue-300 text-xs">Smart Refinance Analysis</div></div>
          </div>
          <div className="text-blue-300 text-sm hidden sm:block">Priority 1 Lending</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <StepIndicator current={step} />

        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {step === 0 && (
          <Card title="Upload Client Documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Credit Report <span className="text-red-500">*</span></p>
                <DropZone label="Drop credit report PDF here" sublabel="Claude AI extracts all tradelines automatically" onFile={handleCreditReport} status={creditStatus} fileName={creditFile?.name} />
                {creditStatus === 'success' && parsedCredit && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-green-800">{parsedCredit.borrowerName}</div>
                    <div className="text-green-700 text-xs mt-1">{parsedCredit.tradelines?.length} tradelines · FICO: {parsedCredit.ficoScores?.transunion || parsedCredit.ficoScores?.equifax || '—'}{parsedCredit.mortgage ? ` · Mortgage: $${Math.round(parsedCredit.mortgage.balance).toLocaleString()}` : ''}</div>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Rate Sheet <span className="text-gray-400">(optional)</span></p>
                <DropZone label="Drop lender rate sheet PDF" sublabel="Enables automatic program pricing. Skip to use manual rate." onFile={handleRateSheet} status={rateSheetStatus} fileName={rateSheetFile?.name} />
                {rateSheetStatus === 'success' && parsedRateSheet && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-green-800">{parsedRateSheet.programs?.length} programs parsed</div>
                    <div className="text-green-700 text-xs mt-1">{parsedRateSheet.programs?.map(p => p.type).join(' · ')}</div>
                  </div>
                )}
                {rateSheetStatus === 'idle' && <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">No rate sheet? Enter a manual rate in the next step.</div>}
              </div>
            </div>
          </Card>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <Card title="Client Profile">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Borrower Name"><input className={inp} value={profile.borrowerName} onChange={e => setP('borrowerName', e.target.value)} placeholder="e.g. Lawrence Tribble Jr." /></Field>
                <Field label="FICO Score" hint="Middle score from credit report"><input className={inp} type="number" value={profile.ficoScore} onChange={e => setP('ficoScore', e.target.value)} placeholder="e.g. 680" /></Field>
                <Field label="Estimated Property Value *"><input className={inp} type="number" value={profile.estimatedValue} onChange={e => setP('estimatedValue', e.target.value)} placeholder="e.g. 450000" /></Field>
                <Field label="Estimated Closing Costs"><input className={inp} type="number" value={profile.closingCosts} onChange={e => setP('closingCosts', e.target.value)} placeholder="e.g. 8500" /></Field>
              </div>
            </Card>
            <Card title="Current Mortgage">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Field label="Current Balance *" hint={parsedCredit?.mortgage ? `Parsed: $${Math.round(parsedCredit.mortgage.balance).toLocaleString()}` : ''}><input className={inp} type="number" value={profile.currentBalance} onChange={e => setP('currentBalance', e.target.value)} placeholder="318566" /></Field>
                <Field label="Current Rate (%) *"><input className={inp} type="number" step="0.001" value={profile.currentRate} onChange={e => { setP('currentRate', e.target.value); reAnalyzeDebts(e.target.value); }} placeholder="3.750" /></Field>
                <Field label="Remaining Term (yrs) *"><input className={inp} type="number" value={profile.currentTermRemaining} onChange={e => setP('currentTermRemaining', e.target.value)} placeholder="21" /></Field>
                <Field label="Current Lender"><input className={inp} value={profile.mortgageLender} onChange={e => setP('mortgageLender', e.target.value)} placeholder="LoanCare LLC" /></Field>
                {!parsedRateSheet && <Field label="Manual New Rate (%)" hint="Used when no rate sheet uploaded"><input className={inp} type="number" step="0.001" value={profile.manualRate} onChange={e => setP('manualRate', e.target.value)} placeholder="6.500" /></Field>}
              </div>
            </Card>
            <Card title="Veteran Status">
              <div className="flex items-start gap-3 mb-4">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div><p className="font-semibold text-gray-800">Is the client a veteran or active-duty military?</p><p className="text-sm text-gray-500 mt-0.5">Determines VA loan eligibility — VA loans often have the best rates with no PMI.</p></div>
              </div>
              <div className="flex gap-4">
                {[[true,'🎖️ Yes — VA eligible'],[false,'👤 No — not a veteran']].map(([val, label]) => (
                  <button key={String(val)} onClick={() => { setIsVeteran(val); if (val) setSelectedPrograms(p => [...new Set([...p, 'VA'])]); }}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${isVeteran === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{label}</button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {step === 2 && (
          <Card title="Select Debts to Pay Off at Closing">
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <strong>Smart recommendations shown for each debt.</strong> Each is scored on payment efficiency, 30-year interest cost, and DTI impact. Defaults reflect our recommendation — override as needed.
            </div>
            {debts.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No debts parsed. Add manually below.</p></div>
            ) : (
              <DebtChecklist debts={debts} onToggle={handleToggleDebt} onAddDebt={handleAddDebt} />
            )}
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <Card title="Client's Primary Goal">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[['rate_term','📉','Rate & Term','Lower the rate and/or payment. No cash out.'],['cash_out','💵','Cash-Out','Access equity for improvements, debt payoff, etc.'],['both','🔀','Show Both','Run and compare both scenarios side by side.']].map(([id,icon,label,desc]) => (
                  <button key={id} onClick={() => setGoalType(id)} className={`text-left p-4 rounded-xl border-2 transition-all ${goalType === id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                    <div className="text-2xl mb-2">{icon}</div><div className="font-bold text-gray-900">{label}</div><div className="text-sm text-gray-500 mt-1">{desc}</div>
                  </button>
                ))}
              </div>
              {(goalType === 'cash_out' || goalType === 'both') && (
                <div className="mt-4 max-w-xs">
                  <Field label="Cash-Out Amount"><input className={inp} type="number" value={profile.cashOutAmount} onChange={e => setP('cashOutAmount', e.target.value)} placeholder="e.g. 50000" /></Field>
                </div>
              )}
            </Card>
            <Card title="Loan Programs to Consider">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[['Conventional','🏦','Fannie/Freddie. Best for high FICO, 20%+ equity.',false],['FHA','🏛️','Government-backed. Lower FICO OK. MIP required.',false],['VA','🎖️','Veterans only. No PMI. Often the lowest rate.',!isVeteran]].map(([id,icon,desc,disabled]) => (
                  <button key={id} onClick={() => !disabled && toggleProgram(id)} disabled={disabled}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${disabled ? 'opacity-40 cursor-not-allowed border-gray-200' : selectedPrograms.includes(id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                    <div className="flex items-start justify-between">
                      <div className="text-2xl mb-2">{icon}</div>
                      {selectedPrograms.includes(id) && !disabled && <CheckCircle className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div className="font-bold text-gray-900">{id}</div>
                    <div className="text-sm text-gray-500 mt-1">{disabled ? 'Requires veteran status' : desc}</div>
                  </button>
                ))}
              </div>
              {isVeteran && !selectedPrograms.includes('VA') && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">⚠️ This client is a veteran — consider adding VA to see if it offers better terms.</div>
              )}
            </Card>
          </div>
        )}

        {step === 4 && result && (
          <AnalysisReport result={result} clientProfile={{ ...profile, currentBalance: parseFloat(profile.currentBalance), currentRate: parseFloat(profile.currentRate) }} selectedDebts={debts} companyName="Priority 1 Lending" />
        )}

        <div className="flex items-center justify-between mt-8">
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < 3 && (
            <button onClick={() => canProceed(step) && setStep(s => s + 1)} disabled={!canProceed(step)}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <button onClick={handleGenerate} disabled={generating || !canProceed(3)}
              className="flex items-center gap-2 px-7 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-green-700 transition-colors">
              {generating ? <><Loader className="w-4 h-4 animate-spin" /> Generating…</> : <><DollarSign className="w-4 h-4" /> Generate Analysis</>}
            </button>
          )}
          {step === 4 && (
            <button onClick={handleReset} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              New Analysis
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
