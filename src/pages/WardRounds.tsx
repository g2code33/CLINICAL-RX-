import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import { WardQuickCapture } from '../components/WardQuickCapture';
import { WardEntryCard } from '../components/WardEntryCard';
import { WARD_ENTRY_META, WARD_FOCUS_PRESETS, WARD_PRESETS, todayIso } from '../services/defaults';
import {
  ENTRY_TYPES,
  activeRound,
  analysisFor,
  countsFor,
  countsSummary,
  deleteRound,
  duplicateRound,
  finishRound,
  renameRound,
  reopenRound,
  roundToMarkdown,
  searchWardRounds,
  setArchived,
  startRound,
} from '../services/wardRounds';
import { activityForDay, activityForWeek, monthBounds, activityBetween } from '../services/wardRounds';
import { EXPLAIN_MODES, analyzeRound, canRunAi, openRoundAi, navigateToRoundAi, queueAnalysis, type ExplainMode } from '../services/wardAi';
import { bundleFromWardEntries, bundleFromWardRounds } from '../services/bundler';
import { downloadText } from '../services/export';
import { privacyWarning, scanForPhi } from '../services/privacy';
import type { WardEntryType, WardRound } from '../types';
import { confirmAction } from '../components/ui/globalConfirm';

type View = 'home' | 'active' | 'history';

function prettyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function WardRounds() {
  // Subscribing to these slices keeps the whole page live as records change.
  const rounds = useData((s) => s.wardRounds);
  const entries = useData((s) => s.wardEntries);
  const analyses = useData((s) => s.wardAnalyses);
  const profile = useData((s) => s.profile);
  const days = useData((s) => s.days);

  const [params, setParams] = useSearchParams();
  const openId = params.get('round');

  const [view, setView] = useState<View>('home');
  const [startOpen, setStartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const current = openId ? rounds.find((r) => r.id === openId) ?? null : null;
  const live = activeRound();

  // Deep-link ?round=<id> opens that round's workspace.
  useEffect(() => {
    if (current) setView('active');
  }, [current?.id]);

  const visible = useMemo(
    () => [...rounds].filter((r) => !r.archived).sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1)),
    [rounds]
  );

  function openRound(id: string) {
    setParams({ round: id });
    setView('active');
  }

  function closeRound() {
    params.delete('round');
    setParams(params, { replace: true });
    setView('home');
  }

  const todayDay = days.find((d) => d.date === todayIso());

  return (
    <div>
      <PageHeader
        title="🏥 Ward Rounds"
        subtitle={`${prettyDate(todayIso())}${todayDay ? ` · Clinical Day ${todayDay.dayNumber}` : ''} · ${
          online ? 'Online' : 'Offline — everything still saves locally'
        }`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                online
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
            {view !== 'home' && (
              <button className="btn-secondary" onClick={closeRound}>
                ← Ward Rounds
              </button>
            )}
          </div>
        }
      />

      {view === 'active' && current ? (
        <ActiveRound round={current} onClose={closeRound} onDeleted={closeRound} />
      ) : view === 'history' ? (
        <History rounds={rounds} onOpen={openRound} onBack={() => setView('home')} />
      ) : (
        <Home
          rounds={visible}
          live={live}
          entriesCount={entries.length}
          analysesCount={analyses.length}
          onStart={() => setStartOpen(true)}
          onOpen={openRound}
          onHistory={() => setView('history')}
          onSearch={() => setSearchOpen(true)}
          onBundle={() => setBundleOpen(true)}
        />
      )}

      <StartRoundModal
        open={startOpen}
        defaultWard={profile?.site ?? ''}
        onClose={() => setStartOpen(false)}
        onStarted={(r) => {
          setStartOpen(false);
          openRound(r.id);
        }}
      />
      <SearchModalWard open={searchOpen} onClose={() => setSearchOpen(false)} onOpen={openRound} />
      <BundleFromRoundsModal open={bundleOpen} rounds={visible} onClose={() => setBundleOpen(false)} />
    </div>
  );
}

// ============================ HOME ============================

