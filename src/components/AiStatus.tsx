import { useEffect, useState } from 'react';
import { availability, refreshKeyCache, type AiPersona } from '../services/aiOrchestrator';
import { detectLocalAi, installLocalProvider, localModels, localRuntime } from '../services/localAi';

/**
 * 🟢🟡🔴 AI CONNECTIVITY INDICATOR
 *
 * Tells the truth about what AI can actually do right now, so the student is
 * never guessing why a reply did or didn't happen.
 */

export interface AiStatusSnapshot {
  online: boolean;
  cloud: boolean;
  local: boolean;
  effective: 'cloud' | 'local' | 'none';
  reason?: string;
  localLabel?: string;
  localModelCount: number;
  connecting: boolean;
}

/** Shared hook — polls cheaply and reacts to online/offline events. */
export function useAiStatus(persona: AiPersona = 'general'): AiStatusSnapshot {
  const [snap, setSnap] = useState<AiStatusSnapshot>(() => ({
    ...availability(persona),
    localModelCount: 0,
    connecting: true,
  }));

  useEffect(() => {
    let alive = true;

    const refresh = async (probe = false) => {
      if (probe) {
        installLocalProvider();
        await detectLocalAi(true);
        await refreshKeyCache();
      }
      if (!alive) return;
      const rt = localRuntime();
      setSnap({
        ...availability(persona),
        localLabel: rt?.label,
        localModelCount: localModels().length,
        connecting: false,
      });
    };

    void refresh(true);
    const timer = setInterval(() => void refresh(false), 15_000);
    const onNet = () => void refresh(true);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, [persona]);

  return snap;
}

export function AiStatusDot({ persona = 'general' as AiPersona, compact = false }) {
  const s = useAiStatus(persona);
  const light = s.connecting ? '🟡' : s.online ? '🟢' : '🔴';
  const word = s.connecting ? 'Connecting' : s.online ? 'Online' : 'Offline';

  if (compact) {
    return (
      <span title={`${word} · ${s.effective === 'none' ? 'AI unavailable' : `AI via ${s.effective}`}`}>
        {light} {s.effective === 'local' ? '💻' : s.effective === 'cloud' ? '☁️' : ''}
      </span>
    );
  }

  return (
    <div className="ai-status" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <div>
        {light} <strong>{word}</strong>
      </div>
      <div style={{ opacity: 0.85 }}>
        💻 Local AI: {s.local ? `Available${s.localLabel ? ` (${s.localLabel}, ${s.localModelCount} model${s.localModelCount === 1 ? '' : 's'})` : ''}` : 'Not Available'}
      </div>
      <div style={{ opacity: 0.85 }}>☁️ Cloud AI: {s.cloud ? 'Available' : 'Not Configured'}</div>
      {s.reason && <div style={{ opacity: 0.75, fontStyle: 'italic' }}>{s.reason}</div>}
    </div>
  );
}
