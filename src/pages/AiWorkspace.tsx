import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { AiStatusDot, useAiStatus } from '../components/AiStatus';
import { PERSONAS, askAi, type AiPersona, type AiSource } from '../services/aiOrchestrator';
import {
  appendMessage,
  clearConversation,
  createConversation,
  deleteConversation,
  exportConversation,
  getConversation,
  historyFor,
  loadConversations,
  renameConversation,
  searchConversations,
  type AiConversation,
} from '../services/aiConversations';
import { grantConfirmation, runTool, type ToolOutcome } from '../services/aiToolRegistry';
import { useConfirm } from '../components/ui/primitives';
import { Modal } from '../components/Modal';

/**
 * 💬 AI WORKSPACE
 *
 * The unified chat: one place, seven personas, full conversation history,
 * source attribution on every answer, and a confirmation gate in front of any
 * action that would change the student's data.
 */

const ROUTES: Record<string, string> = {
  disease: '/diseases',
  medicine: '/medicines',
  investigation: '/investigations',
  question: '/questions',
  lesson: '/notes',
  wardRound: '/ward-rounds',
  wardEntry: '/ward-rounds',
  bundle: '/bundles',
  course: '/courses',
  revision: '/revision',
  quiz: '/quiz',
  day: '/clinical',
};

