import React, { useEffect, useRef, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import {
  Bell,
  Building2,
  ChevronDown,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Loader2,
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
import { auth } from './lib/firebase.ts';
import { AuthScreen } from './components/AuthScreen';
import { CardsAndBankView } from './components/CardsAndBankView';
import { ClientsView } from './components/ClientsView';
import { DashboardView } from './components/DashboardView';
import { DomainsView } from './components/DomainsView';
import { ExcelManagerView } from './components/ExcelManagerView';
import { GlobalSearchBar, SearchTargetSection } from './components/GlobalSearchBar';
import { HostingView } from './components/HostingView';
import { InvoicesView } from './components/InvoicesView';
import { NotificationsView } from './components/NotificationsView';
import { PaymentGatewaysView } from './components/PaymentGatewaysView';
import { ProvidersView } from './components/ProvidersView';
import { SettingsView } from './components/SettingsView';
import { UserManagementView } from './components/UserManagementView';
import { AppSettings, AuthUser } from './types';
import { apiFetch, clearAllAuthTokens, setMemoryAuthToken } from './utils/api';

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
  const [searchPrefill, setSearchPrefill] = useState<{
    section: SearchTargetSection;
    term: string;
  } | null>(null);
  const [statusPrefill, setStatusPrefill] = useState<{
    section: NavKey;
    status: string;
  } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [justSignedOut, setJustSignedOut] = useState(false);
  const loggingOutRef = useRef(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

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
      if (me.user.role !== 'admin') {
        clearAllAuthTokens();
        await signOut(auth).catch(() => {});
        setUser(null);
        return;
      }
      setUser(me.user);
      const [sRes, nRes] = await Promise.all([
        apiFetch<{ settings: AppSettings }>('/api/settings'),
        apiFetch<{ items: any[] }>('/api/notifications'),
      ]);
      if (sRes.settings) setSettings(sRes.settings);
      setUnreadNotifications(nRes.items.filter((i) => !i.isRead).length);
    } catch {
      clearAllAuthTokens();
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
        if (!signingOut) setConfirmLogoutOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [signingOut]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (loggingOutRef.current) return;
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setMemoryAuthToken(idToken);
        } catch {
          setMemoryAuthToken(null);
        }
      } else {
        setMemoryAuthToken(null);
      }
      await loadSessionContext();
    });
    return () => unsubscribe();
  }, []);

  const handleAuthenticated = async (u: AuthUser) => {
    setJustSignedOut(false);
    setUser(u);
    if (!u.mustChangePassword) {
      showToast(`Welcome back, ${u.fullName}`, 'success');
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
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setSigningOut(true);
    try {
      // 1. Notify backend FIRST while token/cookie is still active so LOGOUT audit entry is recorded and cookie is cleared
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // continue client cleanup even if network call fails
      }
      // 2. Clear all client-side tokens (memory, localStorage, sessionStorage) before Firebase signOut
      clearAllAuthTokens();
      // 3. Sign out of Firebase Auth (guarded by loggingOutRef so onIdTokenChanged does not re-fetch /api/auth/me)
      try {
        await signOut(auth);
      } catch {
        // ignore if not signed in with Firebase
      }
      // 4. Reset application session state cleanly
      setUser(null);
      setActiveNav('dashboard');
      setSearchPrefill(null);
      setStatusPrefill(null);
      setUnreadNotifications(0);
      setMobileMenuOpen(false);
      setAccountMenuOpen(false);
      setConfirmLogoutOpen(false);
      setJustSignedOut(true);
      showToast('You have been signed out', 'success');
    } finally {
      setSigningOut(false);
      loggingOutRef.current = false;
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Server className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          <span>Restoring Host Finder session...</span>
        </div>
      </div>
    );
  }

  if (!user || user.mustChangePassword) {
    return (
      <>
        <AuthScreen
          user={user}
          theme={theme}
          justSignedOut={justSignedOut}
          onDismissSignedOut={() => setJustSignedOut(false)}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onAuthenticated={handleAuthenticated}
          onLogout={handleLogout}
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
          <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {user.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                {user.fullName}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setConfirmLogoutOpen(true);
            }}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-950/30 whitespace-nowrap"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0" />
            )}
            <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
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

          <GlobalSearchBar
            onSelectResult={(section, term) => {
              setSearchPrefill({ section, term });
              selectNav(section);
            }}
          />

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
            <div
              ref={accountMenuRef}
              className="relative border-l border-slate-200 pl-3 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                  {user.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden text-left text-xs leading-tight sm:block">
                  <p className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {user.fullName}
                  </p>
                  <p className="font-mono text-[11px] uppercase text-slate-500 dark:text-slate-400">
                    {user.role}
                  </p>
                </div>
                <ChevronDown
                  className={`hidden h-3.5 w-3.5 text-slate-400 transition-transform sm:block ${
                    accountMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {user.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono uppercase">{user.role}</span>
                      <span
                        className={
                          user.twoFactorEnabled
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400'
                        }
                      >
                        {user.twoFactorEnabled ? '2FA Enabled' : '2FA Off'}
                      </span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        selectNav('settings');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                      <span>Account &amp; Security</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTheme(theme === 'dark' ? 'light' : 'dark');
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <Moon className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span>
                        Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
                      </span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setConfirmLogoutOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-[1400px]">
            {activeNav === 'dashboard' && (
              <DashboardView
                currency={settings.defaultCurrency}
                isAdmin={isAdmin}
                canExportExcel={user.role !== 'viewer'}
                onNavigate={(t, statusFilter) => {
                  const target = t as NavKey;
                  if (statusFilter) {
                    setStatusPrefill({ section: target, status: statusFilter });
                  } else {
                    setStatusPrefill(null);
                  }
                  selectNav(target);
                }}
                onOpenAddClient={() => {
                  setOpenAddClientFlag(true);
                  selectNav('clients');
                }}
                onToast={showToast}
              />
            )}
            {activeNav === 'clients' && (
              <ClientsView
                currency={settings.defaultCurrency}
                isAdmin={isAdmin}
                canExportExcel={user.role !== 'viewer'}
                initialAddOpen={openAddClientFlag}
                onClearInitialAdd={() => setOpenAddClientFlag(false)}
                initialSearch={
                  searchPrefill?.section === 'clients' ? searchPrefill.term : undefined
                }
                onClearInitialSearch={() => setSearchPrefill(null)}
                initialStatus={
                  statusPrefill?.section === 'clients' ? statusPrefill.status : undefined
                }
                onClearInitialStatus={() => setStatusPrefill(null)}
                onNavigateExcel={() => selectNav('excel')}
                onToast={showToast}
              />
            )}
            {activeNav === 'hosting' && (
              <HostingView
                user={user}
                currency={settings.defaultCurrency}
                initialSearch={
                  searchPrefill?.section === 'hosting' ? searchPrefill.term : undefined
                }
                onClearInitialSearch={() => setSearchPrefill(null)}
                initialStatus={
                  statusPrefill?.section === 'hosting' ? statusPrefill.status : undefined
                }
                onClearInitialStatus={() => setStatusPrefill(null)}
                onToast={showToast}
              />
            )}
            {activeNav === 'domains' && (
              <DomainsView
                user={user}
                currency={settings.defaultCurrency}
                initialSearch={
                  searchPrefill?.section === 'domains' ? searchPrefill.term : undefined
                }
                onClearInitialSearch={() => setSearchPrefill(null)}
                initialStatus={
                  statusPrefill?.section === 'domains' ? statusPrefill.status : undefined
                }
                onClearInitialStatus={() => setStatusPrefill(null)}
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
                initialStatus={
                  statusPrefill?.section === 'invoices' ? statusPrefill.status : undefined
                }
                onClearInitialStatus={() => setStatusPrefill(null)}
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

      {confirmLogoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]"
          onClick={() => {
            if (!signingOut) setConfirmLogoutOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <LogOut className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sign out of Host Finder?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Signed in as{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {user.fullName}
                  </span>{' '}
                  ({user.email}). Your active session token and cookie will be cleared.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => setConfirmLogoutOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {signingOut ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Signing out...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
