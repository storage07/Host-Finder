import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { NotificationItem } from '../types';
import { apiFetch, formatDate } from '../utils/api';
import { EmptyState, TableSkeleton } from './UI';

export function NotificationsView({
  canScan,
  onToast,
  onCountChange,
}: {
  canScan: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  onCountChange?: (unread: number) => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [scanning, setScanning] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: NotificationItem[] }>('/api/notifications');
      setItems(res.items);
      onCountChange?.(res.items.filter((i) => !i.isRead).length);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markRead = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      onToast('Notification marked as read', 'success');
      await loadNotifications();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      onToast('All notifications marked as read', 'success');
      await loadNotifications();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch<{
        checkedHosting: number;
        checkedDomains: number;
        newNotifications: number;
      }>('/api/notifications/scan', { method: 'POST' });
      onToast(
        `Scanned ${res.checkedHosting} hosting & ${res.checkedDomains} domains (${res.newNotifications} new reminders)`,
        'success'
      );
      await loadNotifications();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const visible = filter === 'unread' ? items.filter((i) => !i.isRead) : items;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            All Reminders ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              filter === 'unread'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Unread ({items.filter((i) => !i.isRead).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll || items.every((i) => i.isRead)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {markingAll ? 'Updating...' : 'Mark All Read'}
          </button>
          {canScan && (
            <button
              type="button"
              disabled={scanning}
              onClick={runScan}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Run Expiry Check (30/15/7/1d)'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No expiry notifications"
          description="Automated reminders fire 30, 15, 7, and 1 day before hosting or domain expiration."
        />
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {visible.map((n) => (
            <div
              key={n._id}
              className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${
                !n.isRead ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <Bell
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    n.severity === 'critical'
                      ? 'text-rose-600 dark:text-rose-400'
                      : n.severity === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {n.title}
                    </span>
                    <span className="text-slate-400">&middot;</span>
                    <span className="font-mono text-[11px] uppercase text-slate-500">
                      Window: {n.triggerWindow}
                    </span>
                    <span className="text-slate-400">&middot;</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {n.message}
                  </p>
                </div>
              </div>

              {!n.isRead && (
                <button
                  type="button"
                  disabled={busyId === n._id}
                  onClick={() => markRead(n._id)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {busyId === n._id ? 'Saving...' : 'Mark Read'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
