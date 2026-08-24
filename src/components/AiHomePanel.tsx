import { useNavigate } from 'react-router-dom';
import { useUi } from '../stores/ui';
import { useAiStatus } from './AiStatus';

/**
 * 🏠 AI HOME PANEL
 *
 * The dashboard entry point to the AI. Shows honest status and the six quick
 * actions, each of which opens the AI workspace with a prepared prompt rather
 * than doing anything behind the user's back.
 */

const ACTIONS: Array<{ id: string; icon: string; label: string; prompt: string; persona?: string }> = [
  { id: 'ask', icon: '💬', label: 'Ask AI', prompt: '' },
  { id: 'search', icon: '🔎', label: 'Search with AI', prompt: '', persona: 'search' },
  { id: 'quiz', icon: '🎯', label: 'Quiz Me', prompt: 'Quiz me on what I learned this week.', persona: 'revision' },
  { id: 'week', icon: '📊', label: 'Analyze My Week', prompt: 'Analyse my learning this week.', persona: 'bundler' },
  { id: 'explain', icon: '🧠', label: 'Explain My Learning', prompt: 'Explain my learning back to me and tell me what to revise next.', persona: 'revision' },
  { id: 'help', icon: '❓', label: 'Help Me With a Question', prompt: 'Help me work through a question. I will paste it next.', persona: 'clinical' },
];

export function AiHomePanel() {
  const navigate = useNavigate();
  const s = useAiStatus('general');
  const setSearchOpen = useUi((u) => u.setSearchOpen);

  const light = s.connecting ? '🟡' : s.online ? '🟢' : '🔴';
  const statusWord = s.connecting ? 'Connecting…' : s.online ? 'Online' : 'Offline';

  const run = (a: (typeof ACTIONS)[number]) => {
    if (a.id === 'search') {
      // Deterministic search always works, with or without AI.
      setSearchOpen(true);
      return;
    }
    const params = new URLSearchParams();
    if (a.prompt) params.set('q', a.prompt);
    if (a.persona) params.set('m', a.persona);
    navigate(`/ai${params.toString() ? `?${params}` : ''}`);
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">🤖 AI Assistant</h2>
        <span className="text-xs opacity-80" title={s.reason ?? ''}>
          {light} {statusWord}
        </span>
      </div>

      <p className="mt-1 text-sm opacity-80">
        💻 Local AI: {s.local ? 'Available' : 'Not Available'} · ☁️ Cloud AI: {s.cloud ? 'Available' : 'Not Configured'}
      </p>

      {s.effective === 'none' && !s.connecting && (
        <div className="mt-2 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-sm">
          {s.reason ?? 'No AI provider is available.'}{' '}
          <button className="underline" onClick={() => navigate('/settings/ai')}>
            Open AI Settings
          </button>
          <div className="mt-1 text-xs opacity-80">Search and all your records keep working normally without AI.</div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            className="rounded border border-slate-300/40 p-2 text-left text-sm transition-colors hover:border-brand-400 dark:border-slate-600/60"
            onClick={() => run(a)}
          >
            <span className="mr-1">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
