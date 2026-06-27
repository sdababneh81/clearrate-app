import { useState, useRef } from 'react';
import { Star, TrendingDown, Clock, DollarSign, CheckCircle, AlertCircle, Printer, ChevronRight, LayoutList, Rows, Plus } from 'lucide-react';

// Collapsible section for the on-screen report. In "full" mode it renders the
// content plainly (no header/toggle). In "compact" mode it shows a clickable
// header bar with a summary line and expands/collapses the body. Print is a
// separate HTML window, so collapsing here never affects the client PDF.
function CollapsibleSection({ title, summary, defaultOpen = false, compact, children }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!compact) return <>{children}</>;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          {title}
        </span>
        {summary && <span className="text-xs text-gray-500 font-medium">{summary}</span>}
      </button>
      {open && <div className="border-t border-gray-100">{children}</div>}
    </div>
  );
}

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

function ScenarioCard({ scenario: sc, isRecommended, isSelected, onSelect, inComparison = false, onToggleCompare }) {
  const recoupOk = !sc.breakevenMonths || sc.breakevenMonths <= 24;
  const recoupWarn = sc.breakevenMonths > 24 && sc.breakevenMonths <= 36;

  return (
    <div
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${
        isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:border-blue-300'
      } ${isRecommended ? 'ring-2 ring-green-400 ring-offset-1 mt-3 pt-5' : ''}`}
      onClick={() => onSelect(sc)}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3" /> AI RECOMMENDED
        </div>
      )}

      {onToggleCompare && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare(sc); }}
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors no-print ${
            inComparison ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600'
          }`}
          title="Add this option to the client comparison sheet">
          {inComparison ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {inComparison ? 'Added' : 'Compare'}
        </button>
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

function buildPrintHTML({ s, clientProfile, paidDebts, remainingDebts, activeStrategyResult, currentTotalPayment, debtPaymentTotal, currentMortgagePI, marginBPS, marginDollar, lenderFees, companyName, today, runRef }) {
  const netCashOut = s.cashOut > 0 ? Math.max(0, s.cashOut - (s.netClosingCosts || 0)) : 0;
  const brokerMarginPct = (parseFloat(marginBPS) || 0) / 100;
  const baseNetPoints = (s.netPointsPct ?? 0) - brokerMarginPct;
  const marginDollarAmt = Math.round(brokerMarginPct / 100 * s.newLoanAmount);
  const yspEarned = marginDollar ? parseFloat(marginDollar) : marginDollarAmt;
  const loan = s.newLoanAmount;

  const termLabel = s.isARM ? `${s.armType || 'ARM'} → 30yr` : '30-Year Fixed';
  const goalLabel = s.goal === 'cash_out' ? 'Cash-Out Refi' : 'Rate & Term Refi';
  const stratLabel = activeStrategyResult?.strategyLabel || '';

  // Build loan breakdown rows
  const breakdownRows = [
    ['Current Mortgage Balance', s.currentBalance || clientProfile.currentBalance, ''],
    ...(s.debtBalanceTotal > 0 ? [['Debts Being Paid Off', s.debtBalanceTotal, '']] : []),
    ['Title & Settlement Charges', s.titleCharges || parseFloat(clientProfile.titleCharges) || 0, ''],
    ...((s.lenderFees || lenderFees) > 0 ? [['Lender Fees', s.lenderFees || lenderFees, '']] : []),
    ...(s.cashOut > 0 ? [['Cash-Out Amount', s.cashOut, '']] : []),
    ...(s.ufmip > 0 ? [['FHA Upfront MIP (1.75%, financed)', s.ufmip, 'amber']] : []),
    ...(s.fundingFee > 0 ? [[`VA Funding Fee (${(s.fundingFeeRate * 100).toFixed(2)}%, financed)`, s.fundingFee, 'amber']] : []),
    ...(s.borrowerPaysPct > 0 ? [[`Discount Points (${s.borrowerPaysPct?.toFixed(3)}% of loan)`, s.pointsCost, 'amber']] : []),
    ...(s.lenderCreditPct > 0 ? [[`Lender Credit (${s.lenderCreditPct?.toFixed(3)}% of loan)`, -s.lenderCredit, 'green']] : []),
  ].filter(([, v]) => v !== 0 && v != null);

  const debtRows = paidDebts.map(d =>
    `<tr><td>${d.name}</td><td style="color:#6b7280">${d.type}</td><td style="text-align:right">${money(d.balance)}</td><td style="text-align:right;color:#16a34a;font-weight:600">-${money(d.payment)}/mo</td></tr>`
  ).join('');

  const llpaSection = (s.llpaHits?.length > 0)
    ? s.llpaHits.map(hit => `
        <tr style="background:#fff7ed">
          <td style="color:#c2410c;font-size:11px">⚡ LLPA: ${hit.description}</td>
          <td style="text-align:right;font-family:monospace;font-weight:700;color:${hit.hit <= 0 ? '#16a34a' : '#c2410c'}">${hit.hit <= 0 ? '' : '+'}${hit.hit.toFixed(3)}%</td>
          <td style="text-align:right;font-family:monospace;font-size:11px;color:${hit.hit <= 0 ? '#16a34a' : '#c2410c'}">${hit.hit <= 0 ? '-' : '+'}${money(Math.abs(hit.hit / 100 * loan))}</td>
        </tr>`).join('')
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>ClearRate — Refinance Analysis</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #f8fafc; }
    .page { max-width: 860px; margin: 0 auto; padding: 24px; }

    /* ── HEADER HERO ── */
    .hero { background: #0f2d5e; color: white; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
    .hero-top { padding: 16px 20px 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .hero-brand { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #93c5fd; margin-bottom: 4px; }
    .hero-name { font-size: 20px; font-weight: 900; color: white; }
    .hero-sub { font-size: 10px; color: #93c5fd; margin-top: 4px; }
    .hero-badge { background: #16a34a; color: white; font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 20px; white-space: nowrap; }
    .hero-ltv { padding: 0 20px 10px; font-size: 10px; color: #93c5fd; }

    /* ── KEY NUMBERS ROW ── */
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(255,255,255,0.1); }
    .kpi-cell { padding: 14px 16px; border-right: 1px solid rgba(255,255,255,0.1); }
    .kpi-cell:last-child { border-right: none; }
    .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #93c5fd; margin-bottom: 4px; }
    .kpi-value { font-size: 22px; font-weight: 900; color: white; line-height: 1; }
    .kpi-value.green { color: #4ade80; }
    .kpi-sub { font-size: 9px; color: #93c5fd; margin-top: 3px; }

    /* ── TERMS ROW ── */
    .terms-grid { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid rgba(255,255,255,0.1); text-align: center; }
    .terms-cell { padding: 10px 8px; border-right: 1px solid rgba(255,255,255,0.1); }
    .terms-cell:last-child { border-right: none; }
    .terms-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #93c5fd; margin-bottom: 3px; }
    .terms-value { font-size: 13px; font-weight: 700; color: white; }
    .terms-value.blue { color: #93c5fd; font-size: 15px; }

    /* ── SECTION CARDS ── */
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
    .card-header { background: #f8fafc; padding: 8px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }

    /* ── BREAKDOWN TABLE ── */
    .breakdown { padding: 12px 16px; }
    .brow { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    .brow:last-child { border-bottom: none; }
    .brow.total { border-top: 2px solid #d1d5db; padding-top: 8px; margin-top: 4px; font-weight: 900; font-size: 13px; }
    .brow.total .val { color: #1d4ed8; }
    .brow.sub { font-size: 11px; color: #6b7280; }
    .amber-text { color: #d97706; font-weight: 600; }
    .green-text { color: #16a34a; font-weight: 600; }
    .meta-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11px; color: #6b7280; border-top: 1px solid #f3f4f6; }
    .meta-val { font-weight: 700; }
    .meta-val.green { color: #16a34a; }
    .meta-val.amber { color: #d97706; }
    .meta-val.red { color: #dc2626; }

    /* ── DEBTS TABLE ── */
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f8fafc; padding: 7px 12px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 12px; border-bottom: 1px solid #f9fafb; }
    tr.total-row td { font-weight: 700; background: #f0fdf4; border-top: 1px solid #d1fae5; }

    /* ── INTERNAL PRICING (LO only) ── */
    .lo-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
    .lo-header { background: #1e3a5f; padding: 9px 16px; display: flex; justify-content: space-between; align-items: center; }
    .lo-header-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #bfdbfe; }
    .lo-header-sub { font-size: 10px; color: #60a5fa; }
    .lo-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 12px 14px; border-bottom: 1px solid #bfdbfe; }
    .lo-tile { background: white; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; text-align: center; }
    .lo-tile-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #3b82f6; margin-bottom: 3px; }
    .lo-tile-val { font-size: 20px; font-weight: 900; color: #111827; }
    .lo-tile-val.green { color: #16a34a; }
    .lo-tile-val.amber { color: #d97706; }
    .lo-tile-sub { font-size: 9px; color: #9ca3af; margin-top: 2px; }
    .lo-table-wrap { padding: 12px 14px; }
    .lo-table-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; margin-bottom: 6px; letter-spacing: 0.05em; }
    .lo-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .lo-table th { background: #eff6ff; padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #3b82f6; border-bottom: 1px solid #bfdbfe; }
    .lo-table th:not(:first-child) { text-align: right; }
    .lo-table td { padding: 7px 10px; border-bottom: 1px solid #f0f9ff; }
    .lo-table td:not(:first-child) { text-align: right; font-family: monospace; font-weight: 700; }
    .lo-table tr.llpa-row { background: #fff7ed; }
    .lo-table tr.subtotal-row { background: #f9fafb; border-top: 2px solid #bfdbfe; border-bottom: 2px solid #bfdbfe; }
    .lo-table tr.margin-row { background: #fffbeb; }
    .lo-table tr.points-row { background: #fef2f2; }
    .lo-table tr.final-row { background: #eff6ff; }
    .lo-table tr.final-row td { font-weight: 900; font-size: 13px; }
    .lo-narrative { margin: 10px 14px 12px; background: #dbeafe; border-radius: 7px; padding: 8px 12px; font-size: 10px; color: #1e40af; line-height: 1.6; }

    /* ── DISCLAIMER ── */
    .disclaimer { font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 14px; text-align: center; line-height: 1.6; }

    @media print {
      body { background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page { padding: 12px; }
      .hero { border-radius: 8px; }
      .card { break-inside: avoid; }
      .lo-box { break-inside: avoid; }
      @page { margin: 0.4in; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HERO HEADER -->
  <div class="hero">
    <div class="hero-top">
      <div>
        <div class="hero-brand">${companyName} | Refinance Savings Analysis</div>
        <div class="hero-name">Prepared for: ${clientProfile.borrowerName || 'Borrower'}</div>
        <div class="hero-sub">${termLabel} · ${goalLabel}${stratLabel ? ' · ' + stratLabel : ''}${s.monthlySavings > 0 ? ' · Net savings before sale: +' + money(s.monthlySavings * 60) + ' over 5 yrs' : ''}</div>
        <div class="hero-sub">${today}${runRef ? ' · Ref ' + runRef : ''}</div>
      </div>
      <div class="hero-badge">★ AI RECOMMENDED</div>
    </div>
    ${clientProfile.estimatedValue ? `<div class="hero-ltv">LTV: ${Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100)}% of ${money(clientProfile.estimatedValue)} estimated value</div>` : ''}

    <!-- KPI ROW -->
    <div class="kpi-grid">
      <div class="kpi-cell">
        <div class="kpi-label">Paying Now</div>
        <div class="kpi-value">${money(currentTotalPayment)}/mo</div>
        <div class="kpi-sub">All current obligations</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-label">After Refinance</div>
        <div class="kpi-value">${money(s.newPI + (s.monthlyInsurance || 0) + parseFloat(clientProfile.escrow || 0))}/mo</div>
        <div class="kpi-sub">P&amp;I: ${money(s.newPI)}${s.monthlyMIP > 0 ? ` + MIP: ${money(s.monthlyMIP)}` : ''}${s.monthlyMI > 0 ? ` + MI: ${money(s.monthlyMI)}` : ''} + Escrow: ${money(clientProfile.escrow || 0)}</div>
      </div>
      <div class="kpi-cell" style="background:rgba(22,163,74,0.15)">
        <div class="kpi-label">Monthly Savings</div>
        <div class="kpi-value green">${s.monthlySavings > 0 ? '+' : ''}${money(s.monthlySavings)}/mo</div>
        <div class="kpi-sub">${money(s.monthlySavings * 12)}/yr · ${money(s.monthlySavings * 60)} over 5 yrs</div>
      </div>
      ${s.cashOut > 0 ? `<div class="kpi-cell" style="background:rgba(22,163,74,0.15)"><div class="kpi-label">Cash to Client</div><div class="kpi-value green">~${money(netCashOut)}</div><div class="kpi-sub">Net after closing costs</div></div>` : ''}
    </div>

    <!-- TERMS ROW -->
    <div class="terms-grid">
      <div class="terms-cell"><div class="terms-label">Loan Amount</div><div class="terms-value">${money(s.newLoanAmount)}</div></div>
      <div class="terms-cell"><div class="terms-label">Interest Rate</div><div class="terms-value blue">${pct(s.rate)}</div></div>
      <div class="terms-cell"><div class="terms-label">Term</div><div class="terms-value">${termLabel}</div></div>
      <div class="terms-cell"><div class="terms-label">P&amp;I Payment</div><div class="terms-value">${money(s.newPI)}/mo</div></div>
      <div class="terms-cell"><div class="terms-label">Recoupment</div><div class="terms-value">${s.breakevenMonths === 0 ? 'Immediate' : s.breakevenMonths + ' months'}</div></div>
    </div>
  </div>

  <!-- LOAN BALANCE BREAKDOWN -->
  <div class="card">
    <div class="card-header">New Loan Balance Breakdown</div>
    <div class="breakdown">
      ${breakdownRows.map(([label, val, color]) => `
        <div class="brow">
          <span class="${color === 'amber' ? 'amber-text' : color === 'green' ? 'green-text' : ''}">${label}</span>
          <span class="${color === 'amber' ? 'amber-text' : color === 'green' ? 'green-text' : ''}">${color === 'green' ? '-' : color === 'amber' ? '+' : ''}${money(Math.abs(val))}</span>
        </div>`).join('')}
      <div class="brow total">
        <span>New Loan Total</span>
        <span class="val">${money(s.newLoanAmount)}</span>
      </div>
      <div class="meta-row" style="margin-top:6px">
        <span>Net Closing Costs</span>
        <span class="meta-val ${s.netClosingCosts <= 0 ? 'green' : ''}">${s.netClosingCosts <= 0 ? '-' : ''}${money(Math.abs(s.netClosingCosts))}</span>
      </div>
      <div class="meta-row">
        <span>Recoupment period</span>
        <span class="meta-val ${s.breakevenMonths <= 24 ? 'green' : s.breakevenMonths <= 36 ? 'amber' : 'red'}">${s.breakevenMonths === 0 ? 'Immediate' : s.breakevenMonths + ' months'}</span>
      </div>
    </div>
  </div>

  <!-- internal pricing intentionally omitted from client PDF -->

  ${paidDebts.length > 0 ? `
  <!-- DEBTS PAID OFF -->
  <div class="card">
    <div class="card-header">Debts Paid Off at Closing</div>
    <table>
      <thead><tr><th>Creditor</th><th>Type</th><th style="text-align:right">Balance</th><th style="text-align:right">Mo. Payment</th></tr></thead>
      <tbody>
        ${debtRows}
        <tr class="total-row">
          <td colspan="2">Total Eliminated</td>
          <td style="text-align:right">${money(s.debtBalanceTotal)}</td>
          <td style="text-align:right;color:#16a34a">-${money(debtPaymentTotal + currentMortgagePI)}/mo</td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  <div class="disclaimer">
    This analysis is for illustrative purposes only and is prepared by ${companyName}. Final loan terms are subject to underwriting approval, appraisal, and lender guidelines. Not a commitment to lend. NMLS regulated.
  </div>
</div>
</body>
</html>`;
}

// Interest paid over the first `months` of a loan (amortization sum).
function interestOverMonths(principal, annualRatePct, termYears, months) {
  const P = parseFloat(principal) || 0;
  const r = (parseFloat(annualRatePct) || 0) / 100 / 12;
  const n = Math.round((parseFloat(termYears) || 30) * 12);
  if (P <= 0 || n <= 0) return 0;
  const pmt = r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n));
  let bal = P, interest = 0;
  const cap = Math.min(months, n);
  for (let m = 0; m < cap; m++) {
    const i = bal * r;
    interest += i;
    bal -= (pmt - i);
    if (bal < 0) bal = 0;
  }
  return Math.round(interest);
}

// Option A interest saved: rate-reduction on the SAME current balance over the new
// term — isolates the value of the lower rate (always >= 0 when new rate < old).
function interestSaved(clientProfile, scenario, months) {
  const bal = parseFloat(clientProfile.currentBalance) || 0;
  const oldRate = parseFloat(clientProfile.currentRate) || 0;
  const term = scenario.termYears || 30;
  const oldI = interestOverMonths(bal, oldRate, term, months);
  const newI = interestOverMonths(bal, scenario.rate, term, months);
  return Math.max(0, oldI - newI);
}

// Build the client-facing comparison one-sheet. CLIENT-FACING ONLY — no margin,
// no LLPA, no internal pricing ever. `options` is up to 3 scenarios.
function buildComparisonHTML({ options, clientProfile, currentTotalPayment, currentMortgagePI, debtPaymentTotal, recommendedKey, companyName, today }) {
  const money = v => '$' + Math.round(Math.abs(v || 0)).toLocaleString();
  const escrow = parseFloat(clientProfile.escrow) || 0;
  const oldRate = parseFloat(clientProfile.currentRate) || 0;
  const debtMo = parseFloat(debtPaymentTotal) || 0;

  // Current loan column
  const curTotal = currentMortgagePI + escrow; // housing only
  const curOblig = currentTotalPayment;        // housing + debts being eliminated

  const col = (label, cells, opts = {}) => {
    const { bold, head, hi } = opts;
    const tds = cells.map((c, i) => {
      const isCur = i === 0;
      const bg = head ? '' : (hi ? 'background:#e6f1fb;' : (isCur ? 'background:#f6f5f0;' : ''));
      const color = c.green ? 'color:#0f6e56;font-weight:500;' : (hi ? 'color:#185fa5;font-weight:500;' : '');
      return `<td style="text-align:center;padding:7px 6px;border-left:0.5px solid #e5e7eb;${bg}${color}font-size:${head?'12px':'12.5px'};${head?'font-weight:500;':''}">${c.v}</td>`;
    }).join('');
    const lblBg = hi ? 'background:#e6f1fb;font-weight:500;' : (bold ? 'font-weight:500;' : '');
    const indent = opts.indent ? 'padding-left:20px;' : '';
    return `<tr><td style="padding:7px 12px;${indent}font-size:12px;color:#4b5563;${lblBg}">${label}</td>${tds}</tr>`;
  };

  const headCells = [{ v: 'Paying Now' }, ...options.map(o => ({ v: o.strategyLabel || o.program }))];
  const subCells = [{ v: 'Current loan' }, ...options.map(o => ({ v: `${o.program}${o.isARM ? ' ' + (o.armType || 'ARM') : ''}` }))];

  const rows = [
    col('Interest rate', [{ v: oldRate.toFixed(3) + '%' }, ...options.map(o => ({ v: o.rate.toFixed(3) + '%' }))], { bold: true }),
    col('Principal &amp; interest', [{ v: money(currentMortgagePI) }, ...options.map(o => ({ v: money(o.newPI) }))], { indent: true }),
    col('Mortgage insurance', [{ v: '—' }, ...options.map(o => ({ v: (o.monthlyMIP + o.monthlyMI) > 0 ? money(o.monthlyMIP + o.monthlyMI) : '—' }))], { indent: true }),
    col('Escrow (taxes + insurance)', [{ v: money(escrow) }, ...options.map(() => ({ v: money(escrow) }))], { indent: true }),
    col('Total monthly payment', [{ v: money(curTotal) }, ...options.map(o => ({ v: money(o.newPI + (o.monthlyInsurance || 0) + escrow) }))], { hi: true }),
    col('+ debts paid monthly', [{ v: money(debtMo) }, ...options.map(() => ({ v: 'paid off' }))]),
    col('Total monthly obligations', [{ v: money(curOblig) }, ...options.map(o => ({ v: money(o.newPI + (o.monthlyInsurance || 0) + escrow) }))], { bold: true }),
    col('Monthly savings', [{ v: '—' }, ...options.map(o => ({ v: '+' + money(o.monthlySavings), green: true }))]),
    col('Interest saved — 5 years', [{ v: '—' }, ...options.map(o => ({ v: money(interestSaved(clientProfile, o, 60)), green: true }))]),
    col('Interest saved — life of loan', [{ v: '—' }, ...options.map(o => ({ v: money(interestSaved(clientProfile, o, o.termYears * 12)), green: true }))]),
    col('Debt paid off at closing', [{ v: '—' }, ...options.map(o => ({ v: o.debtBalanceTotal > 0 ? money(o.debtBalanceTotal) : '—' }))]),
    col('Points / cost', [{ v: '—' }, ...options.map(o => ({ v: o.borrowerPaysPct > 0 ? money(o.pointsCost) : '$0' }))]),
    col('Cash to client', [{ v: '—' }, ...options.map(o => ({ v: o.cashOut > 0 ? money(Math.max(0, o.cashOut - (o.netClosingCosts || 0))) : '—' }))]),
  ].join('');

  const headRow = `<tr>
    <th style="padding:8px 12px;border-bottom:0.5px solid #d1d5db;"></th>
    ${headCells.map((c, i) => `<th style="padding:8px 6px;border-bottom:0.5px solid #d1d5db;border-left:0.5px solid #e5e7eb;${i===0?'background:#f6f5f0;':''}${i>0 && options[i-1] && recommendedKey===options[i-1]._key?'border-top:2px solid #378add;':''}font-size:12px;font-weight:500;${i>0 && options[i-1] && recommendedKey===options[i-1]._key?'color:#185fa5;':''}">${c.v}<div style="font-size:10px;color:#9ca3af;font-weight:400;">${subCells[i].v}</div></th>`).join('')}
  </tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Refinance Options — ${clientProfile.borrowerName || 'Client'}</title>
  <style>
    @page { size: letter landscape; margin: 0.4in; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    body { font-family: -apple-system, Arial, sans-serif; margin: 0; color: #111827; }
    table { width: 100%; border-collapse: collapse; }
  </style></head><body>
    <div style="background:#15293f;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;">
      <div style="font-size:10px;letter-spacing:.08em;color:#9db8d6;">${(companyName || 'PRIORITY 1 LENDING').toUpperCase()} · REFINANCE OPTIONS</div>
      <div style="font-size:18px;font-weight:600;margin-top:2px;">Prepared for ${clientProfile.borrowerName || 'Client'}</div>
      <div style="font-size:11px;color:#9db8d6;margin-top:2px;">${options[0]?.goal === 'cash_out' ? 'Cash-out refinance' : 'Rate &amp; term refinance'} · ${today}</div>
    </div>
    <div style="border:0.5px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
      <table>${headRow}${rows}</table>
    </div>
    <div style="font-size:9px;color:#9ca3af;margin-top:8px;line-height:1.5;">
      Illustrative only. "Total monthly obligations" includes debts being paid off at closing. Interest savings reflect the rate reduction on the current balance and depend on time held and prepayment. Taxes and insurance are estimates. Final terms subject to underwriting approval. Prepared by ${companyName || 'Priority 1 Lending'}.
    </div>
  </body></html>`;
}

export default function AnalysisReport({ result, clientProfile, selectedDebts, marginBPS, marginDollar, lenderFees = 0, pricingStrategies = [], userRole = 'lo', companyName = 'Priority 1 Lending' }) {
  const isAdmin = userRole === 'admin';
  const [activeScenario, setActiveScenario] = useState(result.recommended);
  const [viewMode, setViewMode] = useState('compact');  // 'compact' (collapsed sections) | 'full'
  const [compareKeys, setCompareKeys] = useState([]);    // scenario keys selected for the client comparison sheet

  const scenarioKey = (sc) => `${sc.program}|${sc.goal}|${sc.isARM ? sc.armType || 'ARM' : 'fixed'}|${sc.rate}|${sc.strategyTag || ''}`;
  const toggleCompare = (sc) => {
    const k = scenarioKey(sc);
    setCompareKeys(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, k];
    });
  };
  const [activeGoalTab, setActiveGoalTab] = useState(result.recommended?.goal || 'rate_term');
  const [productTab, setProductTab] = useState(result.recommended?.isARM ? 'arm' : 'fixed');
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
  // Self-heal: if the active goal tab isn't among the goals this strategy actually
  // produced (e.g. a cash-out-only run while the tab still says rate_term), fall
  // back to the first available goal so the card grid never renders empty by accident.
  const effectiveGoalTab = goalTabs.includes(activeGoalTab) ? activeGoalTab : (goalTabs[0] || activeGoalTab);
  const visibleScenarios = strategyScenarios.filter(sc => sc.goal === effectiveGoalTab);
  const fixedScenarios = visibleScenarios.filter(sc => !sc.isARM);
  const armScenarios = visibleScenarios.filter(sc => sc.isARM);

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Scenarios selected for the comparison sheet (preserve selection order, cap 3).
  const compareOptions = compareKeys
    .map(k => (scenarios || []).find(sc => scenarioKey(sc) === k))
    .filter(Boolean)
    .slice(0, 3)
    .map(sc => ({ ...sc, _key: scenarioKey(sc) }));

  const handlePrintComparison = () => {
    if (compareOptions.length < 1) return;
    const recKey = recommended ? scenarioKey(recommended) : null;
    const html = buildComparisonHTML({
      options: compareOptions, clientProfile,
      currentTotalPayment, currentMortgagePI, debtPaymentTotal,
      recommendedKey: recKey, companyName, today,
    });
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 600);
  };

  const handlePrint = () => {
    const s = activeScenario || result.recommended;
    if (!s) return;
    const html = buildPrintHTML({
      s, clientProfile, paidDebts, remainingDebts,
      activeStrategyResult, currentTotalPayment,
      debtPaymentTotal, currentMortgagePI,
      marginBPS, marginDollar, lenderFees,
      companyName, today, runRef: result.runRef,
    });
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 600);
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
  const isCardSelected = (sc) => s === sc || (s.program === sc.program && s.goal === sc.goal && s.isARM === sc.isARM && s.rate === sc.rate);
  const isCardRecommended = (sc) => sc === recommended || (sc.program === recommended?.program && sc.goal === recommended?.goal && sc.isARM === recommended?.isARM && sc.rate === recommended?.rate);

  return (
    <div className="space-y-5">

      {result.status === 'all_negative' && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="font-bold text-amber-900 text-sm mb-0.5">No payment savings at current settings</div>
            <div className="text-amber-700 text-xs leading-relaxed">{result.statusReason}</div>
          </div>
        </div>
      )}

      {/* Print + view toggle */}
      <div className="flex justify-end items-center gap-2">
        <div className="bg-gray-100 rounded-xl p-1 flex gap-1 no-print">
          <button onClick={() => setViewMode('compact')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'compact' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            <Rows className="w-3.5 h-3.5" /> Compact
          </button>
          <button onClick={() => setViewMode('full')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'full' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            <LayoutList className="w-3.5 h-3.5" /> Full
          </button>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
        <button onClick={handlePrintComparison} disabled={compareOptions.length < 1}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm no-print ${
            compareOptions.length < 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          title={compareOptions.length < 1 ? 'Tick “Compare” on up to 3 option cards first' : 'Print the client comparison sheet'}>
          <LayoutList className="w-4 h-4" />
          Print Comparison{compareOptions.length > 0 ? ` (${compareOptions.length})` : ''}
        </button>
      </div>
      {compareOptions.length > 0 && (
        <div className="text-xs text-gray-500 text-right -mt-3 no-print">
          {compareOptions.length} option{compareOptions.length > 1 ? 's' : ''} selected for the client sheet{compareKeys.length >= 3 ? ' (max reached)' : ''} · tick “Compare” on cards to add
        </div>
      )}

      {/* Goal tabs */}
      {goalTabs.length > 1 && (
        <div className="flex gap-2">
          {goalTabs.map(g => (
            <button key={g} onClick={() => setActiveGoalTab(g)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${effectiveGoalTab === g ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {g === 'rate_term' ? 'Rate & Term' : 'Cash-Out'}
            </button>
          ))}
        </div>
      )}

      {/* Strategy tabs */}
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
                <div key={sr.strategy}
                  className={`relative flex-1 min-w-[160px] text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${isActive ? activeColor : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  onClick={() => { setActiveStrategy(sr.strategy); setActiveScenario(sr.recommended); }}>
                  {rec && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCompare(rec); }}
                      className={`absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border transition-colors no-print ${
                        compareKeys.includes(scenarioKey(rec)) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600'
                      }`}
                      title="Add this option to the client comparison sheet">
                      {compareKeys.includes(scenarioKey(rec)) ? <CheckCircle className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                      {compareKeys.includes(scenarioKey(rec)) ? 'Added' : 'Compare'}
                    </button>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{meta.icon}</span>
                    <span className={`text-xs font-bold ${isActive ? 'text-gray-800' : 'text-gray-500'}`}>{meta.label}</span>
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scenario cards */}
      <div>
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
                {fixedScenarios.map((sc, i) => <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} inComparison={compareKeys.includes(scenarioKey(sc))} onToggleCompare={toggleCompare} />)}
              </div>
            : <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm text-center">No 30-year fixed options available for this strategy. Try another strategy tab above or check ARM options.</div>
        )}
        {productTab === 'arm' && (
          armScenarios.length > 0
            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {armScenarios.map((sc, i) => <ScenarioCard key={i} scenario={sc} isRecommended={isCardRecommended(sc)} isSelected={isCardSelected(sc)} onSelect={setActiveScenario} inComparison={compareKeys.includes(scenarioKey(sc))} onToggleCompare={toggleCompare} />)}
              </div>
            : <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-400 text-sm text-center">No ARM options available.</div>
        )}
      </div>

      {/* ── ON-SCREEN LOAN SUMMARY (same data as print) ── */}
      <div ref={printRef} id="clearrate-print">

        {/* Dark hero header — visible on screen */}
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
              <div className="text-blue-400 text-xs mt-0.5">{today}{result.runRef ? <span className="ml-2 font-mono font-semibold text-blue-300">· Ref {result.runRef}</span> : null}</div>
            </div>
            {isCardRecommended(s) && (
              <div className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" /> AI RECOMMENDED
              </div>
            )}
          </div>

          {clientProfile.estimatedValue && (
            <div className="px-5 pb-3 text-xs text-blue-400">
              LTV: {Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100)}% of {money(clientProfile.estimatedValue)} estimated value
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-blue-800">
            {[
              ['PAYING NOW', money(currentTotalPayment) + '/mo', 'All current obligations', false],
              ['AFTER REFINANCE', money(s.newPI + (s.monthlyInsurance || 0) + parseFloat(clientProfile.escrow || 0)) + '/mo', `P&I: ${money(s.newPI)}${s.monthlyMIP > 0 ? ` + MIP: ${money(s.monthlyMIP)}` : ''}${s.monthlyMI > 0 ? ` + MI: ${money(s.monthlyMI)}` : ''} + Escrow: ${money(clientProfile.escrow || 0)}`, false],
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
        <CollapsibleSection compact={viewMode === 'compact'}
          title="New Loan Balance Breakdown"
          summary={`${money(s.newLoanAmount)}${clientProfile.estimatedValue ? ` · LTV ${Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100)}%` : ''}`}>
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
              ...(s.ufmip > 0 ? [['FHA Upfront MIP (1.75%, financed)', s.ufmip, 'amber']] : []),
              ...(s.fundingFee > 0 ? [[`VA Funding Fee (${(s.fundingFeeRate * 100).toFixed(2)}%, financed)`, s.fundingFee, 'amber']] : []),
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
              {s.monthlyMIP > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Monthly MIP ({(s.mipAnnualRate * 100).toFixed(2)}% annual)</span>
                  <span className="font-bold text-gray-800">+{money(s.monthlyMIP)}/mo</span>
                </div>
              )}
              {s.monthlyMI > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Monthly MI (estimate)</span>
                  <span className="font-bold text-gray-800">+{money(s.monthlyMI)}/mo</span>
                </div>
              )}
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
        </CollapsibleSection>

        {/* Internal Price Stack — admins/managers only; LOs never see the margin */}
        {isAdmin && (() => {
          const mBPS = s.marginBPS ?? marginBPS;
          const brokerMarginPct = (parseFloat(mBPS) || 0) / 100;
          const baseNetPoints = (s.netPointsPct ?? 0) - brokerMarginPct;
          const marginDollarAmt = Math.round(brokerMarginPct / 100 * s.newLoanAmount);
          const yspEarned = marginDollarAmt;
          const loan = s.newLoanAmount;

          return (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden shadow-sm no-print">
              <div className="bg-[#1e3a5f] px-4 py-2.5 flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-blue-200 flex items-center gap-2">
                  🔒 Internal Pricing & Compensation — Not for Client
                </div>
                <div className="text-xs text-blue-400">{s.program} · {s.rate?.toFixed(3)}% · {s.isARM ? (s.armType || 'ARM') : '30-Year Fixed'}</div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-4 border-b border-blue-200">
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">Rate</div>
                  <div className="text-2xl font-black text-gray-900">{s.rate?.toFixed(3)}%</div>
                  <div className="text-xs text-gray-400">{s.isARM ? (s.armType || 'ARM') : '30-yr Fixed'}</div>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">YSP Earned</div>
                  <div className="text-2xl font-black text-green-700">{money(yspEarned)}</div>
                  <div className="text-xs text-gray-400">{mBPS} BPS on {money(loan)}</div>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-3 text-center">
                  <div className="text-xs text-blue-500 font-bold uppercase mb-1">Net to Client</div>
                  <div className={`text-2xl font-black ${s.lenderCreditPct > 0 ? 'text-green-700' : s.borrowerPaysPct > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {s.lenderCreditPct > 0 ? `-${money(s.lenderCredit)}` : s.borrowerPaysPct > 0 ? `+${money(s.pointsCost)}` : '$0'}
                  </div>
                  <div className="text-xs text-gray-400">{s.lenderCreditPct > 0 ? 'credit to client' : s.borrowerPaysPct > 0 ? 'points charged' : 'par — no cost'}</div>
                </div>
              </div>

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
                      )) : Array.isArray(s.llpaHits) ? (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td className="px-4 py-2 text-gray-500 text-xs">
                            ⚡ LLPA Adjustments — none for this profile (FICO {clientProfile?.ficoScore}, LTV ~{clientProfile?.estimatedValue ? Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100) : '?'}%, {s.goal === 'cash_out' ? 'Cash-Out' : 'Rate/Term'})
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-gray-400">0.000%</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-gray-400">$0</td>
                        </tr>
                      ) : (() => {
                        const llpaTotal = baseNetPoints - (s.basePoints ?? baseNetPoints);
                        return llpaTotal !== 0 ? (
                          <tr className="border-b border-orange-50 bg-orange-50">
                            <td className="px-4 py-2 text-orange-800 text-xs font-semibold">
                              ⚡ LLPA Adjustments (FICO {clientProfile?.ficoScore}, LTV ~{clientProfile?.estimatedValue ? Math.round((s.newLoanAmount / parseFloat(clientProfile.estimatedValue)) * 100) : '?'}%, {s.goal === 'cash_out' ? 'Cash-Out' : 'Rate/Term'})
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

                      <tr className="border-b-2 border-blue-200 bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800 font-bold text-xs uppercase tracking-wide">Net Lender Price (after all LLPAs)</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${baseNetPoints <= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                          {baseNetPoints <= 0 ? '' : '+'}{baseNetPoints.toFixed(3)}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${baseNetPoints <= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {baseNetPoints <= 0 ? '-' : '+'}{money(Math.abs(baseNetPoints / 100 * loan))}
                        </td>
                      </tr>

                      <tr className="border-b border-amber-100 bg-amber-50">
                        <td className="px-4 py-2.5 text-amber-800 font-semibold">
                          Broker Margin ({mBPS} BPS)
                          <div className="text-xs text-amber-600 font-normal">your compensation — added to price</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">+{brokerMarginPct.toFixed(3)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-amber-600">+{money(marginDollarAmt)}</td>
                      </tr>

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

                <div className="mt-3 bg-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">Price build:</span> UWM sheet at <span className="font-bold">{s.rate?.toFixed(3)}%</span> → base price <span className="font-bold">{(s.basePoints ?? baseNetPoints) <= 0 ? `${Math.abs(s.basePoints ?? baseNetPoints).toFixed(3)}% credit` : `${(s.basePoints ?? baseNetPoints).toFixed(3)}% cost`}</span> → after LLPAs: <span className="font-bold">{baseNetPoints <= 0 ? `${Math.abs(baseNetPoints).toFixed(3)}% credit` : `${baseNetPoints.toFixed(3)}% cost`}</span> → add <span className="font-bold">{mBPS} BPS margin</span> → client gets <span className="font-bold">{s.lenderCreditPct > 0 ? `${s.lenderCreditPct.toFixed(3)}% credit (${money(s.lenderCredit)})` : s.borrowerPaysPct > 0 ? `charged ${s.borrowerPaysPct.toFixed(3)}% points (${money(s.pointsCost)})` : 'par'}</span>. YSP: <span className="font-bold text-green-800">{money(yspEarned)}</span>.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Debts paid off */}
        {paidDebts.length > 0 && (
          <CollapsibleSection compact={viewMode === 'compact'}
            title="Debts Paid Off at Closing"
            summary={`${paidDebts.length} ${paidDebts.length === 1 ? 'debt' : 'debts'} · ${money(s.debtBalanceTotal)}`}>
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
          </CollapsibleSection>
        )}

        {/* Disclaimer */}
        <div className="text-xs text-gray-400 text-center py-2">
          This analysis is for illustrative purposes only. Final loan terms are subject to underwriting approval. Prepared by {companyName}.
        </div>

      </div>
    </div>
  );
}
