import { useState, useRef, useEffect } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from '../components/ui';
import { aiChat } from '../services/ai';

const SHORTCUTS = [
  '🧑‍🏫 Explain something',
  '🩺 Analyze my learning notes',
  '❓ Generate questions',
  '📚 Help me revise',
  '📝 Organize my notes',
  '📦 Summarize today',
  '🔍 Find my knowledge gaps',
];

interface Msg { role: 'user' | 'ai'; text: string; }

export function AiChat() {
  const settings = useData((s) => s.settings);
  const chatCfg = settings?.ai?.['chat'];
  const setStatus = useData((s) => s.setStatus);
  const profile = useData((s) => s.profile);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, thinking]);

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || thinking) return;
    if (!chatCfg?.apiKey) {
      setStatus('⚠️ Add an API key in Settings → AI → Clinical Chat to use AI.');
      return;
    }
    setMsgs((m) => [...m, { role: 'user', text: prompt }]);
    setInput('');
    setThinking(true);
    setStatus('🤖 Clinical AI is thinking…');

    const state = useData.getState();
    const context = `Student profile: ${profile?.programme} Level ${profile?.level} at ${profile?.site}. Recent data: ${state.days.length} clinical days, ${state.diseases.length} conditions, ${state.medicines.length} medicines, ${state.questions.filter(q => q.status === 'open').length} open questions.`;

    const res = await aiChat(
      chatCfg,
      `You are CLINICAL Rx, a clinical learning assistant for a Level 200 pharmacy student. Answer at their level (simple first, step-by-step, pharmacy-focused). Context: ${context}. AI is a learning aid, not a replacement for clinical supervisors or pharmacists.`,
      prompt
    );
    setThinking(false);
    if (res.ok) {
      setMsgs((m) => [...m, { role: 'ai', text: res.text }]);
      setStatus('✓ AI responded');
    } else {
      setMsgs((m) => [...m, { role: 'ai', text: '⚠️ ' + res.error }]);
      setStatus('⚠️ AI error');
    }
  }

  if (!chatCfg?.enabled) {
    return <EmptyState icon="🤖" title="AI is disabled" hint="Enable the Clinical Chat module in Settings → AI to use it." />;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ask Clinical AI" subtitle="Your learning assistant — connects online using the module configured in Settings." />
      <div className="card flex min-h-0 flex-1 flex-col">
        {msgs.length === 0 ? (
          <div className="flex-1 space-y-2 p-4">
            <p className="mb-2 text-sm text-slate-500">What do you want to do?</p>
            {SHORTCUTS.map((s) => (
              <button key={s} className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600" onClick={() => send(s.replace(/^\S+\s/, ''))}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && <div className="text-sm text-slate-400 animate-pulse">🤖 Clinical AI is thinking…</div>}
            <div ref={bottomRef} />
          </div>
        )}
        <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
          <input
            className="input flex-1"
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={thinking}
          />
          <button className="btn-primary" onClick={() => send()} disabled={thinking}>➤</button>
        </div>
      </div>
    </div>
  );
}
