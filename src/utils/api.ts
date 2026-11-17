const TOKEN_KEY = 'hf_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export function formatMoney(amount: number | undefined, currency = 'INR'): string {
  const num = Number(amount || 0);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹';
  return `${symbol}${num.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function toInputDate(value: string | undefined | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function daysRemaining(dateStr: string | undefined | null): number {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.ceil((b - a) / 86400000);
}

export function statusColorClass(status: string): string {
  switch (status) {
    case 'Active':
    case 'Paid':
    case 'Enabled':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'Upcoming Expiry':
    case 'Pending':
    case 'Partial':
      return 'text-amber-700 dark:text-amber-400';
    case 'Expired':
    case 'Overdue':
    case 'Failed':
      return 'text-rose-700 dark:text-rose-400';
    case 'Renewed':
      return 'text-blue-700 dark:text-blue-400';
    default:
      return 'text-slate-500 dark:text-slate-400';
  }
}
