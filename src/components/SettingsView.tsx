import React, { useEffect, useState } from 'react';
import { BookOpen, Database, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { AppSettings, AuthUser } from '../types';
import { apiFetch } from '../utils/api';
import { inputCls, labelCls, TableSkeleton } from './UI';

export function SettingsView({
  user,
  onUserUpdate,
  onSettingsUpdate,
  onToast,
}: {
  user: AuthUser;
  onUserUpdate: (u: AuthUser) => void;
  onSettingsUpdate: (s: AppSettings) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dbInfo, setDbInfo] = useState<{ mode: string; info: string; collections: string[] } | null>(null);
  const [apiDocs, setApiDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 2FA TOTP Enrollment
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    Promise.all([
      apiFetch<{ settings: AppSettings; database: any }>('/api/settings'),
      apiFetch<{ endpoints: any[] }>('/api/docs'),
    ])
      .then(([sRes, dRes]) => {
        setSettings(sRes.settings);
        setDbInfo(sRes.database);
        setApiDocs(dRes.endpoints || []);
      })
      .catch((err) => onToast((err as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ settings: AppSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      onSettingsUpdate(res.settings);
      onToast('Platform & tax settings saved', 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onUserUpdate(res.user);
      setCurrentPassword('');
      setNewPassword('');
      onToast('Password updated successfully', 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const start2FA = async () => {
    try {
      const res = await apiFetch<{ secret: string; qrDataUrl: string }>(
        '/api/auth/2fa/setup',
        { method: 'POST' }
      );
      setTotpSecret(res.secret);
      setQrDataUrl(res.qrDataUrl);
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const enable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode }),
      });
      onUserUpdate(res.user);
      setQrDataUrl('');
      setTotpSecret('');
      setTotpCode('');
      onToast('Two-Factor Authentication enabled', 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const disable2FA = async () => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/2fa/disable', {
        method: 'POST',
      });
      onUserUpdate(res.user);
      onToast('Two-Factor Authentication disabled', 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  if (loading || !settings) return <TableSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Organization & Tax Configuration */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Company, Billing & GST Configuration
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Applied automatically to PDF invoices and expiry notifications.
          </p>

          <form onSubmit={handleSaveSettings} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Company Name</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Billing Email</label>
              <input
                type="email"
                disabled={!isAdmin}
                value={settings.companyEmail}
                onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Company GSTIN</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={settings.companyGstNumber}
                onChange={(e) => setSettings({ ...settings, companyGstNumber: e.target.value })}
                className={`${inputCls} font-mono uppercase`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Registered Address</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={settings.companyAddress}
                onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Default Currency</label>
              <select
                disabled={!isAdmin}
                value={settings.defaultCurrency}
                onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
                className={inputCls}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default Tax Mode</label>
              <select
                disabled={!isAdmin}
                value={settings.defaultTaxMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultTaxMode: e.target.value as 'with_tax' | 'without_tax',
                  })
                }
                className={inputCls}
              >
                <option value="with_tax">With Tax (GST)</option>
                <option value="without_tax">Without Tax</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default GST / Tax %</label>
              <input
                type="number"
                min={0}
                max={100}
                disabled={!isAdmin}
                value={settings.defaultTaxRate}
                onChange={(e) =>
                  setSettings({ ...settings, defaultTaxRate: Number(e.target.value) })
                }
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="email-alerts"
                type="checkbox"
                disabled={!isAdmin}
                checked={settings.emailAlertsEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, emailAlertsEnabled: e.target.checked })
                }
              />
              <label htmlFor="email-alerts" className="text-xs font-medium">
                Send SMTP Email Expiry Reminders
              </label>
            </div>
            {isAdmin && (
              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Account Security: Password & TOTP 2FA */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Change Your Password
              </h3>
            </div>
            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <div>
                <label className={labelCls}>Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
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
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Two-Factor Authentication (TOTP)
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  user.twoFactorEnabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500'
                }`}
              >
                {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {user.twoFactorEnabled ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Your account requires a 6-digit authenticator code on sign-in.
                </p>
                <button
                  type="button"
                  onClick={disable2FA}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400"
                >
                  Disable 2FA
                </button>
              </div>
            ) : qrDataUrl ? (
              <form onSubmit={enable2FA} className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR Code"
                    className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1"
                  />
                  <div className="text-xs">
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      Scan with Google Authenticator or Authy
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      Secret: {totpSecret}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className={`${inputCls} max-w-[180px] font-mono`}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Verify & Enable
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Protect administrator credentials with RFC 6238 TOTP verification.
                </p>
                <button
                  type="button"
                  onClick={start2FA}
                  className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
                >
                  Enable 2FA
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MongoDB Atlas & API Documentation Reference */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Database Architecture
            </h3>
          </div>
          {dbInfo && (
            <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <p>
                Active Driver:{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {dbInfo.mode}
                </span>
              </p>
              <p>{dbInfo.info}</p>
              <p className="pt-2 font-medium text-slate-700 dark:text-slate-300">
                12 Collections Configured:
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {dbInfo.collections.join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              REST API Endpoints Reference
            </h3>
          </div>
          <div className="mt-3 max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {apiDocs.map((ep, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <div className="font-mono">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {ep.method}
                  </span>{' '}
                  <span className="text-slate-900 dark:text-slate-100">{ep.path}</span>
                </div>
                <span className="text-slate-500 dark:text-slate-400">{ep.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
