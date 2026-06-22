import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
// IMPORTANT: Use the legacy anon key (eyJ...) NOT the publishable key (sb_publishable_...)
// The publishable key is for the new Data API; supabase-js v2 uses the legacy anon key
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Supabase] Missing env vars:', { url: !!SUPABASE_URL, key: !!SUPABASE_KEY })
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Auth helpers ─────────────────────────────────────────────
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

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ─── Rate sheet helpers ────────────────────────────────────────
export async function getActiveRateSheet() {
  const { data, error } = await supabase
    .from('rate_sheets')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveRateSheet(programs, effectiveDate, llpasApplied, filename, userId) {
  await supabase.from('rate_sheets').update({ is_active: false }).eq('is_active', true)
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
    .select('id, effective_date, raw_filename, is_active, created_at')
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

// ─── User management ──────────────────────────────────────────
export async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}

export async function updateUserActive(userId, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', userId)
  if (error) throw error
}

// ─── CRM Session helpers ──────────────────────────────────────
export async function getCRMSession(sessionId) {
  const { data, error } = await supabase
    .from('crm_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data
}