function Home({
  rounds,
  live,
  onStart,
  onOpen,
  onHistory,
  onSearch,
  onBundle,
}: {
  rounds: WardRound[];
  live: WardRound | null;
  entriesCount: number;
  analysesCount: number;
  onStart: () => void;
  onOpen: (id: string) => void;
  onHistory: () => void;
  onSearch: () => void;
  onBundle: () => void;
}) {
  // ---- Filters ----
  // Ward filter: '' means All, else a specific ward name.
  const [wardFilter, setWardFilter] = useState<string>('');
  // Date-range preset.
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('all');

  const today = todayIso();
  const weekAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const monthAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Build the set of ward names actually present (for filter chips), stable-ordered by recent use.
  const wardOptions = useMemo(() => {
    const seen: string[] = [];
    for (const r of rounds) {
      if (!seen.includes(r.ward)) seen.push(r.ward);
    }
    // Always surface the common presets first so users can filter even before any round for that ward exists.
    const presets = [...WARD_PRESETS] as string[];
    const merged: string[] = [];
    for (const p of presets) if (!merged.includes(p)) merged.push(p);
    for (const s of seen) if (!merged.includes(s)) merged.push(s);
    return merged;
  }, [rounds]);

  const filtered = useMemo(() => {
    let items = [...rounds];
    if (wardFilter) items = items.filter((r) => r.ward === wardFilter);
    if (range === 'today') items = items.filter((r) => r.date === today);
    else if (range === '7d') items = items.filter((r) => r.date >= weekAgo);
    else if (range === '30d') items = items.filter((r) => r.date >= monthAgo);
    // Already sorted newest-first by the parent.
    return items;
  }, [rounds, wardFilter, range, today, weekAgo, monthAgo]);

  // Group filtered rounds by date for a "by day" view.
  const dayGroups = useMemo(() => {
    const map = new Map<string, WardRound[]>();
    for (const r of filtered) {
      map.set(r.date, [...(map.get(r.date) ?? []), r]);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totalFiltered = filtered.length;
  const anyFilter = wardFilter !== '' || range !== 'all';

  function dayHeading(iso: string): string {
    if (iso === today) return `Today — ${prettyDate(iso)}`;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    if (iso === yesterday) return `Yesterday — ${prettyDate(iso)}`;
    return prettyDate(iso);
  }

  // Which days are expanded. The single latest round's day is open by default;
  // when the student taps "Show older rounds" we reveal the rest, then day
  // accordions behave normally (tap to open/close).
  const [showOlder, setShowOlder] = useState(false);
  const latestDay = dayGroups[0]?.[0] ?? today;
  const visibleDayGroups = useMemo(() => {
    if (showOlder || anyFilter) return dayGroups;
    // Only show the single latest day by default.
    return dayGroups.slice(0, 1);
  }, [dayGroups, showOlder, anyFilter]);
  const olderCount = Math.max(0, dayGroups.length - visibleDayGroups.length);
  const hiddenRoundsCount = useMemo(() => {
    if (!olderCount) return 0;
    return dayGroups.slice(1).reduce((acc, [, items]) => acc + items.length, 0);
  }, [dayGroups, olderCount]);

  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  // Auto-expand the latest day; when showing older rounds, keep their prior state.
  useEffect(() => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      const visibleDates = new Set(visibleDayGroups.map(([d]) => d));
      for (const d of next) if (!visibleDates.has(d)) next.delete(d);
      if (visibleDates.has(latestDay)) next.add(latestDay);
      if (range !== 'all' || anyFilter) for (const [d] of visibleDayGroups) next.add(d);
      return next;
    });
  }, [visibleDayGroups, latestDay, range, anyFilter]);

  function toggleDay(date: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }
  function expandAll() { setExpandedDays(new Set(visibleDayGroups.map(([d]) => d))); setShowOlder(true); }
  function collapseAll() { setExpandedDays(new Set()); }

  return (
    <div className="space-y-5">
      {live && (
        <button
          className="card flex w-full flex-wrap items-center gap-3 border-brand-400 bg-brand-50 text-left transition-colors hover:border-brand-500 dark:bg-brand-950"
          onClick={() => onOpen(live.id)}
        >
          <span className="text-2xl">🟢</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-brand-800 dark:text-brand-200">Round in progress — {live.ward}</div>
            <div className="text-xs text-brand-700/70 dark:text-brand-300/70">
              {countsSummary(countsFor(live.id)) || 'Nothing captured yet'}
            </div>
          </div>
          <span className="btn-primary !py-1.5 text-sm">Continue →</span>
        </button>
      )}

      <button
        className="w-full rounded-2xl bg-brand-600 px-6 py-6 text-center text-lg font-extrabold text-white shadow-sm transition-colors hover:bg-brand-700 active:scale-[0.99]"
        onClick={onStart}
      >
        ＋ Start Ward Round
      </button>

      <PeriodSummary />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button className="card text-center transition-colors hover:border-brand-400" onClick={onHistory}>
          <div className="text-xl">🗂</div>
          <div className="mt-1 text-sm font-semibold">View History</div>
        </button>
        <button className="card text-center transition-colors hover:border-brand-400" onClick={onSearch}>
          <div className="text-xl">🔍</div>
          <div className="mt-1 text-sm font-semibold">Search Rounds</div>
        </button>
        <button className="card text-center transition-colors hover:border-brand-400" onClick={onBundle}>
          <div className="text-xl">📦</div>
          <div className="mt-1 text-sm font-semibold">Create Bundle</div>
        </button>
        <button
          className="card text-center transition-colors hover:border-brand-400"
          onClick={() => (window.location.hash = '#/ai')}
        >
          <div className="text-xl">🤖</div>
          <div className="mt-1 text-sm font-semibold">Ask AI</div>
        </button>
      </div>

      {/* ---- Filter bar: date range + ward filter chips ---- */}
      <div className="card !p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            📅 Filter rounds
          </div>
          {anyFilter && (
            <button
              className="btn-ghost !py-0.5 text-xs"
              onClick={() => { setWardFilter(''); setRange('all'); }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>

        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {([
            ['all', 'All time'],
            ['today', 'Today'],
            ['7d', 'Last 7 days'],
            ['30d', 'Last 30 days'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                range === k
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
              }`}
              onClick={() => setRange(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              wardFilter === ''
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
            }`}
            onClick={() => setWardFilter('')}
          >
            All wards
          </button>
          {wardOptions.map((w) => (
            <button
              key={w}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                wardFilter === w
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
              }`}
              onClick={() => setWardFilter(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Day-grouped rounds ---- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {anyFilter ? 'Filtered Ward Rounds' : 'Recent Ward Rounds'}
            <span className="ml-2 font-normal normal-case text-slate-400">
              ({totalFiltered} round{totalFiltered === 1 ? '' : 's'})
            </span>
          </h2>
          {rounds.length > totalFiltered && !anyFilter && rounds.length > 9 && (
            <button className="btn-ghost !py-0.5 text-xs" onClick={onHistory}>
              View all →
            </button>
          )}
        </div>
        {!rounds.length ? (
          <EmptyState
            icon="🏥"
            title="No ward rounds yet"
            hint="Start a round and capture what you learn — medicines, conditions, investigations and questions — in a couple of taps. Works fully offline."
            actions={
              <button className="btn-primary" onClick={onStart}>
                ＋ Start Ward Round
              </button>
            }
          />
        ) : !totalFiltered ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
            No rounds match the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400">
                {showOlder || anyFilter ? `Showing ${visibleDayGroups.length} day group${visibleDayGroups.length === 1 ? '' : 's'}` : 'Showing the latest round only'}
              </div>
              <div className="flex items-center gap-2">
                {!showOlder && olderCount > 0 && !anyFilter && (
                  <button className="btn-secondary !py-1 text-xs" onClick={() => setShowOlder(true)}>
                    ▾ Show {hiddenRoundsCount} older round{hiddenRoundsCount === 1 ? '' : 's'} ({olderCount} day{olderCount === 1 ? '' : 's'})
                  </button>
                )}
                {showOlder && !anyFilter && (
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { setShowOlder(false); }}>
                    ▴ Hide older rounds
                  </button>
                )}
                <button className="btn-ghost !py-0.5 text-xs" onClick={expandAll}>Expand all</button>
                <button className="btn-ghost !py-0.5 text-xs" onClick={collapseAll}>Collapse all</button>
              </div>
            </div>
            {visibleDayGroups.map(([date, items]) => {
              const isOpen = expandedDays.has(date);
              return (
                <div
                  key={date}
                  className={`rounded-2xl border transition-colors ${
                    isOpen ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/30' : 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/10'
                  }`}
                >
                  <button
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => toggleDay(date)}
                    aria-expanded={isOpen}
                  >
                    <span className="text-base">{isOpen ? '📂' : '📁'}</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      📆 {dayHeading(date)}
                    </span>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                      {items.length} round{items.length === 1 ? '' : 's'}
                    </span>
                    {date === today && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Today
                      </span>
                    )}
                    <span className="ml-auto text-lg font-bold text-slate-400 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      ›
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((r) => (
                          <RoundCard key={r.id} round={r} onOpen={() => onOpen(r.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RoundCard({ round, onOpen }: { round: WardRound; onOpen: () => void }) {
  const counts = countsFor(round.id);
  const analysis = analysisFor(round.id);
  return (
    <div className="card flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ward Round</div>
          <div className="truncate text-base font-extrabold text-slate-800 dark:text-slate-100">{round.ward}</div>
          <div className="text-xs text-slate-400">{prettyDate(round.date)}</div>
        </div>
        {round.status === 'active' ? <Pill color="amber">Active</Pill> : <Pill color="green">Done</Pill>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {ENTRY_TYPES.filter((t) => counts[t] > 0).map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span>{WARD_ENTRY_META[t].icon}</span>
            <span className="font-semibold">{counts[t]}</span>
            <span className="truncate text-slate-400">{counts[t] === 1 ? WARD_ENTRY_META[t].label : WARD_ENTRY_META[t].plural}</span>
          </div>
        ))}
        {!counts.total && <div className="text-slate-400">Nothing captured yet</div>}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="btn-secondary !py-1.5 text-sm" onClick={onOpen}>
          Open
        </button>
        {analysis?.status === 'completed' && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">🤖 Analyzed</span>}
        {analysis && (analysis.status === 'pending' || analysis.status === 'processing') && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">🤖 AI pending</span>
        )}
      </div>
    </div>
  );
}

// ============================ START ============================

function StartRoundModal({
  open,
  defaultWard,
  onClose,
  onStarted,
}: {
  open: boolean;
  defaultWard: string;
  onClose: () => void;
  onStarted: (r: WardRound) => void;
}) {
  const [ward, setWard] = useState(WARD_PRESETS[0] as string);
  const [customWard, setCustomWard] = useState('');
  const [date, setDate] = useState(todayIso());
  const [focus, setFocus] = useState(WARD_FOCUS_PRESETS[0] as string);
  const [customFocus, setCustomFocus] = useState('');
  const [rotation, setRotation] = useState('');
  const [objective, setObjective] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setWard(WARD_PRESETS[0]);
      setCustomWard(defaultWard && !WARD_PRESETS.includes(defaultWard as any) ? defaultWard : '');
      setDate(todayIso());
      setFocus(WARD_FOCUS_PRESETS[0]);
      setCustomFocus('');
      setRotation('');
      setObjective('');
    }
  }, [open, defaultWard]);

  const finalWard = ward === 'Other' ? customWard.trim() : ward;
  const finalFocus = focus === 'Other' ? customFocus.trim() : focus;

  async function go() {
    if (!finalWard || busy) return;
    setBusy(true);
    try {
      const r = await startRound(finalWard, date, finalFocus, { rotation, objective });
      onStarted(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🏥 Start Ward Round">
      <div className="space-y-4">
        <div>
          <label className="label">Ward</label>
          <div className="flex flex-wrap gap-1.5">
            {[...WARD_PRESETS, 'Other'].map((w) => (
              <button
                key={w}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  ward === w
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }`}
                onClick={() => setWard(w)}
              >
                {w}
              </button>
            ))}
          </div>
          {ward === 'Other' && (
            <input
              autoFocus
              className="input mt-2"
              placeholder="Ward name"
              value={customWard}
              onChange={(e) => setCustomWard(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          )}
        </div>

        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div>
          <label className="label">Focus (optional)</label>
          <div className="flex flex-wrap gap-1.5">
            {[...WARD_FOCUS_PRESETS, 'Other'].map((f) => (
              <button
                key={f}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  focus === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }`}
                onClick={() => setFocus(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {focus === 'Other' && (
            <input className="input mt-2" placeholder="Focus" value={customFocus} onChange={(e) => setCustomFocus(e.target.value)} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rotation (optional)</label>
            <input className="input" placeholder="e.g. Internal Medicine" value={rotation} onChange={(e) => setRotation(e.target.value)} />
          </div>
          <div>
            <label className="label">Learning objective (optional)</label>
            <input className="input" placeholder="What do you want to learn?" value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          🔒 Record clinical <strong>learning</strong> only — never patient names, IDs or any identifying details.
        </p>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={go} disabled={!finalWard || busy}>
            START WARD ROUND
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================ ACTIVE ROUND ============================

function ActiveRound({ round, onClose, onDeleted }: { round: WardRound; onClose: () => void; onDeleted: () => void }) {
  const allEntries = useData((s) => s.wardEntries);
  const analyses = useData((s) => s.wardAnalyses);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureType, setCaptureType] = useState<WardEntryType | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [filter, setFilter] = useState<WardEntryType | 'all'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Patient selection: which patient (by label) the user is currently capturing for.
  const [activePatient, setActivePatient] = useState<string | null>(null);
  const [renamePatient, setRenamePatient] = useState<{ from: string; value: string } | null>(null);

  const entries = useMemo(
    () => allEntries.filter((e) => e.roundId === round.id).sort((a, b) => b.createdAt - a.createdAt),
    [allEntries, round.id]
  );
  const counts = countsFor(round.id);
  const analysis = analyses.find((a) => a.roundId === round.id) ?? null;

  // Build the list of patient labels present in this round, stably ordered by first encounter.
  const patientLabels = useMemo(() => {
    const seen: string[] = [];
    const order: string[] = [];
    for (const e of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
      const p = (e.patientLabel || '').trim();
      if (!p) continue;
      if (!seen.includes(p)) {
        seen.push(p);
        order.push(p);
      }
    }
    return order;
  }, [entries]);

  const unassignedEntries = entries.filter((e) => !e.patientLabel?.trim());
  const unassignedCount = unassignedEntries.length;

  // Counts for a specific patient label.
  function patientCount(label: string): number {
    return entries.filter((e) => e.patientLabel === label).length;
  }

  // Find the next "Patient N" number that isn't already used.
  function nextPatientNumber(): number {
    const used = new Set<number>();
    for (const label of patientLabels) {
      const m = label.match(/^Patient\s+(\d+)$/i);
      if (m) used.add(parseInt(m[1], 10));
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  // Create a new patient ("Patient N"), select it, and open quick capture.
  function addPatient() {
    const next = `Patient ${nextPatientNumber()}`;
    setActivePatient(next);
    setCaptureType(null);
    setCaptureOpen(true);
  }

  function selectPatient(label: string) {
    setActivePatient((prev) => (prev === label ? null : label));
  }

  function quickForPatient(type: WardEntryType) {
    setCaptureType(type);
    setCaptureOpen(true);
  }

  // Entries shown in the main list (respecting filter).
  const shown = useMemo(() => {
    const base = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
    return base;
  }, [entries, filter]);

  const entriesForPatient = (label: string) =>
    shown.filter((e) => e.patientLabel === label);

  const shownUnassigned = filter === 'all'
    ? unassignedEntries
    : unassignedEntries.filter((e) => e.type === filter);

  function openCapture(noPatient = false) {
    setCaptureType(null);
    if (noPatient) setActivePatient(null);
    setCaptureOpen(true);
  }

  async function makeBundleFromSelection() {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const b = await bundleFromWardEntries(round.id, selected, `WARD ROUND — ${round.ward} — selected captures`);
      if (b) {
        useData.getState().setStatus(`✓ Bundle created from ${selected.length} capture(s)`);
        setSelected([]);
        setSelectMode(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function renamePatientLabel(oldLabel: string, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;
    // Update every entry carrying the old label.
    const targets = entries.filter((e) => e.patientLabel === oldLabel);
    for (const e of targets) {
      // Lazy import to avoid circular concerns at module init.
      const { updateEntry } = await import('../services/wardRounds');
      await updateEntry(e, { patientLabel: trimmed });
    }
    if (activePatient === oldLabel) setActivePatient(trimmed);
    useData.getState().setStatus(`✓ Renamed to ${trimmed}`);
  }

  async function removePatientLabel(label: string) {
    if (!(await confirmAction({
      title: `Remove ${label}?`,
      message: `Captures for this patient will be kept (moved to Unassigned) — nothing is deleted.`,
      confirmLabel: 'Remove label',
      destructive: false,
    }))) return;
    const targets = entries.filter((e) => e.patientLabel === label);
    for (const e of targets) {
      const { updateEntry } = await import('../services/wardRounds');
      await updateEntry(e, { patientLabel: undefined });
    }
    if (activePatient === label) setActivePatient(null);
  }

  async function exportRound() {
    const md = roundToMarkdown(round);
    const finding = scanForPhi(md);
    if (
      finding.length &&
      !(await confirmAction({
        title: '⚠️ Possible patient-identifying information',
        message: privacyWarning(finding),
        note: 'Clinical Rx is not a patient record. Export only if you are sure nothing identifying is included.',
        confirmLabel: 'Export anyway',
        destructive: true,
      }))
    )
      return;
    downloadText(`ward-round-${round.ward.toLowerCase().replace(/\s+/g, '-')}-${round.date}.md`, md);
  }

  return (
    <div className="space-y-4">
      {/* --- Round header --- */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🏥 Ward Round</div>
            <h2 className="truncate text-xl font-extrabold text-slate-800 dark:text-slate-100">{round.ward}</h2>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {prettyDate(round.date)}
              {round.focus ? ` · ${round.focus}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {round.status === 'active' ? <Pill color="amber">Active</Pill> : <Pill color="green">Completed</Pill>}
            <button className="btn-ghost !py-1 text-xs" onClick={exportRound} title="Export as Markdown">
              ⬇ MD
            </button>
          </div>
        </div>
      </div>

      {/* --- Patient selector (Step 1: select patient; then Quick Capture opens) --- */}
      {round.status === 'active' && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
              🧑‍⚕️ Patients
            </div>
            <button className="btn-ghost !py-0.5 text-xs" onClick={addPatient}>
              ＋ Add Patient
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {patientLabels.map((label) => {
              const n = patientCount(label);
              const isActive = activePatient === label;
              return (
                <button
                  key={label}
                  className={`group relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                      : 'border-slate-200 bg-white hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
                  }`}
                  onClick={() => selectPatient(label)}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="text-base">🛏️</span>
                    <span className={`flex-1 truncate text-sm font-bold ${isActive ? 'text-brand-800 dark:text-brand-200' : 'text-slate-800 dark:text-slate-100'}`}>
                      {label}
                    </span>
                    {isActive && <span className="text-[10px] font-bold text-brand-600 dark:text-brand-300">● Active</span>}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {n} capture{n === 1 ? '' : 's'}
                  </span>
                  {/* Tiny actions on hover/focus */}
                  <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={(e) => { e.stopPropagation(); setRenamePatient({ from: label, value: label }); }}
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      className="rounded px-1 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      onClick={(e) => { e.stopPropagation(); removePatientLabel(label); }}
                      title="Remove label"
                    >
                      ✕
                    </button>
                  </span>
                </button>
              );
            })}
            <button
              className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-brand-300"
              onClick={addPatient}
            >
              <span className="text-xl leading-none">＋</span>
              <span className="text-[11px]">Add Patient</span>
            </button>
          </div>
        </div>
      )}

      {/* --- Active patient workspace: one-tap Quick Capture under the selected patient --- */}
      {round.status === 'active' && activePatient && (
        <div className="card border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/30">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">
                Now capturing for
              </div>
              <div className="text-lg font-extrabold text-brand-900 dark:text-brand-100">🛏️ {activePatient}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1 text-xs" onClick={() => setActivePatient(null)}>
                ✕ Done with this patient
              </button>
            </div>
          </div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700/80 dark:text-brand-300/80">
            Quick Capture for {activePatient}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t}
                className="flex flex-col items-center gap-1 rounded-xl border border-brand-200 bg-white px-2 py-3 transition-colors hover:border-brand-500 hover:bg-brand-50 active:scale-95 dark:border-brand-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                onClick={() => quickForPatient(t)}
              >
                <span className="text-xl leading-none">{WARD_ENTRY_META[t].icon}</span>
                <span className="text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
                  {WARD_ENTRY_META[t].label}
                </span>
              </button>
            ))}
          </div>
          <button className="btn-primary mt-3 w-full py-2.5 text-sm" onClick={() => openCapture(false)}>
            ＋ Quick Capture ({activePatient})
          </button>
        </div>
      )}

      {/* --- Fallback "general" Quick Capture (no patient selected) --- */}
      {round.status === 'active' && !activePatient && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Quick Capture (no patient)</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 transition-colors hover:border-brand-500 hover:bg-brand-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                onClick={() => { setCaptureType(t); setCaptureOpen(true); }}
              >
                <span className="text-xl leading-none">{WARD_ENTRY_META[t].icon}</span>
                <span className="text-[10px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
                  {WARD_ENTRY_META[t].label}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary flex-1" onClick={() => openCapture(true)}>
              ＋ Capture without a patient
            </button>
            {patientLabels.length === 0 && (
              <button className="btn-primary flex-1" onClick={addPatient}>
                ＋ Start with Patient 1
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            💡 Tip: Select a patient above first — then Quick Capture opens under them so captures stay organised by patient.
          </p>
        </div>
      )}

      {/* --- Counts --- */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {round.status === 'active' ? "Today's Captures" : 'Captured'}
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {counts.total} total{patientLabels.length > 0 && ` · ${patientLabels.length} patient${patientLabels.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {!counts.total ? (
          <p className="text-sm text-slate-400">Nothing captured yet — select a patient above and tap Quick Capture.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t}
                className={`rounded-xl px-2 py-2 text-center transition-colors ${
                  filter === t ? 'bg-brand-600 text-white' : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-700'
                }`}
                onClick={() => setFilter(filter === t ? 'all' : t)}
              >
                <div className="text-lg leading-none">{WARD_ENTRY_META[t].icon}</div>
                <div className="text-lg font-extrabold leading-tight">{counts[t]}</div>
                <div className={`text-[10px] leading-tight ${filter === t ? 'text-white/80' : 'text-slate-400'}`}>
                  {WARD_ENTRY_META[t].plural}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Actions --- */}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => setAnalysisOpen(true)} disabled={!counts.total}>
          🤖 Analyze Ward Round
        </button>
        <button
          className="btn-primary"
          disabled={!counts.total}
          onClick={async () => {
            try {
              const { sessionId } = await openRoundAi(round.id, null);
              navigateToRoundAi(sessionId);
            } catch (e: any) {
              useData.getState().setStatus('⚠️ ' + (e?.message || 'Could not open Ward Round AI'));
            }
          }}
          title="Open the dedicated Ward Round AI teacher for a deep, ongoing conversation about this round"
        >
          🏥 Open in Ward Round AI
        </button>
        {round.status === 'active' ? (
          <button className="btn-primary" onClick={() => setFinishOpen(true)}>
            Finish Ward Round
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => reopenRound(round.id)}>
            ↩ Reopen round
          </button>
        )}
        <button
          className="btn-ghost"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected([]);
          }}
          disabled={!counts.total}
        >
          {selectMode ? '✕ Cancel selection' : '📦 Bundle selected captures'}
        </button>
        <div className="ml-auto flex gap-2">
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              const c = await duplicateRound(round.id);
              if (c) useData.getState().setStatus('✓ Round duplicated');
            }}
          >
            ⧉ Duplicate
          </button>
          <button
            className="btn-ghost text-xs text-red-600"
            onClick={async () => {
              if (!(await confirmAction({
                title: 'Delete this ward round?',
                message: `The round and its ${counts.total} capture(s) will be removed.`,
                note: 'This cannot be undone.',
                confirmLabel: 'Delete round',
                destructive: true,
              }))) return;
              await deleteRound(round.id);
              onDeleted();
            }}
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950">
          <span className="font-medium text-brand-800 dark:text-brand-200">{selected.length} selected</span>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(shown.map((e) => e.id))}>
            Select all shown
          </button>
          <button className="btn-primary ml-auto !py-1 text-xs" onClick={makeBundleFromSelection} disabled={!selected.length || busy}>
            📦 Create bundle
          </button>
        </div>
      )}

      {/* --- AI analysis result --- */}
      {analysis && analysis.status === 'completed' && <AnalysisPanel roundId={round.id} />}

      {/* --- Entries grouped by patient --- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Captures {filter !== 'all' && `· ${WARD_ENTRY_META[filter].plural}`}
          </div>
          {filter !== 'all' && (
            <button className="btn-ghost !py-0.5 text-xs" onClick={() => setFilter('all')}>
              Show all
            </button>
          )}
        </div>

        {patientLabels.length === 0 && unassignedCount === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
            Your captures will appear here instantly — start with a patient above.
          </div>
        ) : (
          <>
            {patientLabels.map((label) => {
              const es = entriesForPatient(label);
              const isActive = activePatient === label;
              return (
                <div
                  key={label}
                  className={`rounded-2xl border p-3 transition-colors ${
                    isActive
                      ? 'border-brand-400 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/30'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                      className="flex items-center gap-2 text-left"
                      onClick={() => round.status === 'active' && selectPatient(label)}
                    >
                      <span className="text-lg">🛏️</span>
                      <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {es.length} capture{es.length === 1 ? '' : 's'}
                      </span>
                      {isActive && (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          ACTIVE
                        </span>
                      )}
                    </button>
                    {round.status === 'active' && (
                      <button className="btn-ghost !py-1 text-xs" onClick={() => { setActivePatient(label); setCaptureType(null); setCaptureOpen(true); }}>
                        ＋ Add to {label}
                      </button>
                    )}
                    <button
                      className="btn-ghost !py-1 text-xs"
                      disabled={es.length === 0}
                      onClick={async () => {
                        try {
                          const { sessionId } = await openRoundAi(round.id, label);
                          navigateToRoundAi(sessionId);
                        } catch (e: any) {
                          useData.getState().setStatus('⚠️ ' + (e?.message || 'Could not open Ward Round AI'));
                        }
                      }}
                      title={`Discuss ${label}'s case in Ward Round AI`}
                    >
                      🏥 Ask AI about {label}
                    </button>
                  </div>
                  {es.length === 0 ? (
                    <p className="text-xs text-slate-400">No captures here yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {es.map((e) => (
                        <WardEntryCard
                          key={e.id}
                          entry={e}
                          selectable={selectMode}
                          selected={selected.includes(e.id)}
                          onToggleSelect={(v) => setSelected((prev) => (v ? [...prev, e.id] : prev.filter((x) => x !== e.id)))}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {shownUnassigned.length > 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📎</span>
                    <span className="text-sm font-extrabold text-slate-500 dark:text-slate-400">Unassigned (no patient)</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {shownUnassigned.length}
                    </span>
                  </div>
                  {round.status === 'active' && (
                    <button className="btn-ghost !py-1 text-xs" onClick={() => openCapture(true)}>
                      ＋ Add note
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {shownUnassigned.map((e) => (
                    <WardEntryCard
                      key={e.id}
                      entry={e}
                      selectable={selectMode}
                      selected={selected.includes(e.id)}
                      onToggleSelect={(v) => setSelected((prev) => (v ? [...prev, e.id] : prev.filter((x) => x !== e.id)))}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <WardQuickCapture
        open={captureOpen}
        roundId={round.id}
        initialType={captureType}
        patientLabel={activePatient ?? undefined}
        onClose={() => setCaptureOpen(false)}
      />

      {/* Rename patient modal */}
      <Modal open={renamePatient !== null} onClose={() => setRenamePatient(null)} title="Rename patient label">
        {renamePatient && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await renamePatientLabel(renamePatient.from, renamePatient.value);
              setRenamePatient(null);
            }}
          >
            <label className="label">Label</label>
            <input
              autoFocus
              className="input"
              value={renamePatient.value}
              onChange={(e) => setRenamePatient({ ...renamePatient, value: e.target.value })}
              placeholder="e.g. Patient 1, Bed 3, or a non-identifying note"
            />
            <p className="text-[11px] text-slate-400">
              🔒 Use labels only (e.g. "Bed 4 — hypertension") — never real names or IDs.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRenamePatient(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!renamePatient.value.trim()}>Rename</button>
            </div>
          </form>
        )}
      </Modal>

      <FinishModal open={finishOpen} round={round} onClose={() => setFinishOpen(false)} onDone={onClose} />
      <AnalyzeModal open={analysisOpen} round={round} onClose={() => setAnalysisOpen(false)} />
    </div>
  );
}

// ============================ FINISH ============================

function FinishModal({ open, round, onClose, onDone }: { open: boolean; round: WardRound; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const counts = countsFor(round.id);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const aiUsable = canRunAi();

  useEffect(() => {
    if (open) setFinished(false);
  }, [open]);

  async function saveAndFinish() {
    setBusy(true);
    try {
      await finishRound(round.id);
      if (!aiUsable) await queueAnalysis(round.id); // never lose the round to AI being unavailable
      setFinished(true);
    } finally {
      setBusy(false);
    }
  }

  async function finishAndAnalyze() {
    setBusy(true);
    try {
      await finishRound(round.id);
      await analyzeRound(round.id).catch(() => {}); // non-fatal: Ward Round AI still works even if structured analysis fails
      // Open Ward Round AI with this round loaded so the conversation continues there.
      const { sessionId } = await openRoundAi(round.id, null,
        'I just finished this ward round. Give me the full teaching walkthrough: key learning points, medications to study, clinical reasoning patterns, knowledge gaps, and quiz me on the cases.');
      setFinished(true);
      onClose();
      onDone?.();
      navigateToRoundAi(sessionId);
    } finally {
      setBusy(false);
    }
  }

  async function finishAndBundle() {
    setBusy(true);
    try {
      await finishRound(round.id);
      await bundleFromWardRounds([round.id], `WARD ROUND — ${round.ward} — ${round.date}`);
      useData.getState().setStatus('✓ Bundle created from ward round');
      setFinished(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={finished ? 'Ward round saved' : 'Finish Ward Round'}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-brand-50 p-4 text-center dark:bg-brand-950">
          <div className="text-2xl">🎉</div>
          <div className="mt-1 text-base font-extrabold text-brand-800 dark:text-brand-200">WARD ROUND COMPLETE</div>
          <div className="text-sm text-brand-700/80 dark:text-brand-300/80">
            {round.ward} · {prettyDate(round.date)}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Captured</div>
          <div className="space-y-1">
            {ENTRY_TYPES.filter((t) => counts[t] > 0).map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm">
                <span>{WARD_ENTRY_META[t].icon}</span>
                <span className="font-bold">{counts[t]}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {counts[t] === 1 ? WARD_ENTRY_META[t].label : WARD_ENTRY_META[t].plural}
                </span>
              </div>
            ))}
            {!counts.total && <p className="text-sm text-slate-400">No captures in this round.</p>}
          </div>
        </div>

        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            aiUsable
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          }`}
        >
          {aiUsable ? (
            <>🤖 AI analysis available</>
          ) : (
            <>
              🟢 Saved locally
              <br />
              🤖 AI analysis will be processed when {online ? 'AI is configured' : 'internet is available'}.
            </>
          )}
        </div>

        {finished ? (
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={() => {
                onClose();
                onDone();
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={finishAndBundle} disabled={busy}>
              Create Manual Bundle
            </button>
            <button className="btn-secondary" onClick={finishAndAnalyze} disabled={busy || !aiUsable || !counts.total}>
              Analyze with AI
            </button>
            <button className="btn-primary" onClick={saveAndFinish} disabled={busy}>
              Save &amp; Finish
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================ AI ANALYSIS ============================

function AnalyzeModal({ open, round, onClose }: { open: boolean; round: WardRound; onClose: () => void }) {
  const [mode, setMode] = useState<ExplainMode>('level');
  const [busy, setBusy] = useState(false);
  const analysis = analysisFor(round.id);
  const usable = canRunAi();

  async function run() {
    setBusy(true);
    try {
      await analyzeRound(round.id, mode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🤖 Analyze Ward Round" wide>
      <div className="space-y-4">
        <div>
          <div className="label">Explanation depth</div>
          <div className="flex flex-wrap gap-1.5">
            {EXPLAIN_MODES.map((m) => (
              <button
                key={m.key}
                title={m.hint}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                }`}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {!usable && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            AI is unavailable right now (offline or no API key in Settings → AI). You can queue it — the round is already saved and the
            analysis will run automatically once AI is reachable.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={run} disabled={busy || !usable}>
            {busy ? '🤖 Analyzing…' : analysis?.status === 'completed' ? 'Re-run analysis' : 'Run analysis'}
          </button>
          {!usable && (
            <button
              className="btn-secondary"
              onClick={async () => {
                await queueAnalysis(round.id);
                useData.getState().setStatus('🤖 AI analysis queued — will run when available');
                onClose();
              }}
            >
              Queue for later
            </button>
          )}
        </div>

        {analysis?.status === 'failed' && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            ⚠️ {analysis.error || 'Analysis failed.'} It will be retried automatically.
          </div>
        )}

        {analysis?.status === 'completed' && <AnalysisBody roundId={round.id} />}
      </div>
    </Modal>
  );
}

function AnalysisPanel({ roundId }: { roundId: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card border-brand-200 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/30">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-bold text-brand-800 dark:text-brand-200">🤖 AI Analysis</span>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3">
          <AnalysisBody roundId={roundId} />
        </div>
      )}
    </div>
  );
}

function AnalysisBody({ roundId }: { roundId: string }) {
  const analyses = useData((s) => s.wardAnalyses);
  const a = analyses.find((x) => x.roundId === roundId);
  if (!a || a.status !== 'completed') return null;

  const sections: Array<[string, string[]]> = [
    ['Key learning points', a.keyLearningPoints],
    ['Knowledge gaps', a.knowledgeGaps],
    ['Follow-up questions', a.questions],
    ['Revision recommendations', a.revisionRecommendations],
    ['Connections', a.connections],
    ['Needs deeper study', a.difficultTopics],
  ];

  return (
    <div className="space-y-3 text-sm">
      {a.summary && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Summary</div>
          <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{a.summary}</p>
        </div>
      )}
      {sections.map(([heading, items]) =>
        items.length ? (
          <div key={heading}>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{heading}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
              {items.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          </div>
        ) : null
      )}
      <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-400 dark:border-slate-700">
        AI-generated from your notes · stored separately from your captures, which are unchanged. Always verify against approved
        guidelines, the formulary or your supervisor.
        {a.model ? ` · ${a.model}` : ''}
      </p>
    </div>
  );
}

// ============================ HISTORY ============================

function History({ rounds, onOpen, onBack }: { rounds: WardRound[]; onOpen: (id: string) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<'date' | 'ward' | 'captures'>('date');
  const [wardFilter, setWardFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const today = todayIso();
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([today]));

  const wardOptions = useMemo(() => {
    const seen: string[] = [];
    for (const r of rounds) if (!seen.includes(r.ward)) seen.push(r.ward);
    const presets = [...WARD_PRESETS] as string[];
    const merged: string[] = [];
    for (const p of presets) if (!merged.includes(p)) merged.push(p);
    for (const s of seen) if (!merged.includes(s)) merged.push(s);
    return merged;
  }, [rounds]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let items = rounds.filter((r) => (showArchived ? true : !r.archived));
    if (wardFilter) items = items.filter((r) => r.ward === wardFilter);
    if (fromDate) items = items.filter((r) => r.date >= fromDate);
    if (toDate) items = items.filter((r) => r.date <= toDate);
    if (ql) {
      const hits = new Set(searchWardRounds(ql).map((h) => h.round.id));
      items = items.filter((r) => hits.has(r.id));
    }
    return items.sort((a, b) => {
      if (sort === 'ward') return a.ward.localeCompare(b.ward);
      if (sort === 'captures') return countsFor(b.id).total - countsFor(a.id).total;
      return a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1;
    });
  }, [rounds, q, showArchived, sort, wardFilter, fromDate, toDate]);

  // When sorting by date, group by day; otherwise render flat.
  const byDate = sort === 'date';
  const dayGroups = useMemo(() => {
    if (!byDate) return null;
    const map = new Map<string, WardRound[]>();
    for (const r of list) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return Array.from(map.entries());
  }, [list, byDate]);

  // Keep the expanded-day set valid as filters/sort change; default today open.
  useEffect(() => {
    setExpandedDays((prev) => {
      if (!byDate || !dayGroups) return prev;
      const next = new Set(prev);
      const visibleDates = new Set(dayGroups.map(([d]) => d));
      for (const d of next) if (!visibleDates.has(d)) next.delete(d);
      if (visibleDates.has(today)) next.add(today);
      // Open everything when filters are narrow (easier browsing).
      if (wardFilter || fromDate || toDate || q.trim()) for (const [d] of dayGroups) next.add(d);
      return next;
    });
  }, [dayGroups, byDate, today, wardFilter, fromDate, toDate, q]);

  function toggleDay(date: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function expandAll() {
    if (!dayGroups) return;
    setExpandedDays(new Set(dayGroups.map(([d]) => d)));
  }
  function collapseAll() { setExpandedDays(new Set()); }

  function dayHeadingHistory(iso: string): string {
    if (iso === today) return `Today — ${prettyDate(iso)}`;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    if (iso === yesterday) return `Yesterday — ${prettyDate(iso)}`;
    return prettyDate(iso);
  }

  const hasAnyFilter = wardFilter !== '' || fromDate !== '' || toDate !== '' || q.trim() !== '' || showArchived;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button className="btn-secondary sm:w-auto" onClick={onBack}>
          ← Back
        </button>
        <input
          className="input min-w-0 flex-1"
          placeholder="Search ward rounds, medicines, conditions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2">
          <select className="input !w-auto flex-1" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="date">Newest first</option>
            <option value="ward">By ward</option>
            <option value="captures">Most captures</option>
          </select>
          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archived
          </label>
        </div>
      </div>

      {/* Ward filter chips */}
      <div className="card !p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">🏥 Filter by ward</div>
          {hasAnyFilter && (
            <button
              className="btn-ghost !py-0.5 text-xs"
              onClick={() => { setWardFilter(''); setFromDate(''); setToDate(''); setQ(''); setShowArchived(false); }}
            >
              ✕ Reset all
            </button>
          )}
        </div>
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              wardFilter === ''
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
            }`}
            onClick={() => setWardFilter('')}
          >
            All wards
          </button>
          {wardOptions.map((w) => (
            <button
              key={w}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                wardFilter === w
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
              }`}
              onClick={() => setWardFilter(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label !text-[11px]">From</label>
            <input type="date" className="input !py-1.5 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label !text-[11px]">To</label>
            <input type="date" className="input !py-1.5 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Showing {list.length} round{list.length === 1 ? '' : 's'}.
        </div>
      </div>

      {!list.length ? (
        <EmptyState icon="🗂" title="No ward rounds found" hint={q ? `Nothing matches “${q}”.` : 'Start your first ward round to build a history.'} />
      ) : byDate ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost !py-0.5 text-xs" onClick={expandAll}>Expand all</button>
            <button className="btn-ghost !py-0.5 text-xs" onClick={collapseAll}>Collapse all</button>
          </div>
          {dayGroups!.map(([date, items]) => {
            const isOpen = expandedDays.has(date);
            return (
              <div
                key={date}
                className={`rounded-2xl border transition-colors ${
                  isOpen ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/30' : 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/10'
                }`}
              >
                <button
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => toggleDay(date)}
                  aria-expanded={isOpen}
                >
                  <span className="text-base">{isOpen ? '📂' : '📁'}</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    📆 {dayHeadingHistory(date)}
                  </span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    {items.length}
                  </span>
                  <span className="ml-auto text-lg font-bold text-slate-400 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                    {items.map((r) => (
                      <HistoryRow key={r.id} round={r} onOpen={() => onOpen(r.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <HistoryRow key={r.id} round={r} onOpen={() => onOpen(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ round, onOpen }: { round: WardRound; onOpen: () => void }) {
  const counts = countsFor(round.id);
  const [menu, setMenu] = useState(false);
  // Themed rename instead of window.prompt (§34).
  const [renameTo, setRenameTo] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-3 sm:py-2.5">
      <Modal open={renameTo !== null} onClose={() => setRenameTo(null)} title="Rename ward">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = (renameTo ?? '').trim();
            setRenameTo(null);
            if (name) await renameRound(round.id, name);
          }}
        >
          <label className="label" htmlFor={`ward-rename-${round.id}`}>Ward name</label>
          <input
            id={`ward-rename-${round.id}`}
            className="input"
            value={renameTo ?? ''}
            onChange={(e) => setRenameTo(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRenameTo(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!(renameTo ?? '').trim()}>Rename</button>
          </div>
        </form>
      </Modal>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {new Date(round.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} — {round.ward}
          </span>
          {round.status === 'active' && <Pill color="amber">Active</Pill>}
          {round.archived && <Pill color="slate">Archived</Pill>}
        </div>
        <div className="truncate text-xs text-slate-400">{countsSummary(counts) || 'No captures'}</div>
      </button>

      <div className="relative">
        <button className="btn-ghost !px-2 !py-1 text-sm" onClick={() => setMenu((v) => !v)} aria-label="Round actions">
          ⋯
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <MenuItem label="Open" onClick={() => { setMenu(false); onOpen(); }} />
              <MenuItem
                label="Rename ward"
                onClick={() => {
                  setMenu(false);
                  setRenameTo(round.ward);
                }}
              />
              <MenuItem
                label="Create bundle"
                onClick={async () => {
                  setMenu(false);
                  await bundleFromWardRounds([round.id], `WARD ROUND — ${round.ward} — ${round.date}`);
                  useData.getState().setStatus('✓ Bundle created');
                }}
              />
              <MenuItem
                label="Export Markdown"
                onClick={() => {
                  setMenu(false);
                  downloadText(`ward-round-${round.date}.md`, roundToMarkdown(round));
                }}
              />
              <MenuItem
                label={round.archived ? 'Unarchive' : 'Archive'}
                onClick={async () => {
                  setMenu(false);
                  await setArchived(round.id, !round.archived);
                }}
              />
              <MenuItem
                label="Delete"
                danger
                onClick={async () => {
                  setMenu(false);
                  if (!(await confirmAction({
                    title: `Delete the ${round.ward} round?`,
                    message: `The round of ${round.date} and all of its captures will be removed.`,
                    note: 'This cannot be undone.',
                    confirmLabel: 'Delete round',
                    destructive: true,
                  }))) return;
                  await deleteRound(round.id);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
        danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ============================ SEARCH ============================

function SearchModalWard({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  useData((s) => s.wardEntries); // subscribe so results stay fresh
  const hits = q.trim() ? searchWardRounds(q) : [];

  return (
    <Modal open={open} onClose={onClose} title="🔍 Search Ward Rounds" wide>
      <input
        autoFocus
        className="input mb-3"
        placeholder="e.g. amlodipine, hypertension, FBC…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!q.trim() ? (
        <p className="text-sm text-slate-400">Search every ward round and everything captured inside it.</p>
      ) : !hits.length ? (
        <p className="text-sm text-slate-400">No ward rounds match “{q}”.</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {hits.map(({ round, entries }) => (
            <div key={round.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <button
                className="text-left"
                onClick={() => {
                  onClose();
                  onOpen(round.id);
                }}
              >
                <div className="font-semibold text-slate-800 dark:text-slate-100">
                  🏥 {round.ward} · {prettyDate(round.date)}
                </div>
                <div className="text-xs text-slate-400">{countsSummary(countsFor(round.id)) || 'No captures'}</div>
              </button>
              {entries.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-700">
                  {entries.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span>{WARD_ENTRY_META[e.type].icon}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {e.title ? <strong>{e.title}</strong> : null} {e.content}
                      </span>
                    </div>
                  ))}
                  {entries.length > 5 && <div className="text-[11px] text-slate-400">+{entries.length - 5} more</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ============================ BUNDLE ============================

function BundleFromRoundsModal({ open, rounds, onClose }: { open: boolean; rounds: WardRound[]; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (open) {
      setSelected([]);
      setTitle(`WARD ROUNDS — ${todayIso()}`);
      setFrom('');
      setTo('');
    }
  }, [open]);

  const filtered = rounds.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));

  async function create() {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const b = await bundleFromWardRounds(selected, title.trim() || `WARD ROUNDS — ${todayIso()}`);
      if (b) {
        useData.getState().setStatus(`✓ Bundle created from ${selected.length} ward round(s)`);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="📦 Create Bundle from Ward Rounds" wide>
      <div className="space-y-3">
        <div>
          <label className="label">Bundle title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">From date</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To date</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label !mb-0">Ward rounds</label>
            <button
              className="btn-ghost !py-0.5 text-xs"
              onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map((r) => r.id))}
            >
              {selected.length === filtered.length && filtered.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          {!filtered.length ? (
            <p className="text-sm text-slate-400">No ward rounds in this range.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.map((r) => {
                const c = countsFor(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-brand-400 dark:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={selected.includes(r.id)}
                      onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{r.ward}</span>{' '}
                      <span className="text-xs text-slate-400">
                        {r.date} · {c.total} capture{c.total === 1 ? '' : 's'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          The bundle is a new, independent artifact that <strong>references</strong> these rounds — your original ward rounds stay
          exactly as they are.
        </p>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create} disabled={!selected.length || busy}>
            {busy ? 'Creating…' : `Create bundle (${selected.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}


/**
 * Today / This week / This month at a glance.
 *
 * Built on the generic date-range retrieval in services/wardRounds, which is
 * the same foundation the future Daily and Weekly Bundlers will consume.
 */
function PeriodSummary() {
  useData((s) => s.wardRounds);
  useData((s) => s.wardEntries);
  useData((s) => s.lessons);
  useData((s) => s.questions);

  const iso = todayIso();
  const month = monthBounds(iso);
  const periods = [
    { key: 'today', label: 'Today', data: activityForDay(iso) },
    { key: 'week', label: 'This week', data: activityForWeek(iso) },
    { key: 'month', label: 'This month', data: activityBetween(month.start, month.end) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {periods.map((p) => {
        const c = p.data.counts;
        const total = Object.values(c).reduce((n, v) => n + v, 0);
        return (
          <div key={p.key} className="card">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{p.label}</span>
              <span className="text-lg font-extrabold text-brand-600">{c['Ward rounds']}</span>
            </div>
            {total === 0 ? (
              <p className="mt-1 text-xs text-slate-400">Nothing recorded yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                {c['Ward captures'] > 0 && <span>✍️ {c['Ward captures']}</span>}
                {c['Learning notes'] > 0 && <span>💡 {c['Learning notes']}</span>}
                {c['Diseases'] > 0 && <span>🦠 {c['Diseases']}</span>}
                {c['Medicines'] > 0 && <span>💊 {c['Medicines']}</span>}
                {c['Investigations'] > 0 && <span>🧪 {c['Investigations']}</span>}
                {c['Questions'] > 0 && <span>❓ {c['Questions']}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
