import React, { useEffect, useState } from 'react';
import { Save, ShieldAlert } from 'lucide-react';
import { PaymentGateway } from '../types';
import { apiFetch } from '../utils/api';
import { inputCls, labelCls, SecretRevealControl, TableSkeleton } from './UI';

export function PaymentGatewaysView({
  onToast,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [selectedKey, setSelectedKey] = useState<PaymentGateway['gatewayKey']>('razorpay');
  const [editingEnv, setEditingEnv] = useState<'test' | 'live'>('test');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [configDetails, setConfigDetails] = useState('');
  const [envStatus, setEnvStatus] = useState<'Enabled' | 'Disabled'>('Disabled');

  const loadGateways = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: PaymentGateway[] }>('/api/gateways');
      setGateways(res.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGateways();
  }, []);

  const currentGateway = gateways.find((g) => g.gatewayKey === selectedKey);

  useEffect(() => {
    if (!currentGateway) return;
    setEditingEnv(currentGateway.activeMode);
  }, [selectedKey, currentGateway?._id]);

  useEffect(() => {
    if (!currentGateway) return;
    const cfg =
      editingEnv === 'live' ? currentGateway.liveConfig : currentGateway.testConfig;
    setEmail(cfg?.email || '');
    setPassword('');
    setApiKey('');
    setApiSecret('');
    setConfigDetails(cfg?.configurationDetails || '');
    setEnvStatus(cfg?.status || 'Disabled');
  }, [currentGateway, editingEnv]);

  const handleModeDropdownChange = async (nextMode: 'test' | 'live') => {
    if (!currentGateway) return;
    setEditingEnv(nextMode);
    try {
      await apiFetch(`/api/gateways/${currentGateway._id}`, {
        method: 'PUT',
        body: JSON.stringify({ activeMode: nextMode }),
      });
      onToast(`${currentGateway.providerName} switched to ${nextMode.toUpperCase()} mode`, 'success');
      await loadGateways();
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const handleSaveEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGateway) return;
    setBusy(true);
    try {
      const configPayload: Record<string, string> = {
        email,
        configurationDetails: configDetails,
        status: envStatus,
      };
      if (password) configPayload.password = password;
      if (apiKey) configPayload.apiKey = apiKey;
      if (apiSecret) configPayload.apiSecret = apiSecret;

      await apiFetch(`/api/gateways/${currentGateway._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          modeToUpdate: editingEnv,
          config: configPayload,
        }),
      });
      onToast(
        `Saved ${currentGateway.providerName} (${editingEnv.toUpperCase()} environment)`,
        'success'
      );
      await loadGateways();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <TableSkeleton rows={5} />;

  const activeEnvObj = currentGateway
    ? editingEnv === 'live'
      ? currentGateway.liveConfig
      : currentGateway.testConfig
    : null;

  return (
    <div className="space-y-6">
      {/* Provider Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {gateways.map((g) => (
            <button
              key={g.gatewayKey}
              type="button"
              onClick={() => setSelectedKey(g.gatewayKey)}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedKey === g.gatewayKey
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {g.providerName}
            </button>
          ))}
        </div>

        {currentGateway && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
              Active Gateway Environment:
            </label>
            <select
              value={currentGateway.activeMode}
              onChange={(e) => handleModeDropdownChange(e.target.value as 'test' | 'live')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="test">Test Mode (Sandbox)</option>
              <option value="live">Live Mode (Production)</option>
            </select>
          </div>
        )}
      </div>

      {currentGateway && activeEnvObj && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Isolated Environment Form */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {currentGateway.providerName} —{' '}
                  {editingEnv === 'live' ? 'Live Mode Credentials' : 'Test Mode Credentials'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Test and Live credentials are stored in strictly isolated objects.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEnv('test')}
                  className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                    editingEnv === 'test'
                      ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-900 dark:text-amber-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Edit Test
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEnv('live')}
                  className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                    editingEnv === 'live'
                      ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Edit Live
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEnv} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  {editingEnv === 'live' ? 'Live Email' : 'Test Email'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {editingEnv === 'live' ? 'Live Status' : 'Test Status'}
                </label>
                <select
                  value={envStatus}
                  onChange={(e) => setEnvStatus(e.target.value as 'Enabled' | 'Disabled')}
                  className={inputCls}
                >
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  {editingEnv === 'live' ? 'Live Password / Secret' : 'Test Password / Secret'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep stored secret"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {editingEnv === 'live' ? 'Live API Key' : 'Test API Key'}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank to keep stored key"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  {editingEnv === 'live' ? 'Live API Secret' : 'Test API Secret'}
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Leave blank to keep stored secret"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Configuration Details (JSON / Host / Bundle ID)</label>
                <textarea
                  rows={3}
                  value={configDetails}
                  onChange={(e) => setConfigDetails(e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {busy
                    ? 'Encrypting & Saving...'
                    : `Save ${editingEnv === 'live' ? 'Live' : 'Test'} Configuration`}
                </button>
              </div>
            </form>
          </div>

          {/* Stored Masked Vault Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-sm font-semibold">
                Stored {editingEnv === 'live' ? 'Live' : 'Test'} Vault
              </h4>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AES-256-GCM encrypted credentials. Admin reveal actions are recorded in activity logs.
            </p>

            <div className="mt-5 space-y-4 text-xs">
              <div>
                <span className="text-slate-500">Environment Status</span>
                <p
                  className={`mt-0.5 font-semibold ${
                    activeEnvObj.status === 'Enabled'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {activeEnvObj.status}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Stored Email</span>
                <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                  {activeEnvObj.email || '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Password / Secret</span>
                <div className="mt-0.5">
                  <SecretRevealControl
                    resource="gateway"
                    id={currentGateway._id}
                    field="password"
                    mode={editingEnv}
                    hasValue={activeEnvObj.hasPassword}
                    canReveal
                    masked={activeEnvObj.maskedPassword}
                  />
                </div>
              </div>
              <div>
                <span className="text-slate-500">API Key</span>
                <div className="mt-0.5">
                  <SecretRevealControl
                    resource="gateway"
                    id={currentGateway._id}
                    field="apiKey"
                    mode={editingEnv}
                    hasValue={activeEnvObj.hasApiKey}
                    canReveal
                    masked={activeEnvObj.maskedApiKey}
                  />
                </div>
              </div>
              <div>
                <span className="text-slate-500">API Secret</span>
                <div className="mt-0.5">
                  <SecretRevealControl
                    resource="gateway"
                    id={currentGateway._id}
                    field="apiSecret"
                    mode={editingEnv}
                    hasValue={activeEnvObj.hasApiSecret}
                    canReveal
                    masked={activeEnvObj.maskedApiSecret}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
