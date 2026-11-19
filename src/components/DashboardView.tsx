import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Client, NotificationItem } from '../types';
import {
  apiFetch,
  formatDate,
  formatMoney,
} from '../utils/api';
import { InlineStatusSelect, StatusLabel, TableSkeleton } from './UI';

const ACCOUNT_STATUS_OPTIONS = [
  'Active',
  'Upcoming Expiry',
  'Expired',
  'Renewed',
  'Cancelled',
] as const;

const PAYMENT_STATUS_OPTIONS = ['Paid', 'Pending', 'Overdue', 'Partial'] as const;

interface DashboardSummary {
  metrics: {
    totalClients: number;
    totalHosting: number;
    totalDomains: number;
    activeServices: number;
    upcomingExpiry: number;
    expiredServices: number;
    totalRevenue: number;
    pendingPayments: number;
  };
  upcomingList: any[];
  expiredList: any[];
  recentNotifications: NotificationItem[];
}

export function DashboardView({
  currency,
  isAdmin,
  onNavigate,
  onToast,
}: {
  currency: string;
  isAdmin: boolean;
  canExportExcel?: boolean;
  onNavigate: (tab: string, statusFilter?: string) => void;
  onOpenAddClient?: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiryTab, setExpiryTab] = useState<'upcoming' | 'expired'>('upcoming');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sumRes, cliRes] = await Promise.all([
        apiFetch<DashboardSummary>('/api/dashboard/summary'),
        apiFetch<{ items: Client[] }>('/api/clients'),
      ]);
      setSummary(sumRes);
      setClients(cliRes.items);
    } catch (err) {
      onToast((err as Error).message || 'Failed to load dashboard data', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleWatchlistStatusChange = async (
    row: any,
    nextStatus: (typeof ACCOUNT_STATUS_OPTIONS)[number]
  ) => {
    const key = `${row.serviceCategory}-${row._id}`;
    setUpdatingKey(key);
    try {
      const endpoint =
        row.serviceCategory === 'Hosting'
          ? `/api/hosting/${row._id}/status`
          : `/api/domains/${row._id}/status`;
      await apiFetch(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      onToast(`${row.domainName} marked as ${nextStatus}`, 'success');
      await loadData(true);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleClientStatusChange = async (
    client: Client,
    patch: { accountStatus?: Client['accountStatus']; paymentStatus?: Client['paymentStatus'] }
  ) => {
    const key = `client-${client._id}-${patch.accountStatus ? 'acc' : 'pay'}`;
    setUpdatingKey(key);
    try {
      await apiFetch(`/api/clients/${client._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onToast(
        `${client.clientId} updated to ${patch.accountStatus || patch.paymentStatus}`,
        'success'
      );
      await loadData(true);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setUpdatingKey(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading || !summary) {
    return <TableSkeleton rows={6} />;
  }

  const m = summary.metrics;
  const kpis: Array<{
    label: string;
    value: string;
    target: string;
    statusFilter?: string;
    color?: string;
  }> = [
    { label: 'Total Clients', value: String(m.totalClients), target: 'clients' },
    { label: 'Total Hosting Services', value: String(m.totalHosting), target: 'hosting' },
    { label: 'Total Domains', value: String(m.totalDomains), target: 'domains' },
    {
      label: 'Active Services',
      value: String(m.activeServices),
      target: 'hosting',
      statusFilter: 'Active',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Upcoming Expiry',
      value: String(m.upcomingExpiry),
      target: 'hosting',
      statusFilter: 'Upcoming Expiry',
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Expired Services',
      value: String(m.expiredServices),
      target: 'hosting',
      statusFilter: 'Expired',
      color: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Total Revenue',
      value: formatMoney(m.totalRevenue, currency),
      target: 'invoices',
      statusFilter: 'Paid',
    },
    {
      label: 'Pending Payments',
      value: formatMoney(m.pendingPayments, currency),
      target: 'invoices',
      statusFilter: 'Pending',
      color: 'text-amber-600 dark:text-amber-400',
    },
  ];

  const activeExpiryRows =
    expiryTab === 'upcoming' ? summary.upcomingList : summary.expiredList;

  return (
    <div className="space-y-6">
      {/* 8 KPI Cards (Single-Elevation Grid) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.target, kpi.statusFilter)}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {kpi.label}
            </p>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight ${
                kpi.color || 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {kpi.value}
            </p>
          </button>
        ))}
      </div>

      {/* Split Panel: Upcoming/Expired Services + Notifications */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Service Renewal & Expiry Watchlist
            </h2>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setExpiryTab('upcoming')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  expiryTab === 'upcoming'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Upcoming Expiry ({summary.upcomingList.length})
              </button>
              <button
                type="button"
                onClick={() => setExpiryTab('expired')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  expiryTab === 'expired'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Expired ({summary.expiredList.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Domain / Service</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Expiry Date</th>
                  <th className="px-4 py-3 font-medium text-right">Renewal</th>
                  <th className="px-5 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {activeExpiryRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      No {expiryTab === 'upcoming' ? 'upcoming expiry' : 'expired'} services found.
                    </td>
                  </tr>
                ) : (
                  activeExpiryRows.map((row) => (
                    <tr
                      key={`${row.serviceCategory}-${row._id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                        {row.serviceCategory}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-900 dark:text-slate-100">
                        {row.domainName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {row.clientName || row.clientId}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatDate(row.expiryDate)}{' '}
                        <span className="text-slate-400">
                          ({row.daysRemaining < 0 ? `${Math.abs(row.daysRemaining)}d ago` : `${row.daysRemaining}d`})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatMoney(row.amount, currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {isAdmin ? (
                          <InlineStatusSelect
                            ariaLabel={`Status for ${row.domainName}`}
                            value={row.accountStatus}
                            options={ACCOUNT_STATUS_OPTIONS}
                            disabled={updatingKey === `${row.serviceCategory}-${row._id}`}
                            onChange={(next) => handleWatchlistStatusChange(row, next)}
                          />
                        ) : (
                          <StatusLabel status={row.accountStatus} />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notifications & Reminders */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Reminders & Alerts
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {summary.recentNotifications.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                No active expiry notifications.
              </p>
            ) : (
              summary.recentNotifications.slice(0, 6).map((n) => (
                <div key={n._id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {n.title}
                    </p>
                    <span
                      className={`font-mono text-[11px] font-medium shrink-0 ${
                        n.severity === 'critical'
                          ? 'text-rose-600 dark:text-rose-400'
                          : n.severity === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {n.triggerWindow}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {n.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Client Directory Snapshot */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Client Records ({clients.length})
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('clients')}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Manage Clients
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-3 font-medium">Client ID</th>
                <th className="px-4 py-3 font-medium">Client / Company</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">End Date</th>
                <th className="px-4 py-3 font-medium text-right">Renewal Price</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium text-right">Service Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {clients.slice(0, 8).map((c) => (
                <tr key={c._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                    {c.clientId}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {c.clientName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {c.companyName || c.email}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {c.serviceProvider || '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {formatDate(c.endDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(c.renewalPrice, currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <InlineStatusSelect
                        ariaLabel={`Payment status for ${c.clientId}`}
                        value={c.paymentStatus}
                        options={PAYMENT_STATUS_OPTIONS}
                        disabled={updatingKey === `client-${c._id}-pay`}
                        onChange={(next) =>
                          handleClientStatusChange(c, { paymentStatus: next })
                        }
                      />
                    ) : (
                      <StatusLabel status={c.paymentStatus} />
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {isAdmin ? (
                      <InlineStatusSelect
                        ariaLabel={`Account status for ${c.clientId}`}
                        value={c.accountStatus}
                        options={ACCOUNT_STATUS_OPTIONS}
                        disabled={updatingKey === `client-${c._id}-acc`}
                        onChange={(next) =>
                          handleClientStatusChange(c, { accountStatus: next })
                        }
                      />
                    ) : (
                      <StatusLabel status={c.accountStatus} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
