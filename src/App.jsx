import { useState, useEffect, useRef } from 'react';
import { FileText, ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Loader, Shield, TrendingDown, DollarSign, Calculator, Save, FolderOpen, Trash2, X, Pencil, Copy, Settings, LogOut } from 'lucide-react';
import DropZone from './components/DropZone';
import DebtChecklist from './components/DebtChecklist';
import AnalysisReport from './components/AnalysisReport';
import { parseCreditReport, parseRateSheet } from './utils/claudeParser';
import { getActiveRateSheet, saveAnalysis, getSavedAnalyses, getSavedAnalysis, deleteSavedAnalysis, getMarginSettings, renameAnalysis, duplicateAnalysis, findAnalysisByBorrower } from './lib/supabase.js';
import { analyzeDebt } from './utils/debtOptimizer';
import { generateScenarios } from './utils/scenarioEngine';
import { calcPI, reverseEngineerTerm } from './utils/mortgageCalc';

const STEPS = ['Upload', 'Client Profile', 'Debts', 'Goals & Programs', 'Analysis'];

// Cash-out LTV ceiling by route. Veterans go VA (90%); everyone else is Conv/FHA (80%).
// Used to hard-block checking debts that would push the new loan past the product max.
export function cashOutLtvCap(isVeteran) {
  return isVeteran === true ? 90 : 80;
}


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
    <div className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm ${className || ''}`}>
      {title && <h2 className="text-base font-bold text-gray-900 mb-3">{title}</h2>}
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
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm">
      <div className="text-xs text-blue-500 font-medium">{label}</div>
      <div className="font-bold text-blue-800">{value}</div>
    </div>
  );
}

const inp = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const inpHighlight = "w-full border-2 border-blue-400 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50";
// Selectable option-card (used for goal/program/veteran toggles) — one consistent pattern
const optionCard = (active) => `text-left p-4 rounded-xl border-2 transition-all ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`;

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
  const rateSheetStatus = parsedRateSheet ? 'success' : 'idle';

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
  const [fundingFeeExempt, setFundingFeeExempt] = useState(false);
  const [convMI, setConvMI] = useState('');
  const [convMIType, setConvMIType] = useState('percent'); // 'percent' | 'dollar'
  const [ltvBlock, setLtvBlock] = useState(null);   // {ltv, cap, programs} when a debt toggle is blocked
  const autoSaveRef = useRef({ savedRef: null, timer: null });
  const [yearsInHome, setYearsInHome] = useState('');
  const [propertyLookupStatus, setPropertyLookupStatus] = useState('idle'); // idle | loading | found | notfound
  const [debts, setDebts] = useState([]);
  const [goalType, setGoalType] = useState('rate_term');
  const [selectedPrograms, setSelectedPrograms] = useState(['Conventional', 'FHA']);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [crmBadge, setCrmBadge] = useState('');
  const [pricingStrategies, setPricingStrategies] = useState(['lowest_rate', 'margin_cost', 'no_cost']);
  const [lenderFees, setLenderFees] = useState('');

  // ─── Saved files (client analyses) ───────────────────────────
  const [currentFileId, setCurrentFileId] = useState(null);   // id of the loaded/saved file
  const [currentFileName, setCurrentFileName] = useState('');  // display name on screen
  const [currentRunRef, setCurrentRunRef] = useState(null);    // human run id, e.g. CR-7F3KQX
  const [savedFiles, setSavedFiles] = useState([]);
  const [showFiles, setShowFiles] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');        // idle | saving | saved | error
  const [filesLoading, setFilesLoading] = useState(false);
  const adminMargins = { fha: 0.5, conv: 0.5, va: 0.375 };

  // Central per-program margins (BPS), set by managers in Admin and hidden from LOs.
  const [marginSettings, setMarginSettings] = useState({ conventional: 0, fha: 0, va: 0 });

  const setP = (key, val) => setProfile(p => ({ ...p, [key]: val }));

  // Load the central margin settings once on mount.
  useEffect(() => {
    getMarginSettings()
      .then(m => { if (m) setMarginSettings({ conventional: 0, fha: 0, va: 0, ...m }); })
      .catch(e => console.error('[App] margin settings fetch error:', e?.message));
  }, []);

  // Fetch rate sheet directly from Supabase on mount — don't rely on prop timing
  useEffect(() => {
    const loadSheet = async () => {
      try {
        // Use prop if already loaded, otherwise fetch directly
        if (activeRateSheet?.programs?.length) {
          console.log('[App] Rate sheet from prop:', activeRateSheet.programs.length, 'programs');
          setParsedRateSheet(activeRateSheet);
          return;
        }
        console.log('[App] Fetching rate sheet directly from Supabase...');
        const sheet = await getActiveRateSheet();
        if (sheet?.programs?.length) {
          console.log('[App] Rate sheet fetched:', sheet.programs.length, 'programs, effective:', sheet.effective_date);
          setParsedRateSheet(sheet);
          if (onRateSheetUpdate) onRateSheetUpdate(sheet);
        } else {
          console.log('[App] No active rate sheet found in Supabase');
        }
      } catch (e) {
        console.error('[App] Rate sheet fetch error:', e.message);
      }
    };
    loadSheet();
  }, []);

  // Auto-set goalType to cash_out when debts are selected or cash-out amount entered
  useEffect(() => {
    const hasSelectedDebts = debts.some(d => d.selected);
    const hasCashOut = parseFloat(profile.cashOutAmount) > 0;
    if (hasSelectedDebts || hasCashOut) {
      if (goalType === 'rate_term') setGoalType('cash_out');
    }
  }, [debts, profile.cashOutAmount]);

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
      setDebts(crmSession.debts.map(d => ({ ...d, selected: false, analysis: analyzeDebt(d, 6.5) })));
    }
    if (crmSession.source) {
      setCrmBadge(`Data pre-loaded from CRM`);
    }
  }, [crmSession]);

  // Auto-calculate P&I when balance/rate/term change
  // Reverse-engineer the remaining term from balance + rate + payment when the
  // LO hasn't typed a term. P&I then uses whichever term we have (typed or derived)
  // so the payment breakdown shows up even when the term is inferred from payment.
  const calculatedTerm = (() => {
    const b = parseFloat(profile.currentBalance);
    const r = parseFloat(profile.currentRate);
    const pmt = parseFloat(profile.currentPayment);
    if (b && r && pmt && !profile.currentTermRemaining) return reverseEngineerTerm(b, r, pmt);
    return null;
  })();

  const effectiveTerm = parseFloat(profile.currentTermRemaining) || calculatedTerm;

  const calculatedPI = (() => {
    const b = parseFloat(profile.currentBalance);
    const r = parseFloat(profile.currentRate);
    const t = effectiveTerm;
    if (b && r && t) return calcPI(b, r, t);
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
      const tradelineDebts = (data.tradelines || [])
        .map(t => ({ ...t, selected: false, analysis: analyzeDebt(t, 6.5) }))
        // Sort by payment-to-balance ratio descending — best DTI-relief-per-dollar first
        .sort((a, b) => (b.analysis?.paymentToBalanceRatio || 0) - (a.analysis?.paymentToBalanceRatio || 0));
      // Prepend mortgage as first item (display only — not payable, just shown for context)
      const mortgageItem = data.mortgage ? [{
        name: data.mortgage.lender || 'Current Mortgage',
        balance: data.mortgage.balance,
        payment: data.mortgage.payment || 0,
        type: 'Mortgage',
        isMortgage: true,
        selected: false, // mortgage is never "paid off" — it IS being refinanced
        analysis: null,
      }] : [];
      setDebts([...mortgageItem, ...tradelineDebts]);
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
      if (!match) { setPropertyLookupStatus('notfound'); return; }

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

  const handleToggleDebt = (index) => setDebts(prev => {
    const target = prev[index];
    const turningOn = target && !target.selected;
    if (turningOn) {
      // Hard block: would adding this debt push the new loan past the cash-out LTV cap?
      const selectedAfter = prev.filter((d, i) => (i === index || d.selected) && !d.isMortgage);
      const debtTotal = selectedAfter.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
      const newLoan = (parseFloat(profile.currentBalance) || 0) + debtTotal
        + (parseFloat(profile.cashOutAmount) || 0)
        + (parseFloat(profile.titleCharges) || 0)
        + (parseFloat(profile.lenderFees) || 0);
      const value = parseFloat(profile.estimatedValue) || 0;
      const cap = cashOutLtvCap(isVeteran);
      if (value > 0) {
        const ltv = Math.round((newLoan / value) * 1000) / 10;
        if (ltv > cap + 1e-9) {
          setLtvBlock({ ltv, cap, isVeteran, debtName: target.name });
          return prev; // don't toggle on
        }
      }
    }
    return prev.map((d, i) => i === index ? { ...d, selected: !d.selected } : d);
  });
  const handleAddDebt = (debt) => setDebts(prev => [...prev, { ...debt, selected: true, analysis: analyzeDebt(debt, parseFloat(profile.manualRate) || 6.5) }]);
  // Select all debts the optimizer flags as 'recommended' (high relief ratio, efficient to consolidate)
  const handleSelectRecommended = () => setDebts(prev => prev.map(d =>
    d.isMortgage ? d : { ...d, selected: d.analysis?.badge === 'recommended' ? true : d.selected }
  ));
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
        lenderFees: parseFloat(lenderFees) || 0,
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
        marginsByType: marginSettings,
        yearsInHome: parseFloat(yearsInHome) || null,
        maxPointsPct: Number.isFinite(parseFloat(maxPointsPct)) ? parseFloat(maxPointsPct) : 5.0,
        pricingStrategies,
        fundingFeeExempt,
        convMI: parseFloat(convMI) || 0,
        convMIType,
        runRef: currentRunRef || undefined,
      });
      if (res?.runRef) setCurrentRunRef(res.runRef);
      console.log('[App] Generate result:', { status: res.status, scenarios: res.scenarios?.length, strategyResults: res.strategyResults?.length, rateSheet: !!parsedRateSheet, programs: parsedRateSheet?.programs?.length });

      // Always advance to the analysis step with the result. The report renders the
      // appropriate state (scenarios, low-rate guidance, all-negative notice, or a
      // clear error) based on res.status — we never leave the user on a blank screen.
      setResult(res);
      setStep(4);
      setGenerating(false);
    } catch (e) {
      console.error('[App] Generate failed:', e);
      setError('Something went wrong generating the analysis: ' + (e?.message || e) + '. Please check the borrower profile and rate sheet, then try again.');
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setStep(0); setResult(null); setParsedCredit(null); setParsedRateSheet(null);
    setCreditStatus('idle'); setCreditFile(null); setRateSheetFile(null);
    setDebts([]); setProfile({ borrowerName:'', ficoScore:'', estimatedValue:'', currentBalance:'', originalLoanAmount:'', currentRate:'', currentTermRemaining:'', currentPayment:'', escrow:'', mortgageLender:'', titleCharges:'', cashOutAmount:'', manualRate:'', propertyAddress:'' });
    setIsVeteran(null); setFundingFeeExempt(false); setConvMI(''); setConvMIType('percent'); setSelectedPrograms(['Conventional','FHA']); setGoalType('rate_term');
    setMarginBPS(''); setMarginDollar(''); setYearsInHome(''); setMaxPointsPct('5');
    setCrmBadge(''); setLenderFees(''); setPricingStrategies(['lowest_rate', 'margin_cost', 'no_cost']);
    setCurrentFileId(null); setCurrentFileName(''); setCurrentRunRef(null); setSaveStatus('idle');
    autoSaveRef.current = { savedRef: null, timer: null };
  };

  // ─── Saved files: snapshot the full input state so a file is reproducible ──
  const buildSnapshot = () => ({
    version: 1,
    profile,
    debts,
    isVeteran,
    selectedPrograms,
    goalType,
    marginBPS,
    marginDollar,
    marginsByType: marginSettings,
    maxPointsPct,
    yearsInHome,
    lenderFees,
    pricingStrategies,
    fundingFeeExempt,
    convMI,
    convMIType,
    runRef: currentRunRef || null,
    // Snapshot the rate sheet used so the analysis can be reproduced even after
    // the active sheet changes day-to-day.
    rateSheet: parsedRateSheet,
  });

  // ─── Auto-save: every completed analysis is saved without a button press. ──
  // Updates the SAME file for the current borrower/run (keyed by currentFileId)
  // so re-running doesn't pile up duplicates; a new borrower (after Reset) starts
  // a fresh file. "Save as New" still lets the LO deliberately fork a scenario.
  useEffect(() => {
    if (step !== 4 || !result || generating || !user?.id) return;
    const rr = result.runRef || currentRunRef;
    if (!rr) return;
    if (autoSaveRef.current.savedRef === rr && currentFileId) return; // already saved this run
    clearTimeout(autoSaveRef.current.timer);
    autoSaveRef.current.timer = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        const rec = result.recommended;
        const summary = rec ? {
          rate: rec.rate, monthlySavings: rec.monthlySavings, program: rec.program,
          isARM: rec.isARM, goal: rec.goal, newLoanAmount: rec.newLoanAmount,
        } : null;
        // If we're not already tied to a file, look for an existing file for this
        // same borrower (name + property address) and overwrite it instead of
        // creating a duplicate. New borrower/address → new file.
        let targetId = currentFileId;
        if (!targetId) {
          try {
            const existing = await findAnalysisByBorrower(user.id, profile.borrowerName, profile.propertyAddress);
            if (existing) targetId = existing.id;
          } catch (e) { console.warn('[autosave] borrower lookup failed, will create new:', e); }
        }
        const saved = await saveAnalysis({
          id: targetId || undefined,
          fileName: (currentFileName || profile.borrowerName || 'Untitled').trim(),
          borrowerName: profile.borrowerName || 'Untitled',
          propertyAddress: profile.propertyAddress || null,
          snapshot: buildSnapshot(),
          userId: user.id,
          runRef: rr,
          summary,
        });
        setCurrentFileId(saved.id);
        if (!currentFileName) setCurrentFileName(saved.file_name);
        autoSaveRef.current.savedRef = rr;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {
        console.error('[autosave] failed:', e);
        setSaveStatus('error');
      }
    }, 900);
    return () => clearTimeout(autoSaveRef.current.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, step, generating, user, currentFileId, currentRunRef]);

  const applySnapshot = (snap) => {
    if (!snap) return;
    if (snap.profile) setProfile(snap.profile);
    if (snap.debts) setDebts(snap.debts);
    setIsVeteran(snap.isVeteran ?? null);
    if (snap.selectedPrograms) setSelectedPrograms(snap.selectedPrograms);
    setGoalType(snap.goalType || 'rate_term');
    setMarginBPS(snap.marginBPS ?? '');
    setMarginDollar(snap.marginDollar ?? '');
    setMaxPointsPct(snap.maxPointsPct ?? '5');
    setYearsInHome(snap.yearsInHome ?? '');
    setLenderFees(snap.lenderFees ?? '');
    if (snap.pricingStrategies) setPricingStrategies(snap.pricingStrategies);
    setFundingFeeExempt(snap.fundingFeeExempt || false);
    setConvMI(snap.convMI ?? '');
    setConvMIType(snap.convMIType || 'percent');
    setCurrentRunRef(snap.runRef || null);
    if (snap.rateSheet) { setParsedRateSheet(snap.rateSheet); }
  };

  const loadSavedFiles = async () => {
    if (!user?.id) return;
    setFilesLoading(true);
    try {
      const files = await getSavedAnalyses(user.id);
      setSavedFiles(files);
    } catch (e) {
      console.error('[Files] load list failed:', e);
    }
    setFilesLoading(false);
  };

  const handleOpenFiles = () => { setShowFiles(true); loadSavedFiles(); };

  const handleSaveFile = async ({ asNew = false } = {}) => {
    if (!user?.id) { setError('You must be signed in to save files.'); return; }
    const name = (currentFileName || profile.borrowerName || 'Untitled').trim();
    setSaveStatus('saving');
    try {
      const rec = result?.recommended;
      const summary = rec ? {
        rate: rec.rate,
        monthlySavings: rec.monthlySavings,
        program: rec.program,
        isARM: rec.isARM,
        goal: rec.goal,
        newLoanAmount: rec.newLoanAmount,
      } : null;
      const saved = await saveAnalysis({
        id: asNew ? undefined : (currentFileId || undefined),
        fileName: asNew ? `${name} (v2)` : name,
        borrowerName: profile.borrowerName || name,
        propertyAddress: profile.propertyAddress || null,
        snapshot: buildSnapshot(),
        userId: user.id,
        runRef: result?.runRef || currentRunRef || null,
        summary,
      });
      setCurrentFileId(saved.id);
      setCurrentFileName(saved.file_name);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      console.error('[Files] save failed:', e);
      setSaveStatus('error');
      setError('Could not save file: ' + (e?.message || e));
    }
  };

  const handleRenameFile = async (fileId, currentName) => {
    const next = (prompt('Rename file:', currentName) || '').trim();
    if (!next || next === currentName) return;
    try {
      const updated = await renameAnalysis(fileId, next);
      setSavedFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updated } : f));
      if (currentFileId === fileId) setCurrentFileName(next);
    } catch (e) {
      console.error('[Files] rename failed:', e);
      setError('Could not rename file: ' + (e?.message || e));
    }
  };

  const handleDuplicateFile = async (fileId) => {
    try {
      const copy = await duplicateAnalysis(fileId, user.id);
      setSavedFiles(prev => [copy, ...prev]);
    } catch (e) {
      console.error('[Files] duplicate failed:', e);
      setError('Could not duplicate file: ' + (e?.message || e));
    }
  };

  const handleOpenFile = async (fileId, { edit = false } = {}) => {
    setFilesLoading(true);
    setError('');
    try {
      const file = await getSavedAnalysis(fileId, user?.id);
      if (!file) throw new Error('File not found (it may belong to another account or was deleted).');
      const snap = file.snapshot || {};
      applySnapshot(snap);
      setCurrentFileId(file.id);
      setCurrentFileName(file.file_name);
      autoSaveRef.current.savedRef = snap.runRef || file.run_ref || null;
      setShowFiles(false);
      setResult(null);
      setStep(edit ? 1 : 4);
      if (!edit) {
        setTimeout(() => regenerateFromState(snap), 0);
      }
    } catch (e) {
      console.error('[Files] open failed:', e);
      setError('Could not open file: ' + (e?.message || e));
    }
    setFilesLoading(false);
  };

  // Generate scenarios directly from a snapshot (used when opening a saved file)
  const regenerateFromState = (snap) => {
    try {
      if (!snap || !snap.profile) throw new Error('Saved file is missing input data.');
      const clientProfile = {
        ...snap.profile,
        currentBalance: parseFloat(snap.profile.currentBalance),
        currentRate: parseFloat(snap.profile.currentRate),
        escrow: parseFloat(snap.profile.escrow) || 0,
        titleCharges: parseFloat(snap.profile.titleCharges) || 0,
        lenderFees: parseFloat(snap.lenderFees) || 0,
      };
      const res = generateScenarios({
        rateSheet: snap.rateSheet,
        clientProfile,
        selectedDebts: snap.debts || [],
        isVeteran: snap.isVeteran,
        goalType: snap.goalType,
        selectedPrograms: snap.isVeteran ? snap.selectedPrograms : (snap.selectedPrograms || []).filter(p => p !== 'VA'),
        marginBPS: parseFloat(snap.marginBPS) || 0,
        marginDollar: parseFloat(snap.marginDollar) || 0,
        marginsByType: snap.marginsByType || marginSettings,
        yearsInHome: parseFloat(snap.yearsInHome) || null,
        maxPointsPct: Number.isFinite(parseFloat(snap.maxPointsPct)) ? parseFloat(snap.maxPointsPct) : 5.0,
        pricingStrategies: snap.pricingStrategies || ['lowest_rate', 'margin_cost', 'no_cost'],
        fundingFeeExempt: snap.fundingFeeExempt || false,
        convMI: parseFloat(snap.convMI) || 0,
        convMIType: snap.convMIType || 'percent',
        runRef: snap.runRef || undefined,
      });
      if (res?.runRef) setCurrentRunRef(res.runRef);
      setResult(res);
    } catch (e) {
      console.error('[Files] regenerate failed:', e);
      setError('Could not rebuild analysis from saved file: ' + (e?.message || e));
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteSavedAnalysis(fileId);
      setSavedFiles(prev => prev.filter(f => f.id !== fileId));
      if (currentFileId === fileId) { setCurrentFileId(null); setCurrentFileName(''); }
    } catch (e) {
      console.error('[Files] delete failed:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">
      {/* ─── Left sidebar nav ─── */}
      <aside className="w-56 flex-shrink-0 bg-[#0f2d5e] text-white flex flex-col px-3 py-4 sticky top-0 self-start h-screen">
        <div className="flex items-center gap-2 px-2 pb-4 mb-3 border-b border-white/10">
          <div className="bg-blue-400/20 p-2 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
          <div>
            <div className="font-bold text-base tracking-tight leading-tight">ClearRate</div>
            <div className="text-blue-300 text-[11px]">Smart Refinance</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {!isIframe && (
            <button onClick={handleOpenFiles}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-blue-100 hover:bg-white/10 transition-colors text-left font-medium">
              <FolderOpen className="w-4 h-4 flex-shrink-0" /> My Files
            </button>
          )}
          {onOpenAdmin && (
            <button onClick={onOpenAdmin}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-blue-100 hover:bg-white/10 transition-colors text-left font-medium">
              <Settings className="w-4 h-4 flex-shrink-0" /> Admin
            </button>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-3">
          {rateSheetStatus === 'success' && parsedRateSheet && (
            <div className="flex items-center gap-1.5 bg-green-500/15 border border-green-400/20 rounded-lg px-2.5 py-1.5 text-[11px] text-green-300">
              <span>📊</span>
              <span className="truncate">{parsedRateSheet.effective_date || parsedRateSheet.effectiveDate || 'Rate sheet'} · {parsedRateSheet.programs?.length} programs</span>
            </div>
          )}
          {crmBadge && (
            <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-400/20 rounded-lg px-2.5 py-1.5 text-[11px] text-blue-300">
              <span>🔗</span><span className="truncate">{crmBadge}</span>
            </div>
          )}
          {onSignOut && !isIframe && (
            <button onClick={onSignOut}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-white/10 hover:text-white transition-colors text-left">
              <LogOut className="w-4 h-4 flex-shrink-0" /> Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <div className="flex-1 min-w-0">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Current file name banner */}
        {currentFileName && (
          <div className="mb-4 flex items-center justify-between bg-white border border-blue-200 rounded-xl px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm text-gray-500">File:</span>
              <input
                value={currentFileName}
                onChange={e => setCurrentFileName(e.target.value)}
                className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none min-w-0 flex-1"
              />
            </div>
            <button onClick={handleSaveFile} disabled={saveStatus === 'saving'}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 flex-shrink-0 ml-3">
              <Save className="w-3.5 h-3.5" />
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        )}

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
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
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
          <div className="space-y-4">

            {/* Current Mortgage */}
            <Card title="Current Mortgage">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
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
                  <input className={profile.currentRate ? inp : inpHighlight} type="number" step="0.001" value={profile.currentRate} onChange={e => setP('currentRate', e.target.value)} placeholder="3.750" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Borrower Name">
                  <input className={inp} value={profile.borrowerName} onChange={e => setP('borrowerName', e.target.value)} placeholder="Lawrence Tribble Jr." />
                </Field>
                <Field label="FICO Score" hint="Middle score from credit report">
                  <input className={inp} type="number" value={profile.ficoScore} onChange={e => setP('ficoScore', e.target.value)} placeholder="680" />
                </Field>
                <Field label="Property Address" hint="Enter to auto-pull the value from HouseCanary">
                  <div className="flex gap-2">
                    <input className={inp} value={profile.propertyAddress} onChange={e => setP('propertyAddress', e.target.value)}
                      onBlur={e => { if (e.target.value && !profile.estimatedValue) lookupProperty(e.target.value); }}
                      placeholder="2118 Nevada St, Nevada, TX 75173" />
                    <button type="button" onClick={() => lookupProperty(profile.propertyAddress)}
                      className="px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap disabled:bg-gray-300"
                      disabled={!profile.propertyAddress || propertyLookupStatus === 'loading'}>
                      {propertyLookupStatus === 'loading' ? 'Looking…' : 'Look up'}
                    </button>
                  </div>
                </Field>
                <Field label="Estimated Property Value *" hint={propertyLookupStatus === 'loading' ? '🔍 Looking up via HouseCanary...' : propertyLookupStatus === 'found' ? '✅ Auto-filled from HouseCanary' : propertyLookupStatus === 'notfound' ? '⚠️ Not found — enter manually' : 'Enter an address above to auto-fill'}>
                  <input className={profile.estimatedValue ? inp : inpHighlight} type="number" value={profile.estimatedValue} onChange={e => setP('estimatedValue', e.target.value)} placeholder="450000" />
                </Field>
              </div>
            </Card>

            {/* New Loan Costs */}
            <Card title="New Loan — Charges">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Title & Settlement Charges" hint="Your title company fees — rolled into new loan">
                  <input className={inpHighlight} type="number" value={profile.titleCharges} onChange={e => setP('titleCharges', e.target.value)} placeholder="e.g. 3500" />
                </Field>
                <Field label="Lender Fees (Processing + Underwriting)" hint="Total of lender's processing and underwriting fees">
                  <input className={inp} type="number" value={lenderFees} onChange={e => setLenderFees(e.target.value)} placeholder="e.g. 1495" />
                </Field>
                <Field label="Conventional MI (monthly estimate)" hint="Applies to Conventional only. Enter % (annual, e.g. 0.22) or flat $/mo.">
                  <div className="flex items-center gap-2">
                    <input className={inp} type="number" step="0.01" value={convMI} onChange={e => setConvMI(e.target.value)} placeholder={convMIType === 'percent' ? '0.22' : '95'} />
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                      {[['percent','%'],['dollar','$']].map(([val,lab]) => (
                        <button key={val} onClick={() => setConvMIType(val)}
                          className={`px-3 py-2 text-sm font-semibold transition-colors ${convMIType === val ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{lab}</button>
                      ))}
                    </div>
                  </div>
                </Field>
                {!parsedRateSheet && (
                  <Field label="Manual New Rate (%)" hint="Used when no rate sheet uploaded">
                    <input className={inp} type="number" step="0.001" value={profile.manualRate} onChange={e => setP('manualRate', e.target.value)} placeholder="6.500" />
                  </Field>
                )}
              </div>

              <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
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
            </Card>

            {/* Veteran Status */}
            <Card title="Veteran Status">
              <div className="flex items-start gap-3 mb-4">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="font-semibold text-gray-800">Is the client a veteran or active-duty military?</p>
              </div>
              <div className="flex gap-4">
                {[[true,'🎖️ Yes — VA eligible'],[false,'👤 No — not a veteran']].map(([val, label]) => (
                  <button key={String(val)} onClick={() => { setIsVeteran(val); if (val) setSelectedPrograms(p => [...new Set([...p, 'VA'])]); else setFundingFeeExempt(false); }}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${isVeteran === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{label}</button>
                ))}
              </div>

              {isVeteran === true && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="font-semibold text-gray-800 text-sm mb-2">Is the client exempt from the VA funding fee?</p>
                  <p className="text-xs text-gray-400 mb-3">Service-connected disability, Purple Heart, or qualifying surviving spouse → no funding fee.</p>
                  <div className="flex gap-4">
                    {[[false,'No — funding fee applies'],[true,'✅ Yes — exempt (0%)']].map(([val, label]) => (
                      <button key={String(val)} onClick={() => setFundingFeeExempt(val)}
                        className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${fundingFeeExempt === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              )}
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
              <DebtChecklist debts={debts} onToggle={handleToggleDebt} onAddDebt={handleAddDebt} onSelectRecommended={handleSelectRecommended} />
            )}
          </Card>
        )}

        {/* STEP 3 — Goals */}
        {step === 3 && (
          <div className="space-y-4">

            {/* Pricing Strategy — compact row at top */}
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Pricing Strategy</div>
                <div className="text-xs text-gray-400">Select all that apply — each gets its own analysis tab</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'lowest_rate', icon: '📉', label: 'Lowest Rate', desc: 'Lowest rate before pricing cliff' },
                  { id: 'margin_cost', icon: '⚖️', label: 'Margin Cost', desc: 'Credit covers margin + fees — $0 out of pocket' },
                  { id: 'no_cost',     icon: '🎁', label: 'No Cost',    desc: 'Credit covers all closing costs' },
                  { id: 'low_cost',    icon: '💰', label: 'Low Cost',   desc: '≤1% points — best rate for small cost' },
                ].map(({ id, icon, label, desc }) => {
                  const active = pricingStrategies.includes(id);
                  return (
                    <button key={id} title={desc}
                      onClick={() => setPricingStrategies(prev =>
                        prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
                      )}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        active
                          ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
                      }`}>
                      <span>{icon}</span>
                      <span>{label}</span>
                      {active && <span className="ml-0.5 text-blue-200">✓</span>}
                    </button>
                  );
                })}
              </div>
              {pricingStrategies.length === 0 && (
                <div className="mt-2 text-xs text-red-500 font-semibold">⚠️ Select at least one strategy</div>
              )}
            </div>

            <Card title="Client's Primary Goal">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[['rate_term','📉','Rate & Term','Lower the rate and/or payment. No cash out.'],['cash_out','💵','Cash-Out','Access equity for improvements, debt payoff, etc.'],['both','🔀','Show Both','Run and compare both scenarios side by side.']].map(([id,icon,label,desc]) => (
                  <button key={id} onClick={() => setGoalType(id)} className={optionCard(goalType === id)}>
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
                    className={`${optionCard(selectedPrograms.includes(id))} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
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
            lenderFees={parseFloat(lenderFees) || 0}
            pricingStrategies={pricingStrategies}
            marginDollar={marginDollar}
            userRole={userProfile?.role}
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
            <div className="flex items-center gap-2">
              {(result?.runRef || currentRunRef) && (
                <span className="font-mono text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5" title="Run reference — use this to find this analysis later">
                  {result?.runRef || currentRunRef}
                </span>
              )}
              <button onClick={() => handleSaveFile()} disabled={saveStatus === 'saving'}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-blue-300 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" />
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : currentFileId ? 'Update File' : 'Save File'}
              </button>
              {currentFileId && (
                <button onClick={() => handleSaveFile({ asNew: true })} disabled={saveStatus === 'saving'}
                  title="Save these changes as a separate file, keeping the original"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <Copy className="w-4 h-4" /> Save as New
                </button>
              )}
              <button onClick={handleReset} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                New Analysis
              </button>
            </div>
          )}
        </div>
      </main>
      </div>

      {/* ─── Cash-out LTV cap block ─── */}
      {ltvBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLtvBlock(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-white" />
              <h2 className="font-bold text-white">Cash-Out LTV Limit Reached</h2>
            </div>
            <div className="p-5 text-sm text-gray-700 space-y-3">
              <p>
                Adding <span className="font-semibold">{ltvBlock.debtName || 'this debt'}</span> would bring the new loan to about{' '}
                <span className="font-bold text-amber-700">{ltvBlock.ltv}% LTV</span>, above the{' '}
                <span className="font-bold">{ltvBlock.cap}%</span> cash-out maximum for{' '}
                {ltvBlock.isVeteran ? 'VA' : 'Conventional and FHA'} loans.
              </p>
              <p className="text-gray-500">
                {ltvBlock.isVeteran
                  ? 'VA cash-out is capped at 90% LTV on this rate sheet.'
                  : 'Conventional and FHA cash-out are capped at 80% LTV. (A veteran borrower could go to 90% via VA.)'}
                {' '}To include this debt, reduce the cash-out amount, uncheck another debt, or confirm a higher appraised value.
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setLtvBlock(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── My Files modal ─── */}
      {showFiles && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" onClick={() => setShowFiles(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-900">My Saved Files</h2>
              </div>
              <button onClick={() => setShowFiles(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              {filesLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" /> Loading files…
                </div>
              ) : savedFiles.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  No saved files yet. Run an analysis and click <span className="font-semibold">Save File</span> to keep it here.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedFiles.map(f => {
                    const sum = f.summary || {};
                    const fmtRate = sum.rate != null ? `${Number(sum.rate).toFixed(3)}%` : null;
                    const fmtSav = sum.monthlySavings != null ? `${sum.monthlySavings > 0 ? '+' : ''}$${Math.round(sum.monthlySavings).toLocaleString()}/mo` : null;
                    return (
                    <div key={f.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                      <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 truncate">{f.file_name}</span>
                          {f.run_ref && <span className="font-mono text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{f.run_ref}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{f.borrower_name}</span>
                          {fmtRate && <span className="text-gray-500">· {sum.isARM ? (sum.program ? sum.program + ' ARM' : 'ARM') : '30yr'} {fmtRate}</span>}
                          {fmtSav && <span className={sum.monthlySavings > 0 ? 'text-green-600 font-semibold' : 'text-gray-500'}>· {fmtSav}</span>}
                          <span>· {new Date(f.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <button onClick={() => handleOpenFile(f.id, { edit: false })} title="Open the saved analysis"
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1">
                        <FolderOpen className="w-3.5 h-3.5" /> Open
                      </button>
                      <button onClick={() => handleOpenFile(f.id, { edit: true })} title="Reopen and edit the inputs (no need to re-upload the credit report)"
                        className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-800 px-2 py-1">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleRenameFile(f.id, f.file_name)} title="Rename"
                        className="text-gray-300 hover:text-gray-600 px-1 text-xs font-semibold">Rename</button>
                      <button onClick={() => handleDuplicateFile(f.id)} title="Duplicate as a new scenario"
                        className="text-gray-300 hover:text-blue-600 px-1">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => { if (confirm('Delete this file?')) handleDeleteFile(f.id); }} title="Delete"
                        className="text-gray-300 hover:text-red-500 px-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}








