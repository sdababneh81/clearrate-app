import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing Supabase env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Auth helpers ────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// ─── Rate sheet helpers ───────────────────────────────────────
export async function getActiveRateSheet() {
  const { data, error } = await supabase
    .from('rate_sheets')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data || null
}

export async function saveRateSheet(programs, effectiveDate, llpasApplied, filename, userId) {
  // Deactivate all existing rate sheets first
  await supabase
    .from('rate_sheets')
    .update({ is_active: false })
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('rate_sheets')
    .insert({
      programs,
      effective_date: effectiveDate,
      llpas_applied: llpasApplied || [],
      raw_filename: filename,
      uploaded_by: userId,
      is_active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRateSheetHistory() {
  const { data, error } = await supabase
    .from('rate_sheets')
    .select('id, effective_date, raw_filename, is_active, created_at, uploaded_by')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function setActiveRateSheet(id) {
  await supabase.from('rate_sheets').update({ is_active: false }).eq('is_active', true)
  const { error } = await supabase.from('rate_sheets').update({ is_active: true }).eq('id', id)
  if (error) throw error
}

// ─── User management helpers (admin only) ────────────────────
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function inviteUser(email) {
  // Supabase magic link invite — user gets email to set password
  const { data, error } = await supabase.auth.admin?.inviteUserByEmail(email)
  if (error) throw error
  return data
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}

export async function updateUserActive(userId, active) {
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', userId)
  if (error) throw error
}

// ─── CRM Session helpers ──────────────────────────────────────
export async function saveCRMSession(sessionId, borrowerData) {
  const { data, error } = await supabase
    .from('crm_sessions')
    .upsert({
      session_id: sessionId,
      borrower_data: borrowerData,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr TTL
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getCRMSession(sessionId) {
  const { data, error } = await supabase
    .from('crm_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .single()
  if (error) throw error
  return data
}
