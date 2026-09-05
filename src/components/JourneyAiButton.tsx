import { useNavigate } from 'react-router-dom';

/**
 * Floating 🤖 "Ask AI" button for PharmD Journey section pages.
 *
 * Tapping opens the shared AI (one brain, same memory as clinical AI) with a
 * pre-seeded prompt scoped to the current section so the assistant already
 * knows what the student wants help with. ?q= is picked up by AiChat which
 * auto-sends the prompt on mount. Defaults to m=career (broad Career/Portfolio
 * assistant) — pass `mode` to target a specific module (e.g. 'community',
 * 'j_experience', 'j_goals').
 */
export function JourneyAiButton({ section, prompt, mode = 'career' }: { section: string; prompt: string; mode?: string }) {
  const navigate = useNavigate();
  function go() {
    const params = new URLSearchParams();
    params.set('section', section);
    params.set('m', mode);
    params.set('q', prompt);
    navigate({ pathname: '/ai', search: '?' + params.toString() });
  }
  return (
    <button
      onClick={go}
      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:from-indigo-700 hover:to-brand-700 active:scale-95"
      title={`Ask AI about this ${section}`}
      aria-label={`Ask AI about this ${section}`}
    >
      <span className="text-sm leading-none">🤖</span>
      <span>Ask AI</span>
    </button>
  );
}
