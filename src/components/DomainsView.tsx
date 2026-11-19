import React, { useEffect, useMemo, useState } from 'react';
import { Download, Edit2, Eye, FileDown, Plus, Search, Trash2 } from 'lucide-react';
import { AuthUser, Client, DomainRecord } from '../types';
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

const DOMAIN_STATUS_OPTIONS: readonly DomainRecord['accountStatus'][] = [
  'Active',
  'Upcoming Expiry',
  'Expired',
  'Renewed',
  'Cancelled',
];

const BLANK_DOMAIN = {
  clientId: '',
  domainName: '',
  domainRegistrar: '',
  registrationDate: toInputDate(null),
  expiryDate: toInputDate(new Date(Date.now() + 365 * 86400000).toISOString()),
  renewalPrice: 0,
  domainUsername: '',
  domainPassword: '',
  dnsDetails: '',
  nameservers: '',
  accountStatus: 'Active' as DomainRecord['accountStatus'],
  notes: '',
};

export function DomainsView({
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
  const [items, setItems] = useState<DomainRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_DOMAIN);
  const [viewing, setViewing] = useState<DomainRecord | null>(null);
  const [deleting, setDeleting] = useState<DomainRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';
  const canEdit = (clientId: string) =>
    isAdmin || (user.role === 'staff' && user.canUpdateAssignedServices && user.assignedClientIds.includes(clientId));

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([
        apiFetch<{ items: DomainRecord[] }>('/api/domains'),
        apiFetch<{ items: Client[] }>('/api/clients'),
      ]);
      setItems(dRes.items);
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
    return items.filter((d) => {
      const matchQ =
        !q ||
        String(d._id).toLowerCase().includes(q) ||
        d.clientId.toLowerCase().includes(q) ||
        d.domainName.toLowerCase().includes(q) ||
        d.domainRegistrar.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.nameservers.join(' ').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || d.accountStatus === statusFilter;
      return matchQ && matchStatus;
    });
  }, [items, search, statusFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...BLANK_DOMAIN, clientId: clients[0]?.clientId || '' });
    setModalOpen(true);
  };

  const openEdit = (d: DomainRecord) => {
    setEditingId(d._id);
    setForm({
      clientId: d.clientId,
      domainName: d.domainName,
      domainRegistrar: d.domainRegistrar,
      registrationDate: toInputDate(d.registrationDate),
      expiryDate: toInputDate(d.expiryDate),
      renewalPrice: d.renewalPrice,
      domainUsername: d.domainUsername,
      domainPassword: '',
      dnsDetails: d.dnsDetails,
      nameservers: (d.nameservers || []).join(', '),
      accountStatus: d.accountStatus,
      notes: d.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = { ...form };
      if (!payload.domainPassword) delete payload.domainPassword;
      if (editingId) {
        await apiFetch(`/api/domains/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onToast('Domain updated', 'success');
      } else {
        await apiFetch('/api/domains', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Domain added', 'success');
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
      await apiFetch(`/api/domains/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted domain ${deleting.domainName}`, 'success');
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
      onToast('No matching domain records to export', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const count = exportToCsv(
      `host_finder_domains_${today}.csv`,
      [
        { header: 'Client ID', accessor: (d) => d.clientId },
        { header: 'Client Name', accessor: (d) => d.clientName },
        { header: 'Domain Name', accessor: (d) => d.domainName },
        { header: 'Registrar', accessor: (d) => d.domainRegistrar },
        { header: 'Registration Date', accessor: (d) => (d.registrationDate ? String(d.registrationDate).slice(0, 10) : '') },
        { header: 'Expiry Date', accessor: (d) => (d.expiryDate ? String(d.expiryDate).slice(0, 10) : '') },
        { header: 'Renewal Price', accessor: (d) => d.renewalPrice },
        { header: 'Currency', accessor: () => currency },
        { header: 'Nameservers', accessor: (d) => (d.nameservers || []).join('; ') },
        { header: 'Account Status', accessor: (d) => d.accountStatus },
        { header: 'Notes', accessor: (d) => d.notes },
      ],
      filtered
    );
    onToast(`Exported ${count} domain record${count === 1 ? '' : 's'} to CSV`, 'success');
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const params = new URLSearchParams({ type: 'domains' });
      if (statusFilter !== 'All') params.set('status', statusFilter);
      const filename = await downloadAuthenticatedFile(
        `/api/excel/export?${params.toString()}`,
        'host_finder_domains.xlsx'
      );
      onToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleInlineStatusChange = async (
    domain: DomainRecord,
    nextStatus: DomainRecord['accountStatus']
  ) => {
    setUpdatingId(domain._id);
    try {
      const res = await apiFetch<{ item: DomainRecord }>(`/api/domains/${domain._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      setItems((prev) => prev.map((d) => (d._id === domain._id ? res.item : d)));
      onToast(`${domain.domainName} marked as ${nextStatus}`, 'success');
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
              placeholder="Search domain, registrar, nameservers, client..."
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
              Add Domain
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No domains found"
          description="Track domain registrars, DNS zones, nameservers, and automated expiry alerts."
          actionLabel={isAdmin ? 'Add First Domain' : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Domain Name</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Registrar</th>
                  <th className="px-4 py-3 font-medium">Nameservers</th>
                  <th className="px-4 py-3 font-medium">Credentials</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium text-right">Renewal</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((d) => {
                  const days = daysRemaining(d.expiryDate);
                  return (
                    <tr key={d._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {d.domainName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900 dark:text-slate-100">
                          {d.clientName || d.clientId}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">{d.clientId}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {d.domainRegistrar}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {(d.nameservers || []).slice(0, 2).map((ns) => (
                          <div key={ns}>{ns}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {d.domainUsername || '—'}
                        </div>
                        <SecretRevealControl
                          resource="domain"
                          id={d._id}
                          hasValue={d.hasPassword}
                          canReveal={isAdmin}
                          masked={d.maskedPassword}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-900 dark:text-slate-100">
                          {formatDate(d.expiryDate)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(d.renewalPrice, currency)}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit(d.clientId) ? (
                          <InlineStatusSelect
                            ariaLabel={`Status for ${d.domainName}`}
                            value={d.accountStatus}
                            options={DOMAIN_STATUS_OPTIONS}
                            disabled={updatingId === d._id}
                            onChange={(next) => handleInlineStatusChange(d, next)}
                          />
                        ) : (
                          <StatusLabel status={d.accountStatus} />
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewing(d)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            title="View DNS Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canEdit(d.clientId) && (
                            <button
                              type="button"
                              onClick={() => openEdit(d)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              title="Edit Domain"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleting(d)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                              title="Delete Domain"
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
        title={editingId ? 'Edit Domain Record' : 'Add Domain Record'}
        subtitle="Registrar passwords are AES-256-GCM encrypted"
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
              placeholder="company.in"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Domain Registrar *</label>
            <input
              type="text"
              required
              value={form.domainRegistrar}
              onChange={(e) => setForm({ ...form, domainRegistrar: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Renewal Price</label>
            <input
              type="number"
              min={0}
              value={form.renewalPrice}
              onChange={(e) => setForm({ ...form, renewalPrice: Number(e.target.value) })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Registration Date *</label>
            <input
              type="date"
              required
              value={form.registrationDate}
              onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
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
            <label className={labelCls}>Domain Username</label>
            <input
              type="text"
              value={form.domainUsername}
              onChange={(e) => setForm({ ...form, domainUsername: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Domain Password {editingId && '(leave blank to keep existing)'}
            </label>
            <input
              type="password"
              value={form.domainPassword}
              onChange={(e) => setForm({ ...form, domainPassword: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Nameservers (comma-separated)</label>
            <input
              type="text"
              value={form.nameservers}
              onChange={(e) => setForm({ ...form, nameservers: e.target.value })}
              placeholder="ns1.cloudflare.com, ns2.cloudflare.com"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>DNS Details (A / MX / CNAME / TXT)</label>
            <textarea
              rows={2}
              value={form.dnsDetails}
              onChange={(e) => setForm({ ...form, dnsDetails: e.target.value })}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={form.accountStatus}
              onChange={(e) =>
                setForm({ ...form, accountStatus: e.target.value as DomainRecord['accountStatus'] })
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
              {busy ? 'Saving...' : editingId ? 'Save Changes' : 'Create Domain'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.domainName || ''}
        subtitle={`${viewing?.domainRegistrar} · ${viewing?.clientName}`}
      >
        {viewing && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500">Registration Date</span>
                <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                  {formatDate(viewing.registrationDate)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Expiry Date</span>
                <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                  {formatDate(viewing.expiryDate)}
                </p>
              </div>
            </div>
            <div>
              <span className="text-slate-500">Nameservers</span>
              <div className="mt-1 rounded-lg bg-slate-50 p-3 font-mono text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                {(viewing.nameservers || []).join('\n') || 'None configured'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">DNS Records</span>
              <div className="mt-1 rounded-lg bg-slate-50 p-3 font-mono text-slate-800 dark:bg-slate-800/60 dark:text-slate-200 whitespace-pre-wrap">
                {viewing.dnsDetails || 'No DNS records entered.'}
              </div>
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
        title="Delete Domain"
        message={`Remove ${deleting?.domainName} from domain tracking?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
