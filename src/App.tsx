import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useData } from './stores/data';
import { newSettings } from './services/defaults';
import { setupAutoAndReconnect } from './services/autoBundle';
import { shouldRemind, computeStreak } from './services/streaks';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { useUi } from './stores/ui';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { ClinicalDays } from './pages/ClinicalDays';
import { CalendarPage } from './pages/Calendar';
import { Diseases } from './pages/Diseases';
import { Medicines } from './pages/Medicines';
import { Investigations } from './pages/Investigations';
import { Questions } from './pages/Questions';
import { Revision } from './pages/Revision';
import { Quiz } from './pages/Quiz';
import { QuestionBank } from './pages/QuestionBank';
import { Progress } from './pages/Progress';
import { Bundles } from './pages/Bundles';
import { AiChat } from './pages/AiChat';
import { SettingsPage } from './pages/Settings';
import { ResetPassword } from './pages/ResetPassword';
import { AuthPage } from './pages/Auth';
import { AdminPage } from './pages/Admin';

export default function App() {
  const ready = useData((s) => s.ready);
  const init = useData((s) => s.init);
  const profile = useData((s) => s.profile);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (ready) { const cleanup = setupAutoAndReconnect(); return cleanup; }
  }, [ready]);

  // When a cloud account is connected, refresh the AI config (API keys
  // included) at startup so a login on another device shows up here too.
  useEffect(() => {
    if (!ready) return;
    const acct = useData.getState().settings?.onlineAccount;
    if (acct?.connected && acct.token) {
      import('./services/aiConfigSync').then((m) => m.syncAiConfig()).catch(() => {});
    }
  }, [ready]);

  // Daily reminder: if today isn't logged yet and it's late, nudge the user.
  useEffect(() => {
    if (!ready) return;
    const days = useData.getState().days;
    if (!shouldRemind(days)) return;
    const s = computeStreak(days);
    const msg = s.loggedYesterday
      ? `Don't break your ${s.current + 1}-day streak — log today's clinical day!`
      : 'You haven\'t logged today yet. Capture your clinical day in a minute.';
    useData.getState().setStatus('🔔 ' + msg);
    // Browser notification (best-effort, only if permission was granted).
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('CLINICAL Rx', { body: msg }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const settings = useData((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const mode = settings?.appearance ?? 'system'; const dark = mode === 'dark' || (mode === 'system' && mq.matches); root.classList.toggle('dark', dark); };
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [settings]);

  useEffect(() => { if (useData.getState().profile && !useData.getState().settings) { useData.getState().saveSettings(newSettings()); } }, [useData((s) => s.profile)]);

  if (!ready) {
    return (<div className="flex h-screen items-center justify-center bg-slate-900 text-slate-100"><div className="text-center"><img src="./v2.PNG" alt="CLINICAL Rx logo" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" /><div className="animate-pulse text-lg font-semibold">CLINICAL Rx</div><div className="text-sm text-slate-400">Starting your clinical companion…</div></div></div>);
  }
  if (!profile) { return <Onboarding />; }

  return (
    <Layout>
      <KeyboardShortcuts />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clinical" element={<ClinicalDays />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/diseases" element={<Diseases />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/investigations" element={<Investigations />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/revision" element={<Revision />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/question-bank" element={<QuestionBank />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/bundles" element={<Bundles />} />
        <Route path="/ai" element={<AiChat />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
