import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './components/Login.jsx'
import AdminPortal from './components/AdminPortal.jsx'
import { supabase, getProfile, getActiveRateSheet, getCRMSession } from './lib/supabase.js'

function Root() {
  const [authState, setAuthState] = useState('loading') // loading | unauthenticated | authenticated
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('app') // app | admin
  const [activeRateSheet, setActiveRateSheet] = useState(null)
  const [crmSession, setCrmSession] = useState(null)
  const [isIframe, setIsIframe] = useState(false)

  useEffect(() => {
    // Detect iframe embed
    try {
      setIsIframe(window.self !== window.top)
    } catch {
      setIsIframe(true)
    }

    // Check for CRM session in URL
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session')
    if (sessionId) {
      loadCRMSession(sessionId)
    }

    // Check Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleAuthSession(session)
      } else {
        setAuthState('unauthenticated')
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        handleAuthSession(session)
      } else {
        setSession(null)
        setProfile(null)
        setAuthState('unauthenticated')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadCRMSession = async (sessionId) => {
    try {
      const data = await getCRMSession(sessionId)
      if (data?.borrower_data) {
        setCrmSession(data.borrower_data)
      }
    } catch (e) {
      console.log('CRM session not found or expired:', e.message)
    }
  }

  const handleAuthSession = async (sess) => {
    setSession(sess)
    try {
      const prof = await getProfile(sess.user.id)
      setProfile(prof)
    } catch (e) {
      console.error('Profile load error:', e)
    }
    // Load rate sheet separately so profile error doesn't block it
    try {
      console.log('[Main] Loading active rate sheet...')
      const sheet = await getActiveRateSheet()
      console.log('[Main] Rate sheet loaded:', sheet ? `${sheet.programs?.length} programs` : 'none')
      setActiveRateSheet(sheet)
    } catch (e) {
      console.error('[Main] Rate sheet load error:', e)
    }
    setAuthState('authenticated')
  }

  const reloadRateSheet = async () => {
    try {
      const sheet = await getActiveRateSheet()
      setActiveRateSheet(sheet)
      console.log('[Main] Rate sheet reloaded:', sheet?.programs?.length, 'programs')
    } catch (e) {
      console.error('[Main] Rate sheet reload error:', e)
    }
  }

  // Listen for postMessage from parent CRM window (iframe mode)
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'CLEARRATE_BORROWER') {
        setCrmSession({ borrower: event.data.borrower, debts: event.data.debts || [], source: 'postmessage' })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1f44] to-[#1a3a6b] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white text-xl font-bold">CR</span>
          </div>
          <div className="text-white font-semibold">Loading ClearRate...</div>
        </div>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <Login onLogin={handleAuthSession} />
  }

  if (view === 'admin' && profile?.role === 'admin') {
    return (
      <AdminPortal
        user={session.user}
        profile={profile}
        onExit={() => setView('app')}
      />
    )
  }

  return (
    <App
      user={session?.user}
      profile={profile}
      activeRateSheet={activeRateSheet}
      crmSession={crmSession}
      isIframe={isIframe}
      onOpenAdmin={profile?.role === 'admin' ? () => setView('admin') : null}
      onSignOut={() => supabase.auth.signOut()}
      onRateSheetUpdate={reloadRateSheet}
    />
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>
)

