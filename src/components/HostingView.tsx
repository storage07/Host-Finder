import React, { useEffect, useMemo, useState } from 'react';
import { Download, Edit2, FileDown, Plus, Search, Trash2 } from 'lucide-react';
import { AuthUser, Client, HostingService } from '../types';
import {
  apiFetch,
  daysRemaining,
  downloadAuthenticatedFile,
  formatDate,
  formatMoney,
  toInputDate,
} from '../utils/api';
import { exportToCsv } from '../utils/csv';
import {
  ConfirmDialog,
  EmptyState,
  InlineStatusSelect,
  inputCls,
  labelCls,
  Modal,
  SecretRevealControl,
  StatusLabel,
  TableSkeleton,
} from './UI';

const HOSTING_STATUS_OPTIONS: readonly HostingService['accountStatus'][] = [
  'Active',
  'Upcoming Expiry',
  'Expired',
  'Renewed',
  'Cancelled',
];

const BLANK_HOSTING = {
  clientId: '',
  hostingProvider: '',
  hostingPlan: '',
  domainName: '',
  serverName: '',
  serverIp: '',
  username: '',
  password: '',
  startDate: toInputDate(null),
  expiryDate: toInputDate(new Date(Date.now() + 365 * 86400000).toISOString()),
  renewalAmount: 0,
  providerEmail: '',
  accountStatus: 'Active' as HostingService['accountStatus'],
  notes: '',
};

