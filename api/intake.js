// api/intake.js — Vercel serverless function
// CRM posts borrower data here → returns a session URL for iframe embed
// POST /api/intake

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for server-side
);

export default async function handler(req, res) {
  // CORS headers — allow any CRM origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lo_token, borrower, debts, credit_report_base64 } = req.body;

    // Validate LO token
    if (!lo_token) return res.status(401).json({ error: 'Missing lo_token' });

    let loUserId = null;
    try {
      loUserId = atob(lo_token);
    } catch {
      return res.status(401).json({ error: 'Invalid lo_token' });
    }

    // Verify user exists and is active
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, active, role')
      .eq('id', loUserId)
      .single();

    if (profErr || !profile) return res.status(401).json({ error: 'LO not found' });
    if (profile.active === false) return res.status(403).json({ error: 'LO account is inactive' });

    // Validate borrower data
    if (!borrower) return res.status(400).json({ error: 'Missing borrower data' });

    // Generate session ID
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Build session payload
    const sessionPayload = {
      lo_user_id: loUserId,
      borrower: {
        name: borrower.name || '',
        fico: borrower.fico || borrower.ficoScore || null,
        currentBalance: borrower.currentBalance || borrower.mortgage_balance || null,
        currentRate: borrower.currentRate || borrower.mortgage_rate || null,
        currentTermRemaining: borrower.currentTermRemaining || null,
        estimatedValue: borrower.estimatedValue || borrower.property_value || null,
        escrow: borrower.escrow || null,
        isVeteran: borrower.isVeteran || borrower.is_veteran || false,
        address: borrower.address || '',
        mortgageLender: borrower.mortgageLender || borrower.lender || '',
      },
      debts: (debts || borrower.debts || []).map(d => ({
        name: d.name || d.creditor || '',
        balance: parseFloat(d.balance) || 0,
        payment: parseFloat(d.payment || d.monthly_payment) || 0,
        type: d.type || 'Other',
        selected: true,
      })),
      credit_report_base64: credit_report_base64 || null,
      source: 'crm',
    };

    // Save session to Supabase with 24hr TTL
    const { error: sessionErr } = await supabase
      .from('crm_sessions')
      .insert({
        session_id: sessionId,
        borrower_data: sessionPayload,
        lo_user_id: loUserId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

    if (sessionErr) {
      // Table might not exist yet — return session URL anyway with inline data
      console.error('Session save error:', sessionErr);
    }

    const appUrl = process.env.VITE_APP_URL || `https://${req.headers.host}`;
    const sessionUrl = `${appUrl}?session=${sessionId}`;

    return res.status(200).json({
      success: true,
      session_url: sessionUrl,
      session_id: sessionId,
      expires_in: '24h',
      lo_email: profile.email,
      borrower_name: borrower.name,
    });

  } catch (err) {
    console.error('Intake error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
