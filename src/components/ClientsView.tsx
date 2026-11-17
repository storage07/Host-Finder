import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Edit2,
  Eye,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Client } from '../types';
import { apiFetch, formatDate, formatMoney, toInputDate } from '../utils/api';
import {
  ConfirmDialog,
  EmptyState,
  inputCls,
  labelCls,
  Modal,
  StatusLabel,
  TableSkeleton,
} from './UI';

const BLANK_CLIENT = {
  clientName: '',
  companyName: '',
  email: '',
  mobile: '',
  address: '',
  startDate: toInputDate(null),
  endDate: toInputDate(new Date(Date.now() + 365 * 86400000).toISOString()),
  serviceProvider: '',
  serviceType: 'Hosting & Domain',
  servicePrice: 0,
  renewalPrice: 0,
  paymentStatus: 'Pending' as Client['paymentStatus'],
  accountStatus: 'Active' as Client['accountStatus'],
  notes: '',
};

export function ClientsView({
  currency,
  isAdmin,
  initialAddOpen,
  onClearInitialAdd,
  onNavigateExcel,
  onToast,
}: {
  currency: string;
  isAdmin: boolean;
  initialAddOpen?: boolean;
  onClearInitialAdd?: () => void;
  onNavigateExcel: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_CLIENT);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: Client[] }>('/api/clients');
      setClients(res.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (initialAddOpen && isAdmin) {
      setEditingId(null);
      setForm(BLANK_CLIENT);
      setModalOpen(true);
      onClearInitialAdd?.();
    }
  }, [initialAddOpen, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((c) => {
      const matchQ =
        !q ||
        c.clientId.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.serviceProvider.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || c.accountStatus === statusFilter;
      const matchPay = paymentFilter === 'All' || c.paymentStatus === paymentFilter;
      return matchQ && matchStatus && matchPay;
    });
  }, [clients, search, statusFilter, paymentFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm(BLANK_CLIENT);
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c._id);
    setForm({
      clientName: c.clientName,
      companyName: c.companyName,
      email: c.email,
      mobile: c.mobile,
      address: c.address,
      startDate: toInputDate(c.startDate),
      endDate: toInputDate(c.endDate),
      serviceProvider: c.serviceProvider,
      serviceType: c.serviceType,
      servicePrice: c.servicePrice,
      renewalPrice: c.renewalPrice,
      paymentStatus: c.paymentStatus,
      accountStatus: c.accountStatus,
      notes: c.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await apiFetch(`/api/clients/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onToast('Client updated successfully', 'success');
      } else {
        await apiFetch('/api/clients', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onToast('Client added successfully', 'success');
      }
      setModalOpen(false);
      await loadClients();
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
      await apiFetch(`/api/clients/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted client ${deleting.clientId}`, 'success');
      setDeleting(null);
      await loadClients();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client ID, name, email, mobile..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="All">All Account Statuses</option>
            <option value="Active">Active</option>
            <option value="Upcoming Expiry">Upcoming Expiry</option>
            <option value="Expired">Expired</option>
            <option value="Renewed">Renewed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="All">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Overdue">Overdue</option>
            <option value="Partial">Partial</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={onNavigateExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          <a
            href="/api/excel/export?type=clients"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
          {isAdmin && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Client
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No clients match your criteria"
          description="Add a client record or import clients from an Excel spreadsheet."
          actionLabel={isAdmin ? 'Add First Client' : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Client ID</th>
                  <th className="px-4 py-3 font-medium">Client & Company</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Service & Provider</th>
                  <th className="px-4 py-3 font-medium">Term Dates</th>
                  <th className="px-4 py-3 font-medium text-right">Service / Renewal</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Account Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {c.clientId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.clientName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.companyName || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300">{c.email}</div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {c.mobile}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900 dark:text-slate-100">{c.serviceType}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.serviceProvider || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div>{formatDate(c.startDate)}</div>
                      <div className="text-[11px] text-slate-400">to {formatDate(c.endDate)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 dark:text-slate-100">
                        {formatMoney(c.servicePrice, currency)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Ren: {formatMoney(c.renewalPrice, currency)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={c.paymentStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={c.accountStatus} />
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(c)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          title="View Client"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              title="Edit Client"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(c)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                              title="Delete Client"
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

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Client Record' : 'Add New Client'}
        subtitle="Client ID is generated automatically upon creation"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Client Name *</label>
            <input
              type="text"
              required
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Company Name</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Mobile Number *</label>
            <input
              type="text"
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
            <label className={labelCls}>End Date *</label>
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Service Provider</label>
            <input
              type="text"
              value={form.serviceProvider}
              onChange={(e) => setForm({ ...form, serviceProvider: e.target.value })}
              placeholder="e.g., AWS Lightsail, Hostinger"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Service Type</label>
            <input
              type="text"
              value={form.serviceType}
              onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Service Price</label>
            <input
              type="number"
              min={0}
              value={form.servicePrice}
              onChange={(e) => setForm({ ...form, servicePrice: Number(e.target.value) })}
              className={`${inputCls} font-mono`}
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
            <label className={labelCls}>Payment Status</label>
            <select
              value={form.paymentStatus}
              onChange={(e) =>
                setForm({ ...form, paymentStatus: e.target.value as Client['paymentStatus'] })
              }
              className={inputCls}
            >
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
              <option value="Partial">Partial</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Account Status</label>
            <select
              value={form.accountStatus}
              onChange={(e) =>
                setForm({ ...form, accountStatus: e.target.value as Client['accountStatus'] })
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
              {busy ? 'Saving...' : editingId ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Detail Modal */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.clientId} — ${viewing.clientName}` : ''}
        subtitle={viewing?.companyName}
      >
        {viewing && (
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Email</span>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{viewing.email}</p>
            </div>
            <div>
              <span className="text-slate-500">Mobile</span>
              <p className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">{viewing.mobile}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">Address</span>
              <p className="mt-0.5 text-slate-900 dark:text-slate-100">{viewing.address || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Service Provider</span>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{viewing.serviceProvider || '—'}</p>
            </div>
            <div>
              <span className="text-slate-500">Service Type</span>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{viewing.serviceType}</p>
            </div>
            <div>
              <span className="text-slate-500">Start Date</span>
              <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">{formatDate(viewing.startDate)}</p>
            </div>
            <div>
              <span className="text-slate-500">End Date</span>
              <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">{formatDate(viewing.endDate)}</p>
            </div>
            <div>
              <span className="text-slate-500">Service Price</span>
              <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{formatMoney(viewing.servicePrice, currency)}</p>
            </div>
            <div>
              <span className="text-slate-500">Renewal Price</span>
              <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{formatMoney(viewing.renewalPrice, currency)}</p>
            </div>
            <div>
              <span className="text-slate-500">Payment Status</span>
              <div className="mt-0.5"><StatusLabel status={viewing.paymentStatus} /></div>
            </div>
            <div>
              <span className="text-slate-500">Account Status</span>
              <div className="mt-0.5"><StatusLabel status={viewing.accountStatus} /></div>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">Notes</span>
              <p className="mt-1 rounded-lg bg-slate-50 p-3 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                {viewing.notes || 'No notes recorded.'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Client"
        message={`Are you sure you want to permanently delete ${deleting?.clientId} (${deleting?.clientName})?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
