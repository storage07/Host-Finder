import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, HardDrive, Search, Users, X } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { StatusLabel } from './UI';

export type SearchTargetSection = 'clients' | 'hosting' | 'domains';

interface SearchClientMatch {
  _id: string;
  clientId: string;
  clientName: string;
  companyName: string;
  email: string;
  accountStatus: string;
}

interface SearchHostingMatch {
  _id: string;
  clientId: string;
  clientName: string;
  domainName: string;
  hostingProvider: string;
  hostingPlan: string;
  serverName: string;
  serverIp: string;
  accountStatus: string;
}

interface SearchDomainMatch {
  _id: string;
  clientId: string;
  clientName: string;
  domainName: string;
  domainRegistrar: string;
  accountStatus: string;
}

interface SearchResponse {
  query: string;
  clients: SearchClientMatch[];
  hosting: SearchHostingMatch[];
  domains: SearchDomainMatch[];
}

interface FlatOption {
  section: SearchTargetSection;
  filterTerm: string;
  key: string;
}

export function GlobalSearchBar({
  onSelectResult,
}: {
  onSelectResult: (section: SearchTargetSection, filterTerm: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SearchResponse>({
    query: '',
    clients: [],
    hosting: [],
    domains: [],
  });
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K focuses search bar
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Dismiss dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Debounced server-side search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ query: '', clients: [], hosting: [], domains: [] });
      setLoading(false);
      setError('');
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled) {
          setResults(data);
          setActiveIndex(-1);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Search failed');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const flatOptions = useMemo<FlatOption[]>(() => {
    const list: FlatOption[] = [];
    for (const c of results.clients) {
      list.push({
        section: 'clients',
        filterTerm: c.clientId || c.clientName,
        key: `client:${c._id}`,
      });
    }
    for (const h of results.hosting) {
      list.push({
        section: 'hosting',
        filterTerm: h.domainName || h.clientId,
        key: `hosting:${h._id}`,
      });
    }
    for (const d of results.domains) {
      list.push({
        section: 'domains',
        filterTerm: d.domainName || d.clientId,
        key: `domain:${d._id}`,
      });
    }
    return list;
  }, [results]);

  const totalMatches = flatOptions.length;

  const chooseOption = (opt: FlatOption) => {
    setOpen(false);
    setQuery('');
    onSelectResult(opt.section, opt.filterTerm);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || totalMatches === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % totalMatches);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? totalMatches - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = activeIndex >= 0 ? flatOptions[activeIndex] : flatOptions[0];
      if (target) chooseOption(target);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  let runningIndex = -1;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search clients, domains, hosting by name or ID..."
          aria-label="Global search for clients, domains, and hosting services"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-14 text-xs text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-900"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear global search"
            className="absolute right-2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2.5 hidden sm:inline-block font-mono text-[10px] text-slate-400">
            ⌘K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              Searching clients, domains, and hosting...
            </div>
          ) : error ? (
            <div className="px-4 py-4 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : totalMatches === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              No clients, domains, or hosting services matched &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.clients.length > 0 && (
                <div className="py-1.5">
                  <div className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <Users className="h-3 w-3" />
                    <span>Clients</span>
                  </div>
                  {results.clients.map((c) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() =>
                          chooseOption({
                            section: 'clients',
                            filterTerm: c.clientId || c.clientName,
                            key: `client:${c._id}`,
                          })
                        }
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                              {c.clientId}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {c.clientName}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {c.companyName ? `${c.companyName} · ${c.email}` : c.email}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StatusLabel status={c.accountStatus} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {results.hosting.length > 0 && (
                <div className="py-1.5">
                  <div className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <HardDrive className="h-3 w-3" />
                    <span>Hosting Services</span>
                  </div>
                  {results.hosting.map((h) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={h._id}
                        type="button"
                        onClick={() =>
                          chooseOption({
                            section: 'hosting',
                            filterTerm: h.domainName || h.clientId,
                            key: `hosting:${h._id}`,
                          })
                        }
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {h.domainName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {h.hostingProvider} &middot; {h.hostingPlan}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{h.clientId}</span> &middot; {h.clientName}
                            {h.serverIp ? ` · ${h.serverIp}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StatusLabel status={h.accountStatus} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {results.domains.length > 0 && (
                <div className="py-1.5">
                  <div className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <Globe className="h-3 w-3" />
                    <span>Domains</span>
                  </div>
                  {results.domains.map((d) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() =>
                          chooseOption({
                            section: 'domains',
                            filterTerm: d.domainName || d.clientId,
                            key: `domain:${d._id}`,
                          })
                        }
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {d.domainName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {d.domainRegistrar}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{d.clientId}</span> &middot; {d.clientName}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <StatusLabel status={d.accountStatus} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
