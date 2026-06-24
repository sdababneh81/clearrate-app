import { useState, useEffect } from 'react';
import { supabase, getActiveRateSheet, saveRateSheet, getRateSheetHistory, setActiveRateSheet, getAllProfiles, updateUserRole, updateUserActive, getMarginSettings, saveMarginSettings } from '../lib/supabase.js';
import { parseRateSheet, parseRateSheetBase } from '../utils/claudeParser.js';

export default function AdminPortal({ user, profile, onExit }) {
  const [tab, setTab] = useState('ratesheet'); // 'ratesheet' | 'users' | 'invite' | 'api'
  const [activeSheet, setActiveSheetState] = useState(null);
  const [sheetHistory, setSheetHistory] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | parsing | saving | done | error
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('lo');
  const [tempPassword, setTempPassword] = useState('');
  const [margins, setMargins] = useState({ conventional: '', fha: '', va: '' });
  const [savingMargins, setSavingMargins] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sheet, history, allUsers, marginSettings] = await Promise.all([
        getActiveRateSheet(),
        getRateSheetHistory(),
        getAllProfiles(),
        getMarginSettings().catch(() => ({ conventional: 0, fha: 0, va: 0 })),
      ]);
      setActiveSheetState(sheet);
      setSheetHistory(history);
      setUsers(allUsers);
      setMargins({
        conventional: marginSettings?.conventional ?? '',
        fha: marginSettings?.fha ?? '',
        va: marginSettings?.va ?? '',
      });
    } catch (e) {
      setError('Error loading data: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMargins = async () => {
    setSavingMargins(true); setError(''); setMessage('');
    try {
      const payload = {
        conventional: parseFloat(margins.conventional) || 0,
        fha: parseFloat(margins.fha) || 0,
        va: parseFloat(margins.va) || 0,
      };
      await saveMarginSettings(payload, user.id);
      setMessage('✅ Margins saved. New analyses will use these automatically — LOs never see them.');
    } catch (e) {
      setError('Could not save margins: ' + (e?.message || e) + ' — make sure the app_settings table exists (run the SQL migration).');
    } finally {
      setSavingMargins(false);
    }
  };

  const handleRateSheetUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('parsing'); setError(''); setMessage('');
    console.log('[Admin] Starting rate sheet upload:', file.name);
    try {
      // Check API key
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY — check Vercel environment variables');

      // Parse base prices + the raw LLPA grid — NO borrower baked in.
      // The grid is applied per real borrower at analysis time, in the engine.
      const parsed = await parseRateSheetBase(file);

      console.log('[Admin] Parsed:', parsed);

      if (!parsed?.programs?.length) {
        throw new Error('No programs found in rate sheet. Check browser console for Claude response details.');
      }

      setUploadStatus('saving');
      await saveRateSheet(
        parsed.programs,
        parsed.effectiveDate || new Date().toLocaleDateString(),
        [],                  // llpas_applied is now per-borrower at analysis time
        file.name,
        user.id,
        parsed.llpaGrid || null
      );
      setUploadStatus('done');
      const gridNote = parsed.llpaGrid
        ? ` · LLPA grid extracted (${Object.keys(parsed.llpaGrid).join(', ')})`
        : ' · ⚠️ no LLPA grid found in this PDF';
      setMessage(`✅ Rate sheet uploaded: ${parsed.programs.length} programs (${parsed.programs.map(p => p.type).join(', ')}), effective ${parsed.effectiveDate || 'today'}${gridNote}`);
      await loadData();
    } catch (e) {
      console.error('[Admin] Upload error:', e);
      setUploadStatus('error');
      setError('Upload failed: ' + e.message);
    }
  };

  const handleSetActive = async (id) => {
    try {
      await setActiveRateSheet(id);
      setMessage('✅ Rate sheet activated');
      await loadData();
    } catch (e) {
      setError('Error: ' + e.message);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    try {
      // Create user with temp password — they'll reset it on first login
      const generated = Math.random().toString(36).slice(-10) + 'Aa1!';
      const { data, error: signupErr } = await supabase.auth.admin?.createUser({
        email: inviteEmail,
        password: generated,
        user_metadata: { full_name: inviteName },
        email_confirm: true,
      });

      // Fallback: use signUp if admin API not available (free tier)
      if (signupErr || !data) {
        const { error: err2 } = await supabase.auth.signUp({
          email: inviteEmail,
          password: generated,
          options: { data: { full_name: inviteName } }
        });
        if (err2) throw err2;
      }

      // Set role
      setTimeout(async () => {
        const { data: prof } = await supabase.from('profiles').select('id').eq('email', inviteEmail).single();
        if (prof) await updateUserRole(prof.id, inviteRole);
      }, 1000);

      setTempPassword(generated);
      setMessage(`✅ User created: ${inviteEmail}`);
      setInviteEmail(''); setInviteName('');
      await loadData();
    } catch (e) {
      setError('Invite failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await updateUserRole(userId, role);
      setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x));
      setMessage('✅ Role updated');
    } catch (e) {
      setError('Error: ' + e.message);
    }
  };

  const handleToggleActive = async (userId, active) => {
    try {
      await updateUserActive(userId, !active);
      setUsers(u => u.map(x => x.id === userId ? { ...x, active: !active } : x));
    } catch (e) {
      setError('Error: ' + e.message);
    }
  };

  const API_ENDPOINT = `${window.location.origin}/api/intake`;
  const EXAMPLE_PAYLOAD = JSON.stringify({
    lo_token: "YOUR_LO_API_TOKEN",
    borrower: {
      name: "John Smith",
      fico: 720,
      currentBalance: 350000,
      currentRate: 6.5,
      currentTermRemaining: 28,
      estimatedValue: 550000,
      escrow: 800,
      isVeteran: false,
      address: "123 Main St, Tampa, FL 33601"
    },
    debts: [
      { name: "Chase Auto", balance: 18000, payment: 425, type: "Auto" },
      { name: "Citi Card", balance: 5200, payment: 180, type: "Revolving" }
    ]
  }, null, 2);

  const tabBtn = (id, label, icon) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === id ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      <span>{icon}</span> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#0a1f44] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-sm font-bold">CR</div>
          <div>
            <div className="font-bold text-lg">ClearRate Admin</div>
            <div className="text-blue-300 text-xs">Priority 1 Lending</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-blue-300 text-sm">{profile?.email || user?.email}</span>
          <button
            onClick={onExit}
            className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            → Open ClearRate
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-blue-400 hover:text-white text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* Status messages */}
        {message && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex justify-between"><span>{message}</span><button onClick={() => setMessage('')}>✕</button></div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex justify-between"><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabBtn('ratesheet', 'Rate Sheet', '📊')}
          {tabBtn('margins', 'Margins', '💰')}
          {tabBtn('users', 'Team', '👥')}
          {tabBtn('invite', 'Add User', '➕')}
          {tabBtn('api', 'CRM Integration', '🔗')}
        </div>

        {/* ── RATE SHEET TAB ── */}
        {tab === 'ratesheet' && (
          <div className="space-y-5">
            {/* Active sheet */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Active Rate Sheet</h2>
              {activeSheet ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-green-800">✅ {activeSheet.raw_filename}</div>
                    <div className="text-green-700 text-sm mt-1">
                      Effective: {activeSheet.effective_date} · {activeSheet.programs?.length} programs ·
                      Uploaded {new Date(activeSheet.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-green-600 text-xs mt-1">
                      Programs: {activeSheet.programs?.map(p => `${p.type} (${p.rates?.length} rates)`).join(' · ')}
                    </div>
                  </div>
                  <div className="text-green-500 text-3xl">📊</div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700">
                  ⚠️ No active rate sheet. LOs will need to enter rates manually. Upload one below.
                </div>
              )}
            </div>

            {/* Upload new */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Upload New Rate Sheet</h2>
              <p className="text-gray-500 text-sm mb-4">Upload the UWM PDF rate sheet. Claude will parse it automatically and make it available to all LOs instantly.</p>
              {(() => {
                const fileInputRef = { current: null };
                const isProcessing = uploadStatus === 'parsing' || uploadStatus === 'saving';
                const handleDrop = (e) => {
                  e.preventDefault();
                  if (isProcessing) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleRateSheetUpload({ target: { files: [file] } });
                };
                return (
                  <div
                    className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploadStatus === 'done' ? 'border-green-400 bg-green-50' : uploadStatus === 'error' ? 'border-red-400 bg-red-50' : isProcessing ? 'border-blue-400 bg-blue-50' : 'border-blue-300 bg-blue-50 hover:bg-blue-100'}`}
                    onClick={() => !isProcessing && document.getElementById('rate-sheet-input').click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <input id="rate-sheet-input" type="file" accept=".pdf" className="hidden" onChange={handleRateSheetUpload} disabled={isProcessing} />
                    {!isProcessing ? (
                      <>
                        <div className="text-3xl mb-2">{uploadStatus === 'done' ? '✅' : uploadStatus === 'error' ? '❌' : '📄'}</div>
                        <div className="font-semibold text-blue-700 text-sm">
                          {uploadStatus === 'done' ? 'Uploaded! Click or drag to replace' : 'Click or drag & drop UWM rate sheet PDF'}
                        </div>
                        <div className="text-blue-500 text-xs mt-1">PDF only · Claude parses automatically</div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl mb-2">⚙️</div>
                        <div className="font-semibold text-blue-700 text-sm">
                          {uploadStatus === 'parsing' ? 'Claude is parsing the rate sheet...' : 'Saving to database...'}
                        </div>
                        <div className="text-blue-500 text-xs mt-1">This takes 15-30 seconds</div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* History */}
            {sheetHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Rate Sheet History</h2>
                <div className="space-y-2">
                  {sheetHistory.map(sheet => (
                    <div key={sheet.id} className={`flex items-center justify-between p-3 rounded-xl border ${sheet.is_active ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                      <div>
                        <div className={`font-semibold text-sm ${sheet.is_active ? 'text-green-800' : 'text-gray-700'}`}>
                          {sheet.is_active ? '✅ ACTIVE · ' : ''}{sheet.raw_filename}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Effective: {sheet.effective_date} · Uploaded {new Date(sheet.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {!sheet.is_active && (
                        <button onClick={() => handleSetActive(sheet.id)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
                          Set Active
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MARGINS TAB ── */}
        {tab === 'margins' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Branch Margins</h2>
              <p className="text-gray-500 text-sm mb-5">
                Set the broker margin (in basis points) per loan type. These are applied automatically to every analysis and are <span className="font-semibold text-gray-700">never shown to loan officers</span> — only managers/admins see the internal price stack. 100 BPS = 1.000%.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ['conventional', 'Conventional', '🏦'],
                  ['fha', 'FHA', '🏛️'],
                  ['va', 'VA', '🎖️'],
                ].map(([key, label, icon]) => (
                  <div key={key} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{icon}</span>
                      <span className="font-semibold text-gray-800 text-sm">{label}</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number" min="0" step="12.5"
                        value={margins[key]}
                        onChange={e => setMargins(m => ({ ...m, [key]: e.target.value }))}
                        placeholder="e.g. 150"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">BPS</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5">
                      {margins[key] !== '' && !isNaN(parseFloat(margins[key]))
                        ? `${(parseFloat(margins[key]) / 100).toFixed(3)}% added to rate`
                        : '\u00A0'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button onClick={handleSaveMargins} disabled={savingMargins}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
                  {savingMargins ? 'Saving…' : 'Save Margins'}
                </button>
                <span className="text-xs text-gray-400">Applies to all new and reopened analyses immediately.</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              <span className="font-semibold">One-time setup:</span> if saving errors out, the <code className="font-mono bg-white px-1 rounded">app_settings</code> table doesn't exist yet — run the migration SQL in the Supabase SQL editor (project: clearrate), then reload.
            </div>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {tab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Team ({users.length} users)</h2>
              <button onClick={() => setTab('invite')} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-semibold hover:bg-blue-700">
                + Add User
              </button>
            </div>
            {loading ? <div className="text-gray-400 text-sm">Loading...</div> : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className={`flex items-center justify-between p-4 rounded-xl border ${u.active !== false ? 'border-gray-200' : 'border-red-200 bg-red-50 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{u.full_name || '—'}</div>
                        <div className="text-gray-400 text-xs">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={u.role || 'lo'}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={u.id === user.id}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="lo">Loan Officer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role === 'admin' ? 'Admin' : 'LO'}
                      </span>
                      {u.id !== user.id && (
                        <button
                          onClick={() => handleToggleActive(u.id, u.active !== false)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${u.active !== false ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
                        >
                          {u.active !== false ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INVITE TAB ── */}
        {tab === 'invite' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-lg">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Add New User</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jane@priority1lending.com" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="lo">Loan Officer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </form>
            {tempPassword && (
              <div className="mt-5 bg-amber-50 border border-amber-300 rounded-xl p-4">
                <div className="font-bold text-amber-800 text-sm mb-1">⚠️ Share this temporary password with the user:</div>
                <div className="font-mono text-lg font-bold text-amber-900 bg-white border border-amber-200 rounded-lg px-3 py-2 mt-2 select-all">{tempPassword}</div>
                <div className="text-amber-700 text-xs mt-2">They should change it immediately after first login via "Forgot password"</div>
              </div>
            )}
          </div>
        )}

        {/* ── CRM INTEGRATION TAB ── */}
        {tab === 'api' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">CRM Integration</h2>
              <p className="text-gray-500 text-sm mb-5">Push borrower data from your CRM directly into ClearRate. The LO clicks one button and the analysis is pre-populated — no manual entry.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {[
                  { icon: '1️⃣', title: 'CRM sends POST', desc: 'Your CRM POSTs borrower data to the intake endpoint with an LO token' },
                  { icon: '2️⃣', title: 'Session created', desc: 'A 24-hour session URL is returned with the borrower data pre-loaded' },
                  { icon: '3️⃣', title: 'Opens in iframe', desc: 'CRM opens the URL in an embedded iframe — LO sees ClearRate pre-filled' },
                ].map(s => (
                  <div key={s.title} className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <div className="font-semibold text-blue-900 text-sm">{s.title}</div>
                    <div className="text-blue-700 text-xs mt-1">{s.desc}</div>
                  </div>
                ))}
              </div>

              <div className="mb-5">
                <div className="text-sm font-semibold text-gray-700 mb-2">API Endpoint</div>
                <div className="bg-gray-900 rounded-xl p-3 font-mono text-green-400 text-sm flex items-center justify-between">
                  <span>POST {API_ENDPOINT}</span>
                  <button onClick={() => navigator.clipboard.writeText(`POST ${API_ENDPOINT}`)} className="text-gray-400 hover:text-white text-xs ml-3">Copy</button>
                </div>
              </div>

              <div className="mb-5">
                <div className="text-sm font-semibold text-gray-700 mb-2">Example Payload</div>
                <div className="bg-gray-900 rounded-xl p-4 font-mono text-green-300 text-xs overflow-auto max-h-72 relative">
                  <button onClick={() => navigator.clipboard.writeText(EXAMPLE_PAYLOAD)} className="absolute top-3 right-3 text-gray-500 hover:text-white text-xs">Copy</button>
                  <pre>{EXAMPLE_PAYLOAD}</pre>
                </div>
              </div>

              <div className="mb-5">
                <div className="text-sm font-semibold text-gray-700 mb-2">Response</div>
                <div className="bg-gray-900 rounded-xl p-3 font-mono text-green-400 text-xs">
                  {`{ "session_url": "${window.location.origin}?session=abc123xyz", "expires_in": "24h" }`}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="font-semibold text-amber-800 text-sm mb-1">📎 Iframe Embed Code</div>
                <div className="bg-white border border-amber-200 rounded-lg p-3 font-mono text-xs text-gray-700 overflow-auto">
                  {`<iframe\n  src="SESSION_URL_FROM_API"\n  width="100%"\n  height="900px"\n  frameborder="0"\n  allow="clipboard-write"\n></iframe>`}
                </div>
                <div className="text-amber-700 text-xs mt-2">Replace SESSION_URL_FROM_API with the URL returned from the intake endpoint. The session URL auto-expires in 24 hours.</div>
              </div>
            </div>

            {/* LO Tokens */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">LO API Tokens</h2>
              <p className="text-gray-500 text-sm mb-4">Each LO gets a unique token for the CRM integration. The token identifies which LO is launching the session.</p>
              <div className="space-y-2">
                {users.filter(u => u.active !== false).map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{u.full_name || u.email}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-600">
                        {btoa(u.id).slice(0, 20)}...
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(btoa(u.id))} className="text-xs text-blue-600 hover:text-blue-800">Copy</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

