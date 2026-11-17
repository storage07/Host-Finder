import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import { AuthUser, Client, Invoice, PaymentRecord } from '../types';
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

export function InvoicesView({
  user,
  defaultCurrency,
  defaultTaxRate,
  defaultTaxMode,
  onToast,
}: {
  user: AuthUser;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultTaxMode: 'with_tax' | 'without_tax';
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);

  // Invoice Builder State
  const [clientId, setClientId] = useState('');
  const [taxMode, setTaxMode] = useState<'with_tax' | 'without_tax'>(defaultTaxMode);
  const [taxPercentage, setTaxPercentage] = useState(defaultTaxRate);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [dueDate, setDueDate] = useState(
    toInputDate(new Date(Date.now() + 14 * 86400000).toISOString())
  );
  const [status, setStatus] = useState<'Paid' | 'Pending' | 'Overdue'>('Pending');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([
    { description: 'Annual Managed Cloud Hosting', serviceType: 'Hosting', quantity: 1, unitPrice: 15000 },
  ]);

  const isAdmin = user.role === 'admin';

  const loadAll = async () => {
    setLoading(true);
    try {
      const [invRes, cliRes] = await Promise.all([
        apiFetch<{ items: Invoice[]; payments: PaymentRecord[] }>('/api/invoices'),
        apiFetch<{ items: Client[] }>('/api/clients'),
      ]);
      setInvoices(invRes.items);
      setPayments(invRes.payments);
      setClients(cliRes.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const calcSubtotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, li) => sum + Number(li.quantity || 1) * Number(li.unitPrice || 0),
        0
      ),
    [lineItems]
  );
  const calcTax = useMemo(
    () =>
      taxMode === 'with_tax'
        ? Number(((calcSubtotal * Number(taxPercentage || 0)) / 100).toFixed(2))
        : 0,
    [calcSubtotal, taxMode, taxPercentage]
  );
  const calcTotal = Number((calcSubtotal + calcTax).toFixed(2));

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((i) => {
      const matchQ =
        !q ||
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        i.companyName.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || i.status === statusFilter;
      return matchQ && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const openCreate = () => {
    setClientId(clients[0]?.clientId || '');
    setTaxMode(defaultTaxMode);
    setTaxPercentage(defaultTaxRate);
    setCurrency(defaultCurrency);
    setStatus('Pending');
    setNotes('');
    setLineItems([
      { description: 'Annual Managed Cloud Hosting', serviceType: 'Hosting', quantity: 1, unitPrice: 15000 },
    ]);
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          lineItems,
          taxMode,
          taxPercentage: taxMode === 'with_tax' ? taxPercentage : 0,
          currency,
          dueDate,
          status,
          notes,
        }),
      });
      onToast('Invoice generated successfully', 'success');
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const updateInvoiceStatus = async (inv: Invoice, nextStatus: Invoice['status']) => {
    try {
      await apiFetch(`/api/invoices/${inv._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      onToast(`${inv.invoiceNumber} marked as ${nextStatus}`, 'success');
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/invoices/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted ${deleting.invoiceNumber}`, 'success');
      setDeleting(null);
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab('invoices')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                tab === 'invoices'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Invoices ({invoices.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('payments')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                tab === 'payments'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Payment Records ({payments.length})
            </button>
          </div>

          {tab === 'invoices' && (
            <>
              <div className="relative min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search invoice # or client..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
              </select>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user.role !== 'viewer' && (
            <a
              href="/api/excel/export?type=payments"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </a>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Invoice
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : tab === 'invoices' ? (
        filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description="Generate GST-compliant (With Tax) or zero-tax (Without Tax) invoices with PDF download."
            actionLabel={isAdmin ? 'Create Invoice' : undefined}
            onAction={isAdmin ? openCreate : undefined}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-5 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Tax Mode</th>
                    <th className="px-4 py-3 font-medium text-right">Subtotal</th>
                    <th className="px-4 py-3 font-medium text-right">Tax</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium">Due Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {inv.clientName}
                        </div>
                        <div className="text-[11px] text-slate-500">{inv.companyName}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {inv.taxMode === 'with_tax'
                          ? `With Tax (${inv.taxPercentage}%)`
                          : 'Without Tax'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatMoney(inv.subtotal, inv.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatMoney(inv.taxAmount, inv.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(inv.totalAmount, inv.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <select
                            value={inv.status}
                            onChange={(e) =>
                              updateInvoiceStatus(inv, e.target.value as Invoice['status'])
                            }
                            className="rounded border border-slate-200 bg-transparent px-2 py-1 text-xs font-medium dark:border-slate-700"
                          >
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Overdue">Overdue</option>
                          </select>
                        ) : (
                          <StatusLabel status={inv.status} />
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={`/api/invoices/${inv._id}/pdf`}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Download className="h-3 w-3" />
                            PDF
                          </a>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleting(inv)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                              title="Delete Invoice"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Transaction Ref</th>
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Method & Mode</th>
                  <th className="px-4 py-3 font-medium">Paid Date</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-mono text-slate-900 dark:text-slate-100">
                      {p.transactionRef}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {p.invoiceNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                      {p.clientName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {p.paymentMethod} &middot; {p.gatewayMode.toUpperCase()}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {formatDate(p.paidAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusLabel status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Builder Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Generate Tax Invoice"
        subtitle="Automatic GST / tax calculation with downloadable PDF output"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Select Client *</label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={inputCls}
              >
                <option value="">Choose client...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c.clientId}>
                    {c.clientId} — {c.clientName} ({c.companyName || c.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due Date *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div>
              <label className={labelCls}>Tax Mode</label>
              <select
                value={taxMode}
                onChange={(e) => setTaxMode(e.target.value as 'with_tax' | 'without_tax')}
                className={inputCls}
              >
                <option value="with_tax">With Tax (GST)</option>
                <option value="without_tax">Without Tax</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tax / GST %</label>
              <input
                type="number"
                min={0}
                max={100}
                disabled={taxMode === 'without_tax'}
                value={taxMode === 'with_tax' ? taxPercentage : 0}
                onChange={(e) => setTaxPercentage(Number(e.target.value))}
                className={`${inputCls} font-mono disabled:opacity-50`}
              />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={inputCls}
              >
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Line Items
              </span>
              <button
                type="button"
                onClick={() =>
                  setLineItems([
                    ...lineItems,
                    { description: '', serviceType: 'Domain', quantity: 1, unitPrice: 0 },
                  ])
                }
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                + Add Line Item
              </button>
            </div>

            {lineItems.map((li, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Service description"
                  value={li.description}
                  onChange={(e) => {
                    const copy = [...lineItems];
                    copy[idx].description = e.target.value;
                    setLineItems(copy);
                  }}
                  className={`${inputCls} col-span-6`}
                />
                <input
                  type="text"
                  placeholder="Type"
                  value={li.serviceType}
                  onChange={(e) => {
                    const copy = [...lineItems];
                    copy[idx].serviceType = e.target.value;
                    setLineItems(copy);
                  }}
                  className={`${inputCls} col-span-2`}
                />
                <input
                  type="number"
                  min={1}
                  value={li.quantity}
                  onChange={(e) => {
                    const copy = [...lineItems];
                    copy[idx].quantity = Number(e.target.value);
                    setLineItems(copy);
                  }}
                  className={`${inputCls} col-span-1 font-mono`}
                />
                <input
                  type="number"
                  min={0}
                  value={li.unitPrice}
                  onChange={(e) => {
                    const copy = [...lineItems];
                    copy[idx].unitPrice = Number(e.target.value);
                    setLineItems(copy);
                  }}
                  className={`${inputCls} col-span-2 font-mono`}
                />
                <button
                  type="button"
                  disabled={lineItems.length === 1}
                  onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                  className="col-span-1 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 disabled:opacity-30 dark:border-slate-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Live Calculation Summary */}
          <div className="flex flex-col items-end space-y-1 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
            <div className="flex w-56 justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal:</span>
              <span className="font-mono tabular-nums">{formatMoney(calcSubtotal, currency)}</span>
            </div>
            <div className="flex w-56 justify-between text-slate-600 dark:text-slate-400">
              <span>{taxMode === 'with_tax' ? `Tax (${taxPercentage}%):` : 'Tax (Exempt):'}</span>
              <span className="font-mono tabular-nums">{formatMoney(calcTax, currency)}</span>
            </div>
            <div className="flex w-56 justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:text-slate-100">
              <span>Total Amount:</span>
              <span className="font-mono tabular-nums">{formatMoney(calcTotal, currency)}</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment instructions or GST note"
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Invoice"
        message={`Delete invoice ${deleting?.invoiceNumber}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
