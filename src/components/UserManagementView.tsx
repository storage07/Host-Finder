import React, { useEffect, useState } from 'react';
import { Edit2, Plus, Trash2, Unlock } from 'lucide-react';
import { ActivityLog, Client, ManagedUser, UserRole } from '../types';
import { apiFetch, formatDate } from '../utils/api';
import {
  ConfirmDialog,
  InlineStatusSelect,
  inputCls,
  labelCls,
  Modal,
  TableSkeleton,
} from './UI';

const USER_STATE_OPTIONS = ['Active', 'Disabled'] as const;

export function UserManagementView({
  currentUserId,
  onToast,
}: {
  currentUserId: string;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [tab, setTab] = useState<'users' | 'logs'>('users');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([]);
  const [canUpdateAssignedServices, setCanUpdateAssignedServices] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [uRes, cRes, lRes] = await Promise.all([
        apiFetch<{ items: ManagedUser[] }>('/api/users'),
        apiFetch<{ items: Client[] }>('/api/clients'),
        apiFetch<{ items: ActivityLog[] }>('/api/activity-logs'),
      ]);
      setUsers(uRes.items);
      setClients(cRes.items);
      setLogs(lRes.items);
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setUsername('');
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('staff');
    setAssignedClientIds([]);
    setCanUpdateAssignedServices(true);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setUsername(u.username);
    setFullName(u.fullName);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setAssignedClientIds(u.assignedClientIds || []);
    setCanUpdateAssignedServices(u.canUpdateAssignedServices);
    setIsActive(u.isActive);
    setModalOpen(true);
  };

  const toggleClientAssign = (cid: string) => {
    setAssignedClientIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await apiFetch(`/api/users/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName,
            role,
            assignedClientIds,
            canUpdateAssignedServices,
            isActive,
            newPassword: password || undefined,
          }),
        });
        onToast(`Updated user ${editing.username}`, 'success');
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username,
            fullName,
            email,
            password,
            role,
            assignedClientIds,
            canUpdateAssignedServices,
            mustChangePassword: true,
          }),
        });
        onToast(`Created user ${username}`, 'success');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (u: ManagedUser) => {
    try {
      await apiFetch(`/api/users/${u._id}/unlock`, { method: 'POST' });
      onToast(`Unlocked account ${u.username}`, 'success');
      await loadAll();
    } catch (err) {
      onToast((err as Error).message, 'error');
    }
  };

  const handleToggleUserStatus = async (u: ManagedUser, next: 'Active' | 'Disabled') => {
    setUpdatingStatusId(u._id);
    try {
      const nextActive = next === 'Active';
      await apiFetch(`/api/users/${u._id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: nextActive }),
      });
      setUsers((prev) =>
        prev.map((item) => (item._id === u._id ? { ...item, isActive: nextActive } : item))
      );
      onToast(`${u.username} set to ${next}`, 'success');
    } catch (err) {
      onToast((err as Error).message, 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/users/${deleting._id}`, { method: 'DELETE' });
      onToast(`Deleted user ${deleting.username}`, 'success');
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
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'users'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Users & Roles ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('logs')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'logs'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Admin Activity Logs ({logs.length})
          </button>
        </div>

        {tab === 'users' && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add User
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : tab === 'users' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Scope / Permissions</th>
                  <th className="px-4 py-3 font-medium">2FA</th>
                  <th className="px-4 py-3 font-medium">Account State</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {users.map((u) => {
                  const isLocked = Boolean(
                    u.lockUntil && new Date(u.lockUntil).getTime() > Date.now()
                  );
                  return (
                    <tr key={u._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {u.fullName}{' '}
                          <span className="font-mono font-normal text-slate-500">
                            (@{u.username})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold uppercase text-slate-700 dark:text-slate-200">
                        {u.role}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {u.role === 'admin'
                          ? 'Full unrestricted access'
                          : u.role === 'staff'
                          ? `${u.assignedClientIds.length} assigned client(s)`
                          : 'Read-only (credentials redacted)'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                        {u.twoFactorEnabled ? 'Enabled' : 'Off'}
                      </td>
                      <td className="px-4 py-3">
                        {isLocked ? (
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            Locked ({u.failedLoginAttempts} fails)
                          </span>
                        ) : u._id !== currentUserId ? (
                          <InlineStatusSelect
                            ariaLabel={`Account state for ${u.username}`}
                            value={u.isActive ? 'Active' : 'Disabled'}
                            options={USER_STATE_OPTIONS}
                            disabled={updatingStatusId === u._id}
                            onChange={(next) => handleToggleUserStatus(u, next)}
                          />
                        ) : (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {isLocked && (
                            <button
                              type="button"
                              onClick={() => handleUnlock(u)}
                              className="rounded p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                              title="Unlock Account"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                            title="Edit User"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {u._id !== currentUserId && (
                            <button
                              type="button"
                              onClick={() => setDeleting(u)}
                              className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                              title="Delete User"
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
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-2.5 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-900 dark:text-slate-100">
                      {log.username} ({log.role})
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300">
                      {log.resource}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">
                      {log.details}
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
        title={editing ? `Edit User: ${editing.username}` : 'Create Role-Based User'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!editing && (
              <div>
                <label className={labelCls}>Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputCls}
              />
            </div>
            {!editing && (
              <div>
                <label className={labelCls}>Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>
                {editing ? 'Reset Password (optional)' : 'Initial Password *'}
              </label>
              <input
                type="password"
                required={!editing}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className={inputCls}
              >
                <option value="admin">Admin (Full Access)</option>
                <option value="staff">Staff (Assigned Clients)</option>
                <option value="viewer">Viewer (Read-Only)</option>
              </select>
            </div>
            {editing && (
              <div className="flex items-center gap-2 pt-6">
                <input
                  id="user-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <label htmlFor="user-active" className="text-xs font-medium">
                  Account Active
                </label>
              </div>
            )}
          </div>

          {role === 'staff' && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Assign Clients to Staff Member
                </span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={canUpdateAssignedServices}
                    onChange={(e) => setCanUpdateAssignedServices(e.target.checked)}
                  />
                  Allow updating assigned services
                </label>
              </div>
              <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto pt-2 sm:grid-cols-2">
                {clients.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={assignedClientIds.includes(c.clientId)}
                      onChange={() => toggleClientAssign(c.clientId)}
                    />
                    <span className="font-mono text-slate-500">{c.clientId}</span>
                    <span className="truncate">{c.clientName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
              {busy ? 'Saving...' : editing ? 'Save User' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete User"
        message={`Permanently delete user ${deleting?.username}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  );
}
