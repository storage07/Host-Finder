import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';
import { Client } from '../types';
import { apiFetch } from '../utils/api';
import { inputCls, labelCls } from './UI';

export function ExcelManagerView({
  isAdmin,
  onToast,
}: {
  isAdmin: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [preview, setPreview] = useState<{
    validRows: any[];
    duplicateRows: any[];
    invalidRows: any[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Export filters
  const [exportType, setExportType] = useState('clients');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [clientId, setClientId] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    apiFetch<{ items: Client[] }>('/api/clients')
      .then((res) => setClients(res.items))
      .catch(() => {});
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch<{
        validRows: any[];
        duplicateRows: any[];
        invalidRows: any[];
      }>('/api/excel/import/preview', {
        method: 'POST',
        body: fd,
      });
      setPreview(res);
      onToast(
        `Parsed ${res.validRows.length} valid, ${res.duplicateRows.length} duplicate, ${res.invalidRows.length} invalid rows`,
        'success'
      );
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.validRows.length === 0) return;
    setConfirming(true);
    try {
      const res = await apiFetch<{ importedCount: number }>('/api/excel/import/confirm', {
        method: 'POST',
        body: JSON.stringify({ rows: preview.validRows }),
      });
      onToast(`Successfully imported ${res.importedCount} client records`, 'success');
      setPreview(null);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setConfirming(false);
    }
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams({ type: exportType });
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (clientId) params.set('clientId', clientId);
    if (provider) params.set('provider', provider);
    if (status) params.set('status', status);
    return `/api/excel/export?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* IMPORT PANEL */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Import Clients from Excel
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload an .xlsx workbook. Records are validated for schema errors and duplicate emails before import.
              </p>
            </div>
            <a
              href="/api/excel/template"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Sample Template
            </a>
          </div>

          {!isAdmin ? (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
              Only administrators can bulk-import client records.
            </div>
          ) : (
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center transition-colors hover:border-blue-500 dark:border-slate-700 dark:bg-slate-950/40">
              <FileSpreadsheet className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <span className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {uploading ? 'Validating spreadsheet...' : 'Click to upload .xlsx file'}
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Maximum 5 MB &middot; .xlsx format
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* EXPORT PANEL */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Filtered Excel Export
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Export filtered workbooks for clients, hosting, domains, expiries, or payments.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Export Dataset</label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value)}
                className={inputCls}
              >
                <option value="clients">All Clients</option>
                <option value="hosting">Hosting Details</option>
                <option value="domains">Domain Details</option>
                <option value="upcoming">Upcoming Expiry Records</option>
                <option value="expired">Expired Records</option>
                <option value="payments">Payment & Invoice Details</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Filter by Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={inputCls}
              >
                <option value="">All Clients</option>
                {clients.map((c) => (
                  <option key={c._id} value={c.clientId}>
                    {c.clientId} — {c.clientName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Filter by Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputCls}
              >
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Upcoming Expiry">Upcoming Expiry</option>
                <option value="Expired">Expired</option>
                <option value="Renewed">Renewed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Paid">Paid (Invoices)</option>
                <option value="Pending">Pending (Invoices)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Provider Keyword</label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g., AWS, Hostinger, GoDaddy"
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <a
              href={buildExportUrl()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Download .xlsx Workbook
            </a>
          </div>
        </div>
      </div>

      {/* VALIDATION PREVIEW */}
      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-5 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Valid: {preview.validRows.length}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Duplicates Skipped: {preview.duplicateRows.length}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400">
                <XCircle className="h-4 w-4" />
                Invalid Rows: {preview.invalidRows.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={confirming || preview.validRows.length === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {confirming
                  ? 'Importing...'
                  : `Confirm Import (${preview.validRows.length} rows)`}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Client Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Mobile</th>
                  <th className="px-3 py-2 font-medium">Validation Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.validRows.map((r) => (
                  <tr key={`v-${r.rowNumber}`}>
                    <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-400">
                      Ready
                    </td>
                    <td className="px-3 py-2">{r.clientName}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2 font-mono">{r.mobile}</td>
                    <td className="px-3 py-2 text-slate-500">Valid record</td>
                  </tr>
                ))}
                {preview.duplicateRows.map((r) => (
                  <tr key={`d-${r.rowNumber}`} className="bg-amber-50/40 dark:bg-amber-950/10">
                    <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-semibold text-amber-700 dark:text-amber-400">
                      Duplicate
                    </td>
                    <td className="px-3 py-2">{r.clientName}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2 font-mono">{r.mobile}</td>
                    <td className="px-3 py-2 text-amber-700 dark:text-amber-400">{r.reason}</td>
                  </tr>
                ))}
                {preview.invalidRows.map((r) => (
                  <tr key={`i-${r.rowNumber}`} className="bg-rose-50/40 dark:bg-rose-950/10">
                    <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-semibold text-rose-700 dark:text-rose-400">
                      Invalid
                    </td>
                    <td className="px-3 py-2">{r.clientName || '—'}</td>
                    <td className="px-3 py-2">{r.email || '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.mobile || '—'}</td>
                    <td className="px-3 py-2 text-rose-700 dark:text-rose-400">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
