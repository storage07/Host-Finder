import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, ExternalLink, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { AuthUser, Provider, ProviderType } from '../types';
import { apiFetch } from '../utils/api';
import {
  ConfirmDialog,
  EmptyState,
  inputCls,
  labelCls,
  Modal,
  SecretRevealControl,
  TableSkeleton,
} from './UI';

const PROVIDER_TYPES: ProviderType[] = [
  'Domain Providers',
  'Hosting Providers',
  'Server Providers',
  'Email Providers',
  'Payment Providers',
];

const BLANK_PROVIDER = {
  providerName: '',
  providerType: 'Hosting Providers' as ProviderType,
  loginEmail: '',
  loginPassword: '',
  accountUrl: '',
  apiKey: '',
  apiSecret: '',
  configurationDetails: '',
  notes: '',
};

export function ProvidersView({
  user,
  onToast,
}: {
  user: AuthUser;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [items, setItems] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_PROVIDER);
  const [viewing, setViewing] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user.role === 'admin';

  const loadProviders = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: Provider[] }>('/api/providers');
      setItems(res.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((p) => {
      const matchQ =
        !q ||
        p.providerName.toLowerCase().includes(q) ||
        p.providerType.toLowerCase().includes(q) ||
        p.loginEmail.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'All' || p.providerType === categoryFilter;
      return matchQ && matchCat;
    });
  }, [items, search, categoryFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm(BLANK_PROVIDER);
    setModalOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditingId(p._id);
    setForm({
      providerName: p.providerName,
      providerType: p.providerType,
      loginEmail: p.loginEmail,
      loginPassword: '',
      accountUrl: p.accountUrl,
      apiKey: '',
      apiSecret: '',
      configurationDetails: p.configurationDetails,
      notes: p.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = { ...form };
      if (!payload.loginPassword) delete payload.loginPassword;
      if (!payload.apiKey) delete payload.apiKey;
      if (!payload.apiSecret) delete payload.apiSecret;

      if (editingId) {
        await apiFetch(`/api/providers/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onToast('Provider updated', 'success');
      } else {
        await apiFetch('/api/providers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Provider created', 'success');
      }
      setModalOpen(false);
      await loadProviders();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/providers/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted provider ${deleting.providerName}`, 'success');
      setDeleting(null);
      await loadProviders();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search providers..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {['All', ...PROVIDER_TYPES].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {cat === 'All' ? 'All Categories' : cat.replace(' Providers', '')}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Provider
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No providers found"
          description="Store encrypted portal credentials and API keys for domain, hosting, server, email, and payment providers."
          actionLabel={isAdmin ? 'Add Provider' : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Login Email & Password</th>
                  <th className="px-4 py-3 font-medium">API Key</th>
                  <th className="px-4 py-3 font-medium">API Secret</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.providerName}
                      </div>
                      {p.accountUrl && (
                        <a
                          href={p.accountUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Console <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {p.providerType}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300">
                        {p.loginEmail || '—'}
                      </div>
                      <SecretRevealControl
                        resource="provider"
                        id={p._id}
                        field="loginPassword"
                        hasValue={p.hasLoginPassword}
                        canReveal={isAdmin}
                        masked={p.maskedPassword}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <SecretRevealControl
                        resource="provider"
                        id={p._id}
                        field="apiKey"
                        hasValue={p.hasApiKey}
                        canReveal={isAdmin}
                        masked={p.maskedApiKey}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <SecretRevealControl
                        resource="provider"
                        id={p._id}
                        field="apiSecret"
                        hasValue={p.hasApiSecret}
                        canReveal={isAdmin}
                        masked={p.maskedApiSecret}
                      />
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(p)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              title="Edit Provider"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(p)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                              title="Delete Provider"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Provider' : 'Add Service Provider'}
        subtitle="Passwords, API keys, and API secrets are encrypted before storage"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Provider Name *</label>
            <input
              type="text"
              required
              value={form.providerName}
              onChange={(e) => setForm({ ...form, providerName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Provider Type *</label>
            <select
              value={form.providerType}
              onChange={(e) =>
                setForm({ ...form, providerType: e.target.value as ProviderType })
              }
              className={inputCls}
            >
              {PROVIDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Login Email</label>
            <input
              type="email"
              value={form.loginEmail}
              onChange={(e) => setForm({ ...form, loginEmail: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Login Password {editingId && '(blank keeps existing)'}
            </label>
            <input
              type="password"
              value={form.loginPassword}
              onChange={(e) => setForm({ ...form, loginPassword: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Account URL</label>
            <input
              type="url"
              value={form.accountUrl}
              onChange={(e) => setForm({ ...form, accountUrl: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>API Key {editingId && '(blank keeps existing)'}</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>API Secret {editingId && '(blank keeps existing)'}</label>
            <input
              type="password"
              value={form.apiSecret}
              onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Configuration Details</label>
            <textarea
              rows={2}
              value={form.configurationDetails}
              onChange={(e) => setForm({ ...form, configurationDetails: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Saving...' : editingId ? 'Save Changes' : 'Add Provider'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.providerName || ''}
        subtitle={viewing?.providerType}
      >
        {viewing && (
          <div className="space-y-4 text-xs">
            <div>
              <span className="text-slate-500">Account URL</span>
              <p className="mt-0.5 font-mono text-blue-600 dark:text-blue-400">
                {viewing.accountUrl || '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Configuration Details</span>
              <p className="mt-1 rounded-lg bg-slate-50 p-3 font-mono text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                {viewing.configurationDetails || 'None'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Notes</span>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{viewing.notes || '—'}</p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Provider"
        message={`Delete ${deleting?.providerName}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
