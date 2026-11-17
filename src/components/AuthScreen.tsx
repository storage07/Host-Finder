import React, { useState } from 'react';
import { Lock, Moon, Server, ShieldCheck, Sun } from 'lucide-react';
import { AuthUser } from '../types';
import { apiFetch, setStoredToken } from '../utils/api';
import { inputCls, labelCls } from './UI';

export function AuthScreen({
  user,
  theme,
  onToggleTheme,
  onAuthenticated,
  onToast,
}: {
  user: AuthUser | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onAuthenticated: (u: AuthUser) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);

  // Forgot/Reset Password
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [previewResetCode, setPreviewResetCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');

  // Mandatory First-Login Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        requiresTwoFactor?: boolean;
        user?: AuthUser;
        token?: string;
        message?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          totpCode: needs2FA ? totpCode : undefined,
        }),
      });
      if (res.requiresTwoFactor) {
        setNeeds2FA(true);
        setBusy(false);
        return;
      }
      if (res.token) setStoredToken(res.token);
      if (res.user) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onToast('Password updated. Welcome to Host Finder.', 'success');
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string; previewResetCode?: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: resetEmail }),
        }
      );
      if (res.previewResetCode) setPreviewResetCode(res.previewResetCode);
      onToast(res.message, 'success');
      setMode('reset');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail,
          resetCode,
          newPassword: resetNewPass,
        }),
      });
      onToast(res.message, 'success');
      setMode('login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Server className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            Host Finder
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          {user && user.mustChangePassword ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Password Update Required</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    First-login security policy for {user.username}
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleForceChangePassword} className="space-y-4">
                <div>
                  <label className={labelCls}>Current Temporary Password</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter HostFinder@2026!"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>New Strong Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {busy ? 'Updating...' : 'Update Password & Continue'}
                </button>
              </form>
            </>
          ) : mode === 'login' ? (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold tracking-tight">Sign in to Host Finder</h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Hosting, domain, client, and billing administration console
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Username or Email</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className={inputCls}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('forgot');
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className={inputCls}
                  />
                </div>

                {needs2FA && (
                  <div>
                    <label className={labelCls}>6-Digit Authenticator Code</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      className={`${inputCls} font-mono tracking-widest`}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" />
                  {busy ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Development Admin Credentials
                </p>
                <p className="mt-1 font-mono">
                  User: admin &middot; Pass: HostFinder@2026!
                </p>
                <p className="mt-1 text-[11px]">
                  5 failed attempts trigger a 15-minute security lockout.
                </p>
              </div>
            </>
          ) : mode === 'forgot' ? (
            <>
              <h1 className="text-lg font-semibold">Reset Account Password</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enter your registered email address to generate a reset verification code.
              </p>
              {error && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}
              <form onSubmit={handleForgot} className="mt-5 space-y-4">
                <div>
                  <label className={labelCls}>Account Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="admin@hostfinder.in"
                    className={inputCls}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {busy ? 'Sending...' : 'Generate Reset Code'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Complete Password Reset</h1>
              {previewResetCode && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                  Preview Reset Code: <span className="font-mono font-semibold">{previewResetCode}</span>
                </div>
              )}
              {error && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}
              <form onSubmit={handleReset} className="mt-5 space-y-4">
                <div>
                  <label className={labelCls}>Verification Code</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="8-character code"
                    className={`${inputCls} font-mono uppercase`}
                  />
                </div>
                <div>
                  <label className={labelCls}>New Password</label>
                  <input
                    type="password"
                    required
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className={inputCls}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {busy ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
