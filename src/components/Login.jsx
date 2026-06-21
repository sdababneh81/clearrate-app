import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.session);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      setMessage('Check your email to confirm your account, then log in.');
      setMode('login');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '?reset=true'
      });
      if (error) throw error;
      setMessage('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f44] to-[#1a3a6b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-white">ClearRate</span>
          </div>
          <p className="text-blue-300 text-sm">Smart Refinance Analysis · Priority 1 Lending</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {mode === 'login' ? 'Enter your credentials to access ClearRate' : mode === 'signup' ? 'Your admin will need to approve your account' : 'We\'ll send you a reset link'}
          </p>

          {message && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgot} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Smith"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@priority1lending.com"
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center text-sm">
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setError(''); }} className="text-blue-600 hover:underline">
                  Forgot password?
                </button>
                <button onClick={() => { setMode('signup'); setError(''); }} className="text-gray-500 hover:text-gray-700">
                  Don't have an account? <span className="text-blue-600 font-semibold">Sign up</span>
                </button>
              </>
            )}
            {(mode === 'signup' || mode === 'forgot') && (
              <button onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="text-blue-600 hover:underline">
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-blue-400 text-xs mt-6">
          © 2026 Priority 1 Lending, LLC · Powered by ClearRate
        </p>
      </div>
    </div>
  );
}