function SourceList({ sources }: { sources: AiSource[] }) {
  const navigate = useNavigate();
  if (!sources.length) return null;
  return (
    <details className="mt-2 rounded border border-slate-300/40 p-2 text-xs dark:border-slate-600/60">
      <summary className="cursor-pointer font-medium">
        📎 Sources — {sources.length} record{sources.length === 1 ? '' : 's'} from YOUR CLINICAL Rx RECORDS
      </summary>
      <ul className="mt-2 space-y-1">
        {sources.map((s) => (
          <li key={`${s.type}:${s.id}`} className="flex items-center justify-between gap-2">
            <span className="truncate">
              <span className="opacity-70">[{s.type}]</span> {s.title}
              {s.date ? <span className="opacity-60"> · {s.date}</span> : null}
              {s.academicLabel ? <span className="opacity-60"> · {s.academicLabel}</span> : null}
            </span>
            <button className="shrink-0 underline" onClick={() => navigate(ROUTES[s.type] ?? '/')}>
              Open Source
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function AiWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = useAiStatus('general');

  const [persona, setPersona] = useState<AiPersona>((params.get('m') as AiPersona) || 'general');
  const [convId, setConvId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  // Themed rename instead of window.prompt, which is unstyled and blocking (§34).
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [conv, setConv] = useState<AiConversation | null>(null);
  const [list, setList] = useState<AiConversation[]>(() => loadConversations());
  const [convQuery, setConvQuery] = useState('');
  const [input, setInput] = useState(params.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [pending, setPending] = useState<Extract<ToolOutcome, { status: 'needs-confirmation' }> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = (id?: string | null) => {
    setList(loadConversations());
    if (id) setConv(getConversation(id));
  };

  // Start (or restore) a conversation for the chosen persona.
  useEffect(() => {
    if (convId) return;
    const existing = loadConversations().find((c) => c.module === persona);
    const c = existing ?? createConversation(persona);
    setConvId(c.id);
    setConv(c);
    setList(loadConversations());
  }, [persona, convId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages.length, stream]);

  const visible = useMemo(() => (convQuery.trim() ? searchConversations(convQuery) : list), [convQuery, list]);

  const send = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || busy || !convId) return;

    setInput('');
    setParams({}, { replace: true });
    appendMessage(convId, { role: 'user', content: query });
    refresh(convId);

    setBusy(true);
    setStream('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let acc = '';
    const res = await askAi({
      persona,
      query,
      history: historyFor(getConversation(convId), 6),
      signal: ctrl.signal,
      onToken: (t) => {
        acc += t;
        setStream(acc);
      },
    });

    abortRef.current = null;
    setStream('');
    setBusy(false);

    if (ctrl.signal.aborted) {
      if (acc.trim()) {
        appendMessage(convId, { role: 'assistant', content: acc + '\n\n_(stopped)_', runtime: res.runtime });
        refresh(convId);
      }
      return;
    }

    appendMessage(convId, {
      role: 'assistant',
      // A high-stakes clinical question gets one short verification reminder
      // appended — not a disclaimer on every single reply (§41).
      content: res.ok
        ? res.safetyNotice
          ? `${res.text}\n\n⚕️ ${res.safetyNotice}`
          : res.text
        : res.error ?? 'Something went wrong.',
      sources: res.ok ? res.sources : [],
      runtime: res.runtime,
      error: !res.ok,
    });
    refresh(convId);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  /** Ask to run a write tool — always via the confirmation gate. */
  const proposeTool = async (tool: string, args: any) => {
    const outcome = await runTool({ tool, args });
    if (outcome.status === 'needs-confirmation') setPending(outcome);
    else if (outcome.status === 'ok' && convId) {
      appendMessage(convId, { role: 'assistant', content: `✅ Done: ${tool}.` });
      refresh(convId);
    }
  };

  const confirmPending = async () => {
    if (!pending || !convId) return;
    const token = `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    grantConfirmation(token);
    const outcome = await runTool({ tool: pending.tool, args: pending.args }, token);
    appendMessage(convId, {
      role: 'assistant',
      content:
        outcome.status === 'ok'
          ? `✅ Saved to your records (${pending.tool}).`
          : `❌ Could not complete that: ${outcome.status === 'error' ? outcome.error : 'blocked'}`,
      error: outcome.status !== 'ok',
    });
    setPending(null);
    refresh(convId);
  };

  const newChat = () => {
    const c = createConversation(persona);
    setConvId(c.id);
    setConv(c);
    setList(loadConversations());
  };

  const exportChat = () => {
    if (!conv) return;
    const blob = new Blob([exportConversation(conv)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^\w\s-]/g, '').slice(0, 40) || 'conversation'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const def = PERSONAS[persona];

  return (
    <div className="space-y-4">
      {confirmDialog}

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming?.title.trim()) {
              renameConversation(renaming.id, renaming.title.trim());
              refresh(convId);
            }
            setRenaming(null);
          }}
        >
          <label className="label" htmlFor="conv-rename">Conversation name</label>
          <input
            id="conv-rename"
            className="input"
            value={renaming?.title ?? ''}
            onChange={(e) => setRenaming((r) => (r ? { ...r, title: e.target.value } : r))}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!renaming?.title.trim()}>Rename</button>
          </div>
        </form>
      </Modal>

      <PageHeader
        title="🤖 AI Workspace"
        subtitle="Your records are the source of truth — every answer shows what it used."
        action={<AiStatusDot persona={persona} compact />}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Conversation list */}
        <aside className="card space-y-2">
          <button className="btn-primary w-full" onClick={newChat}>
            ＋ New conversation
          </button>
          <input
            className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
            placeholder="Search conversations…"
            value={convQuery}
            onChange={(e) => setConvQuery(e.target.value)}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {visible.length === 0 && <p className="text-xs opacity-70">No conversations yet.</p>}
            {visible.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${
                  c.id === convId ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <button
                  className="flex-1 truncate text-left"
                  onClick={() => {
                    setConvId(c.id);
                    setConv(getConversation(c.id));
                    setPersona(c.module);
                  }}
                  title={c.title}
                >
                  {PERSONAS[c.module]?.icon ?? '💬'} {c.title}
                </button>
                <button
                  className="opacity-0 focus-ring group-hover:opacity-100 focus-visible:opacity-100"
                  title="Rename conversation"
                  aria-label={`Rename conversation ${c.title}`}
                  onClick={() => setRenaming({ id: c.id, title: c.title })}
                >
                  <span aria-hidden="true">✏️</span>
                </button>
                <button
                  className="opacity-0 focus-ring group-hover:opacity-100 focus-visible:opacity-100"
                  title="Delete conversation"
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete "${c.title}"?`,
                      message: 'This conversation and its messages will be removed.',
                      confirmLabel: 'Delete',
                      destructive: true,
                    });
                    if (!ok) return;
                    deleteConversation(c.id);
                    if (c.id === convId) {
                      setConvId(null);
                      setConv(null);
                    }
                    setList(loadConversations());
                  }}
                >
                  <span aria-hidden="true">🗑</span>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1 text-xs">
            <button className="underline" onClick={exportChat}>
              Export
            </button>
            <button
              className="underline"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Clear this conversation?',
                  message: 'All messages in this conversation will be removed. The conversation itself stays.',
                  confirmLabel: 'Clear messages',
                  destructive: true,
                });
                if (convId && ok) {
                  clearConversation(convId);
                  refresh(convId);
                }
              }}
            >
              Clear
            </button>
            <button className="underline" onClick={() => navigate('/settings/ai')}>
              AI Settings
            </button>
          </div>
        </aside>

        {/* Chat */}
        <section className="card flex min-h-[60vh] flex-col">
          {/* AI module selector (§21). The active module is stated in words as
              well as colour, so it is obvious and screen-reader friendly. */}
          <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="AI module">
            {(Object.keys(PERSONAS) as AiPersona[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={k === persona}
                className={`focus-ring rounded-full px-3 py-1 text-xs transition-colors ${
                  k === persona
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'
                }`}
                onClick={() => {
                  setPersona(k);
                  setConvId(null);
                }}
              >
                <span aria-hidden="true">{PERSONAS[k].icon}</span> {PERSONAS[k].label}
                {k === persona && <span className="sr-only"> (active)</span>}
              </button>
            ))}
          </div>

          {/* Active module + provider, stated plainly (§21, §22). */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {def.icon} {def.label}
            </span>
            <span className="opacity-75">
              {status.effective === 'local'
                ? '💻 Local AI'
                : status.effective === 'cloud'
                  ? '☁️ Cloud AI'
                  : '⚪ No provider'}
            </span>
            {status.effective !== 'none' && <span className="opacity-60">· {status.online ? 'Online' : 'Offline'}</span>}
          </div>

          <p className="mb-2 text-xs opacity-70">{def.system.slice(0, 160)}…</p>

          {status.effective === 'none' && (
            <div className="mb-2 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-sm">
              {status.reason ?? 'No AI provider is available.'}{' '}
              <button className="underline" onClick={() => navigate('/settings/ai')}>
                [ Open AI Settings ]
              </button>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto">
            {(conv?.messages.length ?? 0) === 0 && !stream && (
              <p className="py-8 text-center text-sm opacity-70">
                Ask about anything you have recorded — {def.label.toLowerCase()} is ready.
              </p>
            )}
            {conv?.messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-full whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : m.error
                        ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                        : 'bg-slate-100 dark:bg-slate-700'
                  }`}
                >
                  {m.content}
                  {m.runtime && m.role === 'assistant' && !m.error && (
                    <span className="ml-2 text-[10px] opacity-60">
                      {m.runtime === 'local' ? '💻 local' : '☁️ cloud'}
                    </span>
                  )}
                </div>
                {m.role === 'assistant' && !m.error && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    <button
                      className="opacity-60 underline hover:opacity-100 focus-ring"
                      onClick={() => void navigator.clipboard?.writeText(m.content)}
                      aria-label="Copy this answer"
                    >
                      Copy
                    </button>
                    {/* Regenerate re-asks the preceding question. */}
                    <button
                      className="opacity-60 underline hover:opacity-100 focus-ring"
                      onClick={() => {
                        const idx = conv?.messages.findIndex((x) => x.id === m.id) ?? -1;
                        const prior = idx > 0 ? conv?.messages[idx - 1] : null;
                        if (prior?.role === 'user') void send(prior.content);
                      }}
                      aria-label="Ask this question again"
                    >
                      Regenerate
                    </button>
                  </div>
                )}
                {m.role === 'assistant' && m.sources?.length ? <SourceList sources={m.sources} /> : null}
              </div>
            ))}
            {stream && (
              <div>
                <div className="inline-block max-w-full whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700">
                  {stream}
                  <span className="animate-pulse">▍</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Write-tool confirmation gate */}
          {pending && (
            <div className="mt-2 rounded border border-amber-400 bg-amber-400/10 p-3 text-sm">
              <p className="font-medium">
                {pending.destructive ? '⚠️ This will change your data.' : '✋ Confirmation needed'}
              </p>
              <p className="mt-1">{pending.label}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary" onClick={confirmPending}>
                  Confirm
                </button>
                <button className="underline" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <textarea
              className="flex-1 resize-none rounded border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
              rows={2}
              placeholder={`Ask ${def.label}…`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {busy ? (
              <button className="btn-primary" onClick={stop}>
                ■ Stop generating
              </button>
            ) : (
              <button className="btn-primary" onClick={() => void send()} disabled={!input.trim()}>
                Send
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button className="underline" onClick={() => void send('Quiz me on what I learned this week.')}>
              🎯 Quiz me
            </button>
            <button className="underline" onClick={() => void send('Analyse my learning this week.')}>
              📊 Analyze my week
            </button>
            <button className="underline" onClick={() => void send('Explain my learning and what I should revise next.')}>
              🧠 Explain my learning
            </button>
            <button
              className="underline"
              onClick={() => void proposeTool('createLearningNote', { title: 'AI note', content: stream || 'Note from AI conversation' })}
            >
              📝 Save as learning note
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
