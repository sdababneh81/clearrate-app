import { useState, useEffect } from 'react';
import { FileText, ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Loader, Shield, TrendingDown, DollarSign, Calculator } from 'lucide-react';
import DropZone from './components/DropZone';
import DebtChecklist from './components/DebtChecklist';
import AnalysisReport from './components/AnalysisReport';
import { parseCreditReport, parseRateSheet } from './utils/claudeParser';
import { analyzeDebt } from './utils/debtOptimizer';
import { generateScenarios } from './utils/scenarioEngine';
import { calcPI, reverseEngineerTerm } from './utils/mortgageCalc';

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

function Field({ label, hint, children, highlight }) {
  return (
    <div>
      <label className={`block text-sm font-semibold mb-1 ${highlight ? 'text-blue-700' : 'text-gray-700'}`}>{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function CalcBadge({ label, value }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
      <div className="text-xs text-blue-500 font-medium">{label}</div>
      <div className="font-bold text-blue-800">{value}</div>
    </div>
  );
}

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const inpHighlight = "w-full border-2 border-blue-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50";

const fmt$ = (n) => n ? '$' + Math.round(n).toLocaleString() : '—';
const fmtPct = (n) => n ? n.toFixed(3) + '%' : '—';

export default function App({ user, profile: userProfile, activeRateSheet, crmSession, isIframe, onOpenAdmin, onSignOut, onRateSheetUpdate }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [creditFile, setCreditFile] = useState(null);
  const [creditStatus, setCreditStatus] = useState('idle');
  const [parsedCredit, setParsedCredit] = useState(null);
  // Rate sheet now comes from Supabase (admin uploads once, all LOs get it)
  const [parsedRateSheet, setParsedRateSheet] = useState(activeRateSheet || null);
  const rateSheetStatus = activeRateSheet ? 'success' : 'idle';

  const [profile, setProfile] = useState({
    borrowerName: '', ficoScore: '', estimatedValue: '',
    // Current mortgage
    currentBalance: '', originalLoanAmount: '', currentRate: '', currentTermRemaining: '',
    currentPayment: '', escrow: '', mortgageLender: '', propertyAddress: '',
    // New loan
    titleCharges: '', cashOutAmount: '', manualRate: '',
  });

  // Margin state
  const [marginBPS, setMarginBPS] = useState('');
  const [marginDollar, setMarginDollar] = useState('');
  const [maxPointsPct, setMaxPointsPct] = useState('5');

  const [isVeteran, setIsVeteran] = useState(null);
  const [yearsInHome, setYearsInHome] = useState('');
  const [propertyLookupStatus, setPropertyLookupStatus] = useState('idle'); // idle | loading | found | notfound
  const [debts, setDebts] = useState([]);
  const [goalType, setGoalType] = useState('rate_term');
  const [selectedPrograms, setSelectedPrograms] = useState(['Conventional', 'FHA']);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [crmBadge, setCrmBadge] = useState('');
  const adminMargins = { fha: 0.5, conv: 0.5, va: 0.375 };

  const setP = (key, val) => setProfile(p => ({ ...p, [key]: val }));

  // Sync activeRateSheet from Supabase when it changes
  useEffect(() => {
    if (activeRateSheet) {
      console.log('[App] Loading rate sheet from Supabase:', {
        programs: activeRateSheet.programs?.length,
        effective_date: activeRateSheet.effective_date,
        first_program: activeRateSheet.programs?.[0],
      });
      setParsedRateSheet(activeRateSheet);
    }
  }, [activeRateSheet]);

  // Pre-populate from CRM session if provided
  useEffect(() => {
    if (!crmSession?.borrower) return;
    const b = crmSession.borrower;
    setProfile(p => ({
      ...p,
      borrowerName: b.name || p.borrowerName,
      ficoScore: b.fico || p.ficoScore,
      currentBalance: b.currentBalance || p.currentBalance,
      currentRate: b.currentRate || p.currentRate,
      currentTermRemaining: b.currentTermRemaining || p.currentTermRemaining,
      estimatedValue: b.estimatedValue || p.estimatedValue,
      escrow: b.escrow || p.escrow,
      mortgageLender: b.mortgageLender || p.mortgageLender,
      propertyAddress: b.address || p.propertyAddress,
    }));
    if (b.isVeteran !== undefined) setIsVeteran(b.isVeteran);
    if (crmSession.debts?.length) {
      setDebts(crmSession.debts.map(d => ({ ...d, selected: true })));
    }
    if (crmSession.source) {
      setCrmBadge(`Data pre-loaded from CRM`);
    }
  }, [crmSession]);

  // Auto-calculate P&I when balance/rate/term change
  const calculatedPI = (() => {
    const b = parseFloat(profile.currentBalance);
    const r = parseFloat(profile.currentRate);
    const t = parseFloat(profile.currentTermRemaining);
    if (b && r && t) return calcPI(b, r, t);
    return null;
  })();

  // Auto-calculate remaining term from payment if entered
  const calculatedTerm = (() => {
    const b = parseFloat(profile.currentBalance);
    const r = parseFloat(profile.currentRate);
    const pmt = parseFloat(profile.currentPayment);
    if (b && r && pmt && !profile.currentTermRemaining) return reverseEngineerTerm(b, r, pmt);
    return null;
  })();

  // Auto-fill escrow = total payment minus P&I
  useEffect(() => {
    if (calculatedPI && profile.currentPayment && !profile.escrow) {
      const pmt = parseFloat(profile.currentPayment);
      const autoEscrow = Math.round(pmt - calculatedPI);
      if (autoEscrow > 0) setP('escrow', String(autoEscrow));
    }
  }, [calculatedPI, profile.currentPayment]);

  // Sync margin BPS <-> dollar
  const handleMarginBPS = (val) => {
    setMarginBPS(val);
    const b = parseFloat(val);
    const loan = parseFloat(profile.currentBalance) || 0;
    if (b && loan) setMarginDollar(Math.round((b / 10000) * loan).toString());
  };

  const handleMarginDollar = (val) => {
    setMarginDollar(val);
    const d = parseFloat(val);
    const loan = parseFloat(profile.currentBalance) || 0;
    if (d && loan) setMarginBPS(Math.round((d / loan) * 10000).toString());
  };

  const handleCreditReport = async (file) => {
    setCreditFile(file); setCreditStatus('loading'); setError('');
    try {
      const data = await parseCreditReport(file);
      setParsedCredit(data);
      if (data.borrowerName) setP('borrowerName', data.borrowerName);
      if (data.address) setP('propertyAddress', data.address);
      if (data.mortgage) {
        setP('currentBalance', data.mortgage.balance || '');
        setP('mortgageLender', data.mortgage.lender || '');
        if (data.mortgage.rate) setP('currentRate', data.mortgage.rate);
        if (data.mortgage.originalAmount) setP('originalLoanAmount', data.mortgage.originalAmount);
        if (data.mortgage.payment) setP('currentPayment', data.mortgage.payment);
        // Calculate remaining term from months if available
        if (data.mortgage.monthsRemaining) {
          setP('currentTermRemaining', Math.round(data.mortgage.monthsRemaining / 12 * 10) / 10);
        }
      }
      const fico = data.ficoScores?.transunion || data.ficoScores?.equifax || data.ficoScores?.experian;
      if (fico) setP('ficoScore', fico);
      const tradelineDebts = (data.tradelines || []).map(t => ({ ...t, selected: true, analysis: analyzeDebt(t, 6.5) }));
      setDebts(tradelineDebts);
      setCreditStatus('success');
      // Auto-lookup property value from address
      if (data.address) lookupProperty(data.address);
    } catch (e) { setCreditStatus('error'); setError('Credit report error: ' + e.message); }
  };

  // Rate sheet is now managed by admin via Supabase — no LO upload needed

  const lookupProperty = async (address) => {
    if (!address) return;
    setPropertyLookupStatus('loading');
    try {
      // Handle formats like "7729 NW 21ST ST, MARGATE, FL 33063"
      // or "7729 NW 21ST ST MARGATE FL 33063"
      let streetAddr, city, state, zip;
      const parts = address.split(',').map(s => s.trim());
      if (parts.length >= 3) {
        streetAddr = parts[0];
        city = parts[1];
        const stateZip = parts[2].trim().split(/\s+/);
        state = stateZip[0];
        zip = stateZip[1] || '';
      } else {
        // Try to parse without commas using regex
        const m = address.match(/^(.+?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([A-Z]{2})\s+(\d{5})/);
        if (!m) { setPropertyLookupStatus('notfound'); return; }
        streetAddr = m[1]; city = m[2]; state = m[3]; zip = m[4];
      }

      const res = await fetch('https://avzxphkomiizcxdaezcv.supabase.co/functions/v1/address-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: streetAddr, city, state, zip })
      });
      const data = await res.json();
      const match = data?.matches?.[0];
      if (!match) return;

      // Auto-fill estimated value
      if (match.property?.valueEstimate) {
        setP('estimatedValue', String(Math.round(match.property.valueEstimate)));
        setPropertyLookupStatus('found');
      } else {
        setPropertyLookupStatus('notfound');
      }
      // Auto-fill current rate from lien1 if not already set
      if (match.lien1?.interestRate && !profile.currentRate) {
        setP('currentRate', String(match.lien1.interestRate));
      }
    } catch (e) {
      console.log('Property lookup failed:', e.message);
      setPropertyLookupStatus('notfound');
    }
  };

  const handleToggleDebt = (index) => setDebts(prev => prev.map((d, i) => i === index ? { ...d, selected: !d.selected } : d));
  const handleAddDebt = (debt) => setDebts(prev => [...prev, { ...debt, selected: true, analysis: analyzeDebt(debt, parseFloat(profile.manualRate) || 6.5) }]);
  const toggleProgram = (p) => setSelectedPrograms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const canProceed = (s) => {
    if (s === 0) return creditStatus === 'success';
    if (s === 1) return !!(profile.currentBalance && profile.currentRate && (profile.currentTermRemaining || calculatedTerm) && profile.estimatedValue && isVeteran !== null);
    if (s === 2) return true;
    if (s === 3) return selectedPrograms.length > 0;
    return true;
  };

  const handleGenerate = () => {
    setError(''); setGenerating(true);
    try {
      const term = parseFloat(profile.currentTermRemaining) || calculatedTerm || 30;
      const pi = calculatedPI || calcPI(parseFloat(profile.currentBalance), parseFloat(profile.currentRate), term);
      const clientProfile = {
        borrowerName: profile.borrowerName,
        currentBalance: parseFloat(profile.currentBalance) || 0,
        originalLoanAmount: parseFloat(profile.originalLoanAmount) || 0,
        currentRate: parseFloat(profile.currentRate) || 0,
        currentTermRemaining: term,
        currentPI: pi,
        escrow: parseFloat(profile.escrow) || 0,
        estimatedValue: parseFloat(profile.estimatedValue) || 0,
        titleCharges: parseFloat(profile.titleCharges) || 0,
        cashOutAmount: parseFloat(profile.cashOutAmount) || 0,
        ficoScore: parseFloat(profile.ficoScore) || null,
        mortgageLender: profile.mortgageLender,
        manualRate: parseFloat(profile.manualRate) || null,
      };
      const res = generateScenarios({
        rateSheet: parsedRateSheet,
        clientProfile,
        selectedDebts: debts,
        isVeteran,
        goalType,
        selectedPrograms: isVeteran ? selectedPrograms : selectedPrograms.filter(p => p !== 'VA'),
        marginBPS: parseFloat(marginBPS) || 0,
        marginDollar: parseFloat(marginDollar) || 0,
        yearsInHome: parseFloat(yearsInHome) || null,
        maxPointsPct: parseFloat(maxPointsPct) ?? 5.0,
      });
      console.log('[App] Generate result:', { scenarios: res.scenarios.length, rateSheet: !!parsedRateSheet, programs: parsedRateSheet?.programs?.length, lowRateWarning: res.lowRateWarning });
      if (!res.scenarios.length) {
        setError(res.lowRateWarning || 'No scenarios generated. Add debts to pay off or a cash-out amount to make the refi worthwhile, or enter a manual rate.');
        setGenerating(false);
        return;
      }
      setResult(res); setStep(4);
    } catch (e) { setError('Error: ' + e.message); }
    setGenerating(false);
  };

  const handleReset = () => {
    setStep(0); setResult(null); setParsedCredit(null); setParsedRateSheet(null);
    setCreditStatus('idle'); setRateSheetStatus('idle'); setCreditFile(null); setRateSheetFile(null);
    setDebts([]); setProfile({ borrowerName:'', ficoScore:'', estimatedValue:'', currentBalance:'', originalLoanAmount:'', currentRate:'', currentTermRemaining:'', currentPayment:'', escrow:'', mortgageLender:'', titleCharges:'', cashOutAmount:'', manualRate:'', propertyAddress:'' });
    setIsVeteran(null); setSelectedPrograms(['Conventional','FHA']); setGoalType('rate_term');
    setMarginBPS(''); setMarginDollar(''); setYearsInHome(''); setMaxPointsPct('5');
    setCrmBadge('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-[#0f2d5e] text-white px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-400/20 p-2 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
            <div><div className="font-bold text-lg tracking-tight">ClearRate</div><div className="text-blue-300 text-xs">Smart Refinance Analysis</div></div>
          </div>
          <div className="flex items-center gap-3">
            {rateSheetStatus === 'success' && parsedRateSheet && (
              <div className="hidden sm:flex items-center gap-1.5 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-1.5 text-xs text-green-300">
                <span>📊</span>
                <span>{parsedRateSheet.effective_date || parsedRateSheet.effectiveDate || 'Rate sheet'} · {parsedRateSheet.programs?.length} programs</span>
              </div>
            )}
            {crmBadge && (
              <div className="hidden sm:flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg px-3 py-1.5 text-xs text-blue-300">
                <span>🔗</span><span>{crmBadge}</span>
              </div>
            )}
            {onOpenAdmin && (
              <button onClick={onOpenAdmin} className="hidden sm:flex items-center gap-1.5 bg-purple-500/20 border border-purple-400/30 hover:bg-purple-500/30 rounded-lg px-3 py-1.5 text-xs text-purple-300 transition-colors font-semibold">
                ⚙️ Admin
              </button>
            )}
            {onSignOut && !isIframe && (
              <button onClick={onSignOut} className="text-blue-400 hover:text-white text-xs transition-colors">
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <StepIndicator current={step} />

        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {/* STEP 0 — Upload */}
        {step === 0 && (
          <Card title="Upload Client Documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Credit Report <span className="text-red-500">*</span></p>
                <DropZone label="Drop credit report PDF here" sublabel="Claude AI extracts all tradelines automatically" onFile={handleCreditReport} status={creditStatus} fileName={creditFile?.name} />
                {creditStatus === 'success' && parsedCredit && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-green-800">{parsedCredit.borrowerName}</div>
                    <div className="text-green-700 text-xs mt-1">
                      {parsedCredit.tradelines?.length} tradelines · FICO: {parsedCredit.ficoScores?.transunion || parsedCredit.ficoScores?.equifax || '—'}
                      {parsedCredit.mortgage ? ` · Mortgage: ${fmt$(parsedCredit.mortgage.balance)}` : ''}
                      {parsedCredit.mortgage?.monthsRemaining ? ` · ${Math.round(parsedCredit.mortgage.monthsRemaining / 12 * 10) / 10} yrs remaining` : ''}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Rate Sheet</p>
                {parsedRateSheet ? (
                  <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4 flex items-center gap-3">
                    <div className="text-2xl">📊</div>
                    <div>
                      <div className="font-semibold text-green-800 text-sm">Rate Sheet Active</div>
                      <div className="text-green-700 text-xs mt-0.5">
                        Effective: {parsedRateSheet.effective_date || parsedRateSheet.effectiveDate || 'Current'} · {parsedRateSheet.programs?.length} programs loaded
                      </div>
                      <div className="text-green-600 text-xs mt-0.5">{parsedRateSheet.programs?.map(p => p.type).join(' · ')}</div>
                      <div className="text-green-500 text-xs mt-1 italic">Managed by admin · updates automatically</div>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4">
                    <div className="font-semibold text-amber-800 text-sm">⚠️ No rate sheet loaded</div>
                    <div className="text-amber-700 text-xs mt-1">Ask your admin to upload the current UWM rate sheet. You can still enter a manual rate in Step 2.</div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* STEP 1 — Client Profile */}
        {step === 1 && (
          <div className="space-y-6">

            {/* Current Mortgage */}
            <Card title="Current Mortgage">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Field label="Current Balance *" hint={parsedCredit?.mortgage ? `From credit report` : ''}>
                  <input className={inp} type="number" value={profile.currentBalance} onChange={e => setP('currentBalance', e.target.value)} placeholder="318566" />
                </Field>
                <Field label="Original Loan Amount" hint="From credit report or statement">
                  <input className={inp} type="number" value={profile.originalLoanAmount} onChange={e => setP('originalLoanAmount', e.target.value)} placeholder="350000" />
                </Field>
                <Field label="Current Lender">
                  <input className={inp} value={profile.mortgageLender} onChange={e => setP('mortgageLender', e.target.value)} placeholder="LoanCare LLC" />
                </Field>

                <Field label="Current Interest Rate (%) *">
                  <input className={inpHighlight} type="number" step="0.001" value={profile.currentRate} onChange={e => setP('currentRate', e.target.value)} placeholder="3.750" />
                </Field>
                <Field label="Remaining Term (years) *" hint={calculatedTerm ? `Calculated from payment: ${calculatedTerm} yrs` : 'From credit report'}>
                  <input className={inp} type="number" step="0.5" value={profile.currentTermRemaining} onChange={e => setP('currentTermRemaining', e.target.value)} placeholder="21" />
                </Field>
                <Field label="Current Total Payment" hint="Enter P&I+Escrow to help verify">
                  <input className={inp} type="number" value={profile.currentPayment} onChange={e => setP('currentPayment', e.target.value)} placeholder="1847" />
                </Field>
              </div>

              {/* Calculated P&I breakdown */}
              {calculatedPI && (
                <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-800">Reverse Engineered Payment Breakdown</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <CalcBadge label="P&I (calculated)" value={fmt$(calculatedPI)} />
                    <CalcBadge label="Escrow (enter below)" value={profile.escrow ? fmt$(parseFloat(profile.escrow)) : 'Enter below'} />
                    <CalcBadge label="Total PITI" value={profile.escrow ? fmt$(calculatedPI + parseFloat(profile.escrow)) : '—'} />
                    {profile.currentPayment && (
                      <CalcBadge
                        label="Difference"
                        value={fmt$(Math.abs(parseFloat(profile.currentPayment) - calculatedPI - (parseFloat(profile.escrow) || 0)))}
                      />
                    )}
                  </div>
                  <div className="mt-3 max-w-xs">
                    <Field label="Escrow (taxes + insurance / mo)" highlight>
                      <input className={inpHighlight} type="number" value={profile.escrow} onChange={e => setP('escrow', e.target.value)} placeholder="e.g. 650" />
                    </Field>
                  </div>
                </div>
              )}
            </Card>

            {/* Property & Client */}
            <Card title="Property & Client">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Borrower Name">
                  <input className={inp} value={profile.borrowerName} onChange={e => setP('borrowerName', e.target.value)} placeholder="Lawrence Tribble Jr." />
                </Field>
                <Field label="FICO Score" hint="Middle score from credit report">
                  <input className={inp} type="number" value={profile.ficoScore} onChange={e => setP('ficoScore', e.target.value)} placeholder="680" />
                </Field>
                <Field label="Estimated Property Value *" hint={propertyLookupStatus === 'loading' ? '🔍 Looking up via P1 API...' : propertyLookupStatus === 'found' ? '✅ Auto-filled from P1 property lookup' : propertyLookupStatus === 'notfound' ? '⚠️ Not found — enter manually' : ''}>
                  <input className={inp} type="number" value={profile.estimatedValue} onChange={e => setP('estimatedValue', e.target.value)} placeholder="450000" />
                </Field>
              </div>
            </Card>

            {/* New Loan Costs */}
            <Card title="New Loan — Charges & Margin">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Title & Settlement Charges" hint="Your title company fees — rolled into new loan">
                  <input className={inpHighlight} type="number" value={profile.titleCharges} onChange={e => setP('titleCharges', e.target.value)} placeholder="e.g. 3500" />
                </Field>
                {!parsedRateSheet && (
                  <Field label="Manual New Rate (%)" hint="Used when no rate sheet uploaded">
                    <input className={inp} type="number" step="0.001" value={profile.manualRate} onChange={e => setP('manualRate', e.target.value)} placeholder="6.500" />
                  </Field>
                )}
              </div>

              {/* Margin entry */}
              <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm font-bold text-amber-800 mb-3">Your Margin</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Margin in BPS" hint="e.g. 150 = 1.5%">
                    <input className={inp} type="number" value={marginBPS} onChange={e => handleMarginBPS(e.target.value)} placeholder="e.g. 150" />
                  </Field>
                  <Field label="Margin in Dollars" hint="Auto-calculated from BPS">
                    <input className={inp} type="number" value={marginDollar} onChange={e => handleMarginDollar(e.target.value)} placeholder="e.g. 4500" />
                  </Field>
                </div>
                {marginBPS && profile.currentBalance && (
                  <div className="mt-3 text-xs text-amber-700">
                    {marginBPS} BPS = {(parseFloat(marginBPS)/100).toFixed(3)}% added to rate · {fmt$(parseFloat(marginDollar))} rolled into loan balance
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-amber-200">
                  <Field label="Max Points Borrower Can Pay (%)" hint="Rates requiring more points than this are excluded">
                    <div className="flex items-center gap-3">
                      <input className={inp} type="number" step="0.5" min="0" max="10" value={maxPointsPct} onChange={e => setMaxPointsPct(e.target.value)} placeholder="5.0" style={{maxWidth:'120px'}} />
                      <div className="flex gap-1.5">
                        {['0','1','2','3','5'].map(v => (
                          <button key={v} onClick={() => setMaxPointsPct(v)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${maxPointsPct === v ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-amber-200 text-amber-600 bg-white hover:border-amber-400'}`}>
                            {v === '0' ? 'Par only' : `${v}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Field>
                </div>
              </div>
            </Card>

            {/* Veteran Status */}
            <Card title="Veteran Status">
              <div className="flex items-start gap-3 mb-4">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="font-semibold text-gray-800">Is the client a veteran or active-duty military?</p>
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

        {/* STEP 2 — Debts */}
        {step === 2 && (
          <Card title="Select Debts to Pay Off at Closing">
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <strong>Smart recommendations shown for each debt.</strong> Defaults reflect recommendation — override as needed.
            </div>
            {debts.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No debts parsed. Add manually below.</p></div>
            ) : (
              <DebtChecklist debts={debts} onToggle={handleToggleDebt} onAddDebt={handleAddDebt} />
            )}
          </Card>
        )}

        {/* STEP 3 — Goals */}
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

              {/* Planning Horizon */}
              <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-xl">🏠</span>
                  <div>
                    <div className="font-semibold text-amber-900 text-sm">How long does the client plan to stay in this home?</div>
                    <div className="text-xs text-amber-700 mt-0.5">This changes the recommendation. Selling in 3 years? Lender credits beat a lower rate that requires points.</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[['2','2 yrs'],['3','3 yrs'],['5','5 yrs'],['7','7 yrs'],['10','10 yrs'],['','Long-term (30yr)']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setYearsInHome(val)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                        yearsInHome === val
                          ? 'border-amber-500 bg-amber-100 text-amber-800'
                          : 'border-amber-200 text-amber-700 hover:border-amber-400 bg-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {yearsInHome && (
                  <div className="mt-2 text-xs text-amber-700 font-medium">
                    ✓ Scoring optimized for {yearsInHome}-year horizon — options that recoup before year {yearsInHome} will be prioritized
                  </div>
                )}
              </div>
            </Card>

            <Card title="Loan Programs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[['Conventional','🏦','Best for high FICO, 20%+ equity.',false],['FHA','🏛️','Lower FICO OK. MIP required.',false],['VA','🎖️','Veterans only. No PMI.',!isVeteran]].map(([id,icon,desc,disabled]) => (
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
            </Card>

            {/* New loan balance summary before generating */}
            <Card title="New Loan Balance Summary">
              {(() => {
                const bal = parseFloat(profile.currentBalance) || 0;
                const debtsTotal = debts.filter(d => d.selected).reduce((s, d) => s + (d.balance || 0), 0);
                const title = parseFloat(profile.titleCharges) || 0;
                const cash = goalType !== 'rate_term' ? (parseFloat(profile.cashOutAmount) || 0) : 0;
                const margin = parseFloat(marginDollar) || 0;
                const total = bal + debtsTotal + title + cash + margin;
                return (
                  <div className="space-y-2 text-sm">
                    {[
                      ['Current Mortgage Balance', bal],
                      ['Debts Being Paid Off', debtsTotal],
                      ['Title & Settlement Charges', title],
                      ...(cash ? [['Cash-Out Amount', cash]] : []),
                      ...(margin ? [['Your Margin (rolled in)', margin]] : []),
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between py-1.5 border-b border-gray-100">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-semibold">{fmt$(val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 text-base font-bold text-blue-800">
                      <span>New Loan Balance</span>
                      <span>{fmt$(total)}</span>
                    </div>
                    {profile.estimatedValue && (
                      <div className="text-xs text-gray-400 text-right">
                        LTV: {((total / parseFloat(profile.estimatedValue)) * 100).toFixed(1)}% of {fmt$(parseFloat(profile.estimatedValue))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </Card>
          </div>
        )}

        {/* STEP 4 — Analysis */}
        {step === 4 && result && (
          <AnalysisReport
            result={result}
            clientProfile={{ ...profile, currentBalance: parseFloat(profile.currentBalance), currentRate: parseFloat(profile.currentRate), escrow: parseFloat(profile.escrow) || 0, titleCharges: parseFloat(profile.titleCharges) || 0 }}
            selectedDebts={debts}
            marginBPS={marginBPS}
            marginDollar={marginDollar}
            companyName="Priority 1 Lending"
          />
        )}

        {/* Navigation */}
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