export function HostingView({
  user,
  currency,
  initialSearch,
  onClearInitialSearch,
  initialStatus,
  onClearInitialStatus,
  onToast,
}: {
  user: AuthUser;
  currency: string;
  initialSearch?: string;
  onClearInitialSearch?: () => void;
  initialStatus?: string;
  onClearInitialStatus?: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [items, setItems] = useState<HostingService[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_HOSTING);
  const [deleting, setDeleting] = useState<HostingService | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';
  const canEdit = (clientId: string) =>
    isAdmin || (user.role === 'staff' && user.canUpdateAssignedServices && user.assignedClientIds.includes(clientId));

  const loadAll = async () => {
    setLoading(true);
    try {
      const [hRes, cRes] = await Promise.all([
        apiFetch<{ items: HostingService[] }>('/api/hosting'),
        apiFetch<{ items: Client[] }>('/api/clients'),
      ]);
      setItems(hRes.items);
      setClients(cRes.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
      setStatusFilter('All');
      onClearInitialSearch?.();
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialStatus) {
      setStatusFilter(initialStatus);
      onClearInitialStatus?.();
    }
  }, [initialStatus]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((h) => {
      const matchQ =
        !q ||
        String(h._id).toLowerCase().includes(q) ||
        h.clientId.toLowerCase().includes(q) ||
        h.domainName.toLowerCase().includes(q) ||
        h.hostingProvider.toLowerCase().includes(q) ||
        h.hostingPlan.toLowerCase().includes(q) ||
        h.serverName.toLowerCase().includes(q) ||
        h.serverIp.toLowerCase().includes(q) ||
        h.clientName.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || h.accountStatus === statusFilter;
      return matchQ && matchStatus;
    });
  }, [items, search, statusFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...BLANK_HOSTING, clientId: clients[0]?.clientId || '' });
    setModalOpen(true);
  };

  const openEdit = (h: HostingService) => {
    setEditingId(h._id);
    setForm({
      clientId: h.clientId,
      hostingProvider: h.hostingProvider,
      hostingPlan: h.hostingPlan,
      domainName: h.domainName,
      serverName: h.serverName,
      serverIp: h.serverIp,
      username: h.username,
      password: '',
      startDate: toInputDate(h.startDate),
      expiryDate: toInputDate(h.expiryDate),
      renewalAmount: h.renewalAmount,
      providerEmail: h.providerEmail,
      accountStatus: h.accountStatus,
      notes: h.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = { ...form };
      if (!payload.password) delete payload.password;
      if (editingId) {
        await apiFetch(`/api/hosting/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onToast('Hosting service updated', 'success');
      } else {
        await apiFetch('/api/hosting', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Hosting service added', 'success');
      }
      setModalOpen(false);
      await loadAll();
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
      await apiFetch(`/api/hosting/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted hosting for ${deleting.domainName}`, 'success');
      setDeleting(null);
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      onToast('No matching hosting records to export', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const count = exportToCsv(
      `host_finder_hosting_${today}.csv`,
      [
        { header: 'Client ID', accessor: (h) => h.clientId },
        { header: 'Client Name', accessor: (h) => h.clientName },
        { header: 'Domain Name', accessor: (h) => h.domainName },
        { header: 'Hosting Provider', accessor: (h) => h.hostingProvider },
        { header: 'Hosting Plan', accessor: (h) => h.hostingPlan },
        { header: 'Server Name', accessor: (h) => h.serverName },
        { header: 'Server IP', accessor: (h) => h.serverIp },
        { header: 'Control Panel Username', accessor: (h) => h.username },
        { header: 'Provider Email', accessor: (h) => h.providerEmail },
        { header: 'Start Date', accessor: (h) => (h.startDate ? String(h.startDate).slice(0, 10) : '') },
        { header: 'Expiry Date', accessor: (h) => (h.expiryDate ? String(h.expiryDate).slice(0, 10) : '') },
        { header: 'Renewal Amount', accessor: (h) => h.renewalAmount },
        { header: 'Currency', accessor: () => currency },
        { header: 'Account Status', accessor: (h) => h.accountStatus },
        { header: 'Notes', accessor: (h) => h.notes },
      ],
      filtered
    );
    onToast(`Exported ${count} hosting record${count === 1 ? '' : 's'} to CSV`, 'success');
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const params = new URLSearchParams({ type: 'hosting' });
      if (statusFilter !== 'All') params.set('status', statusFilter);
      const filename = await downloadAuthenticatedFile(
        `/api/excel/export?${params.toString()}`,
        'host_finder_hosting.xlsx'
      );
      onToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleInlineStatusChange = async (
    hosting: HostingService,
    nextStatus: HostingService['accountStatus']
  ) => {
    setUpdatingId(hosting._id);
    try {
      const res = await apiFetch<{ item: HostingService }>(`/api/hosting/${hosting._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      setItems((prev) => prev.map((h) => (h._id === hosting._id ? res.item : h)));
      onToast(`${hosting.domainName} marked as ${nextStatus}`, 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setUpdatingId(null);
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
              placeholder="Search domain, server, IP, provider..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Upcoming Expiry">Upcoming Expiry</option>
            <option value="Expired">Expired</option>
            <option value="Renewed">Renewed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </button>
          {user.role !== 'viewer' && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {exportingExcel ? 'Exporting...' : 'Export Excel'}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Hosting
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hosting services found"
          description="Add hosting plans, server IPs, and encrypted login credentials to track renewals."
          actionLabel={isAdmin ? 'Add Hosting Service' : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Domain & Client</th>
                  <th className="px-4 py-3 font-medium">Provider & Plan</th>
                  <th className="px-4 py-3 font-medium">Server & IP</th>
                  <th className="px-4 py-3 font-medium">Credentials</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium text-right">Renewal</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((h) => {
                  const days = daysRemaining(h.expiryDate);
                  return (
                    <tr key={h._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {h.domainName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {h.clientName || h.clientId}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {h.hostingProvider}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {h.hostingPlan}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                        <div>{h.serverName || '—'}</div>
                        <div className="text-[11px] text-slate-500">{h.serverIp || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {h.username || '—'}
                        </div>
                        <SecretRevealControl
                          resource="hosting"
                          id={h._id}
                          hasValue={h.hasPassword}
                          canReveal={isAdmin}
                          masked={h.maskedPassword}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-900 dark:text-slate-100">
                          {formatDate(h.expiryDate)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(h.renewalAmount, currency)}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit(h.clientId) ? (
                          <InlineStatusSelect
                            ariaLabel={`Status for ${h.domainName}`}
                            value={h.accountStatus}
                            options={HOSTING_STATUS_OPTIONS}
                            disabled={updatingId === h._id}
                            onChange={(next) => handleInlineStatusChange(h, next)}
                          />
                        ) : (
                          <StatusLabel status={h.accountStatus} />
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canEdit(h.clientId) && (
                            <button
                              type="button"
                              onClick={() => openEdit(h)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              title="Edit Hosting"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleting(h)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                              title="Delete Hosting"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Hosting Service' : 'Add Hosting Service'}
        subtitle="Passwords are encrypted at rest using AES-256-GCM"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Client *</label>
            <select
              required
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              className={inputCls}
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c._id} value={c.clientId}>
                  {c.clientId} — {c.clientName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Domain Name *</label>
            <input
              type="text"
              required
              value={form.domainName}
              onChange={(e) => setForm({ ...form, domainName: e.target.value })}
              placeholder="example.in"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Hosting Provider *</label>
            <input
              type="text"
              required
              value={form.hostingProvider}
              onChange={(e) => setForm({ ...form, hostingProvider: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Hosting Plan *</label>
            <input
              type="text"
              required
              value={form.hostingPlan}
              onChange={(e) => setForm({ ...form, hostingPlan: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Server Name</label>
            <input
              type="text"
              value={form.serverName}
              onChange={(e) => setForm({ ...form, serverName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Server IP</label>
            <input
              type="text"
              value={form.serverIp}
              onChange={(e) => setForm({ ...form, serverIp: e.target.value })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Control Panel Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Password {editingId && '(leave blank to keep existing)'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Start Date *</label>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Expiry Date *</label>
            <input
              type="date"
              required
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Renewal Amount</label>
            <input
              type="number"
              min={0}
              value={form.renewalAmount}
              onChange={(e) => setForm({ ...form, renewalAmount: Number(e.target.value) })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Provider Email</label>
            <input
              type="email"
              value={form.providerEmail}
              onChange={(e) => setForm({ ...form, providerEmail: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Account Status</label>
            <select
              value={form.accountStatus}
              onChange={(e) =>
                setForm({ ...form, accountStatus: e.target.value as HostingService['accountStatus'] })
              }
              className={inputCls}
            >
              <option value="Active">Active</option>
              <option value="Upcoming Expiry">Upcoming Expiry</option>
              <option value="Expired">Expired</option>
              <option value="Renewed">Renewed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input
              type="text"
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
              {busy ? 'Saving...' : editingId ? 'Save Changes' : 'Create Hosting'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Hosting Service"
        message={`Delete hosting service for ${deleting?.domainName}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
