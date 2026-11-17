import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Globe,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Server,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CardsAndBankView } from './components/CardsAndBankView';
import { ClientsView } from './components/ClientsView';
import { DashboardView } from './components/DashboardView';
import { DomainsView } from './components/DomainsView';
import { ExcelManagerView } from './components/ExcelManagerView';
import { HostingView } from './components/HostingView';
import { InvoicesView } from './components/InvoicesView';
import { NotificationsView } from './components/NotificationsView';
import { PaymentGatewaysView } from './components/PaymentGatewaysView';
import { ProvidersView } from './components/ProvidersView';
import { SettingsView } from './components/SettingsView';
import { UserManagementView } from './components/UserManagementView';
import { AppSettings, AuthUser } from './types';
import { apiFetch, setStoredToken } from './utils/api';

type NavKey =
  | 'dashboard'
  | 'clients'
  | 'hosting'
  | 'domains'
  | 'providers'
  | 'gateways'
  | 'banking'
  | 'invoices'
  | 'excel'
  | 'notifications'
  | 'users'
  | 'settings';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openAddClientFlag, setOpenAddClientFlag] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hf_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'Host Finder Infrastructure Pvt. Ltd.',
    companyEmail: 'billing@hostfinder.in',
    companyPhone: '',
    companyAddress: '',
    companyGstNumber: '',
    defaultCurrency: 'INR',
    defaultTaxMode: 'with_tax',
    defaultTaxRate: 18,
    expiryReminderWindows: [30, 15, 7, 1],
    emailAlertsEnabled: true,
    defaultTheme: 'light',
  });

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 3500);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('hf_theme', theme);
  }, [theme]);

  const loadSessionContext = async () => {
    try {
      const me = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(me.user);
      const [sRes, nRes] = await Promise.all([
        apiFetch<{ settings: AppSettings }>('/api/settings'),
        apiFetch<{ items: any[] }>('/api/notifications'),
      ]);
      if (sRes.settings) setSettings(sRes.settings);
      setUnreadNotifications(nRes.items.filter((i) => !i.isRead).length);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    loadSessionContext();
  }, []);

  const handleAuthenticated = async (u: AuthUser) => {
    setUser(u);
    if (!u.mustChangePassword) {
      try {
        const [sRes, nRes] = await Promise.all([
          apiFetch<{ settings: AppSettings }>('/api/settings'),
          apiFetch<{ items: any[] }>('/api/notifications'),
        ]);
        if (sRes.settings) setSettings(sRes.settings);
        setUnreadNotifications(nRes.items.filter((i) => !i.isRead).length);
      } catch {
        // non-blocking
      }
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setActiveNav('dashboard');
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Loading Host Finder...
      </div>
    );
  }

  if (!user || user.mustChangePassword) {
    return (
      <>
        <AuthScreen
          user={user}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onAuthenticated={handleAuthenticated}
          onToast={showToast}
        />
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}
      </>
    );
  }

  const isAdmin = user.role === 'admin';
  const navItems: Array<{
    key: NavKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    hideForViewer?: boolean;
    badge?: number;
  }> = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'clients', label: 'Clients', icon: Users },
    { key: 'hosting', label: 'Hosting', icon: HardDrive },
    { key: 'domains', label: 'Domains', icon: Globe },
    { key: 'providers', label: 'Providers', icon: Building2 },
    { key: 'gateways', label: 'Payment Gateway', icon: CreditCard, adminOnly: true },
    { key: 'banking', label: 'Cards & Bank Details', icon: Shield, adminOnly: true },
    { key: 'invoices', label: 'Invoices', icon: FileText },
    { key: 'excel', label: 'Excel Import/Export', icon: FileSpreadsheet, hideForViewer: true },
    {
      key: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadNotifications,
    },
    { key: 'users', label: 'User Management', icon: Users, adminOnly: true },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const visibleNav = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.hideForViewer && user.role === 'viewer') return false;
    return true;
  });

  const activeTitle =
    visibleNav.find((i) => i.key === activeNav)?.label || 'Dashboard';

  const selectNav = (key: NavKey) => {
    setActiveNav(key);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-150 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
              <Server className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight whitespace-nowrap shrink-0">
              Host Finder
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectNav(item.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <div className="hidden sm:flex items-center gap-2.5 border-l border-slate-200 pl-3 dark:border-slate-800">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                {user.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-right text-xs leading-tight">
                <p className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {user.fullName}
                </p>
                <p className="font-mono text-[11px] uppercase text-slate-500 dark:text-slate-400">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-[1400px]">
            {activeNav === 'dashboard' && (
              <DashboardView
                currency={settings.defaultCurrency}
                isAdmin={isAdmin}
                onNavigate={(t) => selectNav(t as NavKey)}
                onOpenAddClient={() => {
                  setOpenAddClientFlag(true);
                  selectNav('clients');
                }}
              />
            )}
            {activeNav === 'clients' && (
              <ClientsView
                currency={settings.defaultCurrency}
                isAdmin={isAdmin}
                initialAddOpen={openAddClientFlag}
                onClearInitialAdd={() => setOpenAddClientFlag(false)}
                onNavigateExcel={() => selectNav('excel')}
                onToast={showToast}
              />
            )}
            {activeNav === 'hosting' && (
              <HostingView
                user={user}
                currency={settings.defaultCurrency}
                onToast={showToast}
              />
            )}
            {activeNav === 'domains' && (
              <DomainsView
                user={user}
                currency={settings.defaultCurrency}
                onToast={showToast}
              />
            )}
            {activeNav === 'providers' && (
              <ProvidersView user={user} onToast={showToast} />
            )}
            {activeNav === 'gateways' && isAdmin && (
              <PaymentGatewaysView onToast={showToast} />
            )}
            {activeNav === 'banking' && isAdmin && (
              <CardsAndBankView onToast={showToast} />
            )}
            {activeNav === 'invoices' && (
              <InvoicesView
                user={user}
                defaultCurrency={settings.defaultCurrency}
                defaultTaxRate={settings.defaultTaxRate}
                defaultTaxMode={settings.defaultTaxMode}
                onToast={showToast}
              />
            )}
            {activeNav === 'excel' && user.role !== 'viewer' && (
              <ExcelManagerView isAdmin={isAdmin} onToast={showToast} />
            )}
            {activeNav === 'notifications' && (
              <NotificationsView
                canScan={user.role !== 'viewer'}
                onToast={showToast}
                onCountChange={setUnreadNotifications}
              />
            )}
            {activeNav === 'users' && isAdmin && (
              <UserManagementView currentUserId={user.id} onToast={showToast} />
            )}
            {activeNav === 'settings' && (
              <SettingsView
                user={user}
                onUserUpdate={setUser}
                onSettingsUpdate={setSettings}
                onToast={showToast}
              />
            )}
          </div>
        </main>
      </div>

      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function ToastBanner({
  toast,
  onClose,
}: {
  toast: { msg: string; type: 'success' | 'error' };
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
        toast.type === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
          : 'border-slate-200 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900'
      }`}
    >
      <span>{toast.msg}</span>
      <button type="button" onClick={onClose} className="opacity-70 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
