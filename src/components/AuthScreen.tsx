import React, { useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { AuthUser } from '../types';
import {
  apiFetch,
  clearAllAuthTokens,
  setMemoryAuthToken,
  setStoredToken,
} from '../utils/api';
import { inputCls, labelCls } from './UI';

const ADMIN_DEMO_ACCOUNT = {
  username: 'admin',
  password: 'HostFinder@2026!',
} as const;

function formatFirebaseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in popup was closed before finishing. Please try again.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Popup was blocked by your browser. Please allow popups for this site or sign in with local credentials.';
  }
  if (raw.includes('auth/cancelled-popup-request')) {
    return 'Sign-in request was superseded. Please click Continue with Google again.';
  }
  if (raw.includes('auth/network-request-failed')) {
    return 'Network error while contacting Google. Check your connection and try again.';
  }
  if (raw.includes('auth/account-exists-with-different-credential')) {
    return 'An account already exists with this email using a different sign-in method.';
  }
  return raw || 'Google sign-in failed. Please try again.';
}

function getPasswordChecks(pw: string) {
  return [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'One uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'One number', ok: /[0-9]/.test(pw) },
    { label: 'One special character', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PasswordRequirements({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword?: string;
}) {
  const checks = getPasswordChecks(password);
  const showMatch = confirmPassword !== undefined && confirmPassword.length > 0;
  const matches = confirmPassword === password && password.length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
      <p className="mb-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
        Password requirements
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-1.5 text-[11px] ${
              item.ok
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Check
              className={`h-3 w-3 shrink-0 ${
                item.ok ? 'opacity-100' : 'opacity-30'
              }`}
            />
            <span>{item.label}</span>
          </div>
        ))}
        {showMatch && (
          <div
            className={`col-span-2 mt-0.5 flex items-center gap-1.5 text-[11px] ${
              matches
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            <Check className={`h-3 w-3 shrink-0 ${matches ? 'opacity-100' : 'opacity-30'}`} />
            <span>{matches ? 'Passwords match' : 'Passwords do not match yet'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthScreen({
  user,
  theme,
  justSignedOut = false,
  onDismissSignedOut,
  onToggleTheme,
  onAuthenticated,
  onLogout,
  onToast,
}: {
  user: AuthUser | null;
  theme: 'light' | 'dark';
  justSignedOut?: boolean;
  onDismissSignedOut?: () => void;
  onToggleTheme: () => void;
  onAuthenticated: (u: AuthUser) => void;
  onLogout: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);

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
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setMemoryAuthToken(idToken);
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      if (res.user.role !== 'admin') {
        clearAllAuthTokens();
        await signOut(auth).catch(() => {});
        setError('Access denied. Only administrator accounts can sign in.');
        return;
      }
      onAuthenticated(res.user);
    } catch (err) {
      clearAllAuthTokens();
      await signOut(auth).catch(() => {});
      setError(formatFirebaseError(err));
    } finally {
      setGoogleBusy(false);
    }
  };

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
          username: username.trim(),
          password,
          rememberMe,
          totpCode: needs2FA ? totpCode.trim() : undefined,
        }),
      });
      if (res.requiresTwoFactor) {
        setNeeds2FA(true);
        setTotpCode('');
        setBusy(false);
        return;
      }
      if (res.token) setStoredToken(res.token, rememberMe);
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
    const unmet = getPasswordChecks(newPassword).find((c) => !c.ok);
    if (unmet) {
      setError(`Password requirement not met: ${unmet.label}`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ user: AuthUser; token?: string }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        }
      );
      if (res.token) {
        setStoredToken(res.token, rememberMe);
      }
      onToast('Password updated. Welcome to Host Finder.', 'success');
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchAccountFromForceChange = async () => {
    setSigningOut(true);
    setError('');
    try {
      await onLogout();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setSigningOut(false);
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
          body: JSON.stringify({ email: resetEmail.trim() }),
        }
      );
      if (res.previewResetCode) {
        setPreviewResetCode(res.previewResetCode);
        setResetCode(res.previewResetCode);
      }
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
    const unmet = getPasswordChecks(resetNewPass).find((c) => !c.ok);
    if (unmet) {
      setError(`Password requirement not met: ${unmet.label}`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: resetEmail.trim(),
          resetCode: resetCode.trim(),
          newPassword: resetNewPass,
        }),
      });
      onToast(res.message, 'success');
      setUsername(resetEmail.trim());
      setPassword('');
      setResetCode('');
      setResetNewPass('');
      setPreviewResetCode('');
      setMode('login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fillAdminCredentials = () => {
    setUsername(ADMIN_DEMO_ACCOUNT.username);
    setPassword(ADMIN_DEMO_ACCOUNT.password);
    setNeeds2FA(false);
    setTotpCode('');
    setError('');
    if (onDismissSignedOut) onDismissSignedOut();
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Server className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-tight whitespace-nowrap shrink-0">
            Host Finder
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </>
          )}
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px]">
            {justSignedOut && !user && mode === 'login' && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>You have been signed out safely.</span>
                </div>
                {onDismissSignedOut && (
                  <button
                    type="button"
                    onClick={onDismissSignedOut}
                    className="opacity-70 transition-opacity hover:opacity-100"
                    aria-label="Dismiss notice"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              {user && user.mustChangePassword ? (
                <>
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h1 className="text-lg font-semibold tracking-tight">
                          Update Your Password
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Required on first login for{' '}
                          <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                            {user.username}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleForceChangePassword} className="space-y-4">
                    <div>
                      <label className={labelCls}>Current Temporary Password</label>
                      <PasswordInput
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        placeholder="Enter current password"
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>New Strong Password</label>
                      <PasswordInput
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Confirm New Password</label>
                      <PasswordInput
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                      />
                    </div>

                    <PasswordRequirements
                      password={newPassword}
                      confirmPassword={confirmPassword}
                    />

                    <button
                      type="submit"
                      disabled={busy || signingOut}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          <span>Update Password &amp; Continue</span>
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleSwitchAccountFromForceChange}
                      disabled={busy || signingOut}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      {signingOut ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {signingOut ? 'Signing out...' : 'Sign Out & Switch Account'}
                      </span>
                    </button>
                  </div>
                </>
              ) : mode === 'login' ? (
                <>
                  <div className="mb-6">
                    <h1 className="text-xl font-bold tracking-tight">
                      {needs2FA ? 'Two-Factor Verification' : 'Admin Sign In'}
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {needs2FA
                        ? `Enter the 6-digit code from your authenticator app for ${username}.`
                        : 'Administrator access only. Sign in with your admin account.'}
                    </p>
                  </div>

                  {error && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  {!needs2FA && (
                    <>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={googleBusy || busy}
                        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        {googleBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                        ) : (
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              fill="#4285F4"
                              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                            />
                          </svg>
                        )}
                        <span>
                          {googleBusy ? 'Signing in with Google...' : 'Continue with Google'}
                        </span>
                      </button>

                      <div className="my-5 flex items-center gap-3 text-[11px] text-slate-400">
                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                        <span>or continue with username &amp; password</span>
                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                      </div>
                    </>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    {!needs2FA ? (
                      <>
                        <div>
                          <label className={labelCls}>Username or Email</label>
                          <input
                            type="text"
                            required
                            autoComplete="username"
                            autoFocus
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin or admin@hostfinder.in"
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
                          <PasswordInput
                            value={password}
                            onChange={setPassword}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                          />
                        </div>

                        <label className="flex cursor-pointer items-center justify-between pt-0.5 text-xs text-slate-600 select-none dark:text-slate-400">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={rememberMe}
                              onChange={(e) => setRememberMe(e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                            <span>Keep me signed in for 7 days</span>
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {rememberMe ? '7d' : '12h'}
                          </span>
                        </label>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className={labelCls}>6-Digit Authenticator Code</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) =>
                              setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            placeholder="000000"
                            className={`${inputCls} text-center font-mono text-base tracking-[0.35em]`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNeeds2FA(false);
                            setTotpCode('');
                            setError('');
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          <span>Use a different account</span>
                        </button>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy || googleBusy}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{needs2FA ? 'Verifying Code...' : 'Signing In...'}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          <span>{needs2FA ? 'Verify & Sign In' : 'Sign In'}</span>
                        </>
                      )}
                    </button>
                  </form>

                  {!needs2FA && (
                    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Administrator Account
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            admin &middot; HostFinder@2026!
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={fillAdminCredentials}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            username === ADMIN_DEMO_ACCOUNT.username &&
                            password === ADMIN_DEMO_ACCOUNT.password
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          Fill Admin
                        </button>
                      </div>
                      <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Only administrator accounts can sign in. 5 failed attempts trigger a 15-minute lockout.
                      </p>
                    </div>
                  )}
                </>
              ) : mode === 'forgot' ? (
                <>
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('login');
                      }}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Sign In</span>
                    </button>
                    <h1 className="text-lg font-semibold tracking-tight">Reset Account Password</h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Enter your registered email address to generate a 30-minute verification code.
                    </p>
                  </div>

                  {error && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className={labelCls}>Registered Account Email</label>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="admin@hostfinder.in"
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Generating Code...</span>
                        </>
                      ) : (
                        <span>Generate Reset Code</span>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('login');
                      }}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back to Sign In</span>
                    </button>
                    <h1 className="text-lg font-semibold tracking-tight">
                      Complete Password Reset
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Enter the verification code and choose a strong new password for{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {resetEmail}
                      </span>
                      .
                    </p>
                  </div>

                  {previewResetCode && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                      Verification Code:{' '}
                      <span className="font-mono font-semibold">{previewResetCode}</span>
                    </div>
                  )}

                  {error && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <label className={labelCls}>Verification Code</label>
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="8-character code"
                        className={`${inputCls} font-mono uppercase tracking-wider`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>New Strong Password</label>
                      <PasswordInput
                        value={resetNewPass}
                        onChange={setResetNewPass}
                        placeholder="Enter a strong new password"
                        autoComplete="new-password"
                      />
                    </div>

                    <PasswordRequirements password={resetNewPass} />

                    <button
                      type="submit"
                      disabled={busy}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Resetting Password...</span>
                        </>
                      ) : (
                        <span>Reset Password</span>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </main>
    </div>
  );
}
