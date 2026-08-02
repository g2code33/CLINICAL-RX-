import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useData } from './stores/data';
import { newSettings } from './services/defaults';
import { setupAutoAndReconnect } from './services/autoBundle';
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
import { Progress } from './pages/Progress';
import { Bundles } from './pages/Bundles';
import { AiChat } from './pages/AiChat';
import { SettingsPage } from './pages/Settings';
import { ResetPassword } from './pages/ResetPassword';

export default function App() {
  const ready = useData((s) => s.ready);
  const init = useData((s) => s.init);
  const profile = useData((s) => s.profile);

  useEffect(() => {
    init();
  }, [init]);

  // Once data is loaded, trigger automatic bundles for completed days/weeks and
  // process any pending-AI bundles when the user is back online.
  useEffect(() => {
    if (ready) {
      const cleanup = setupAutoAndReconnect();
      return cleanup;
    }
  }, [ready]);

  const settings = useData((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const mode = settings?.appearance ?? 'system';
      const dark = mode === 'dark' || (mode === 'system' && mq.matches);
      root.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings]);

  // Ensure settings exist once a profile is created.
  useEffect(() => {
    if (useData.getState().profile && !useData.getState().settings) {
      useData.getState().saveSettings(newSettings());
    }
  }, [useData((s) => s.profile)]);



  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center">
          <img src="./v1.PNG" alt="CLINICAL Rx logo" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" />
          <div className="animate-pulse text-lg font-semibold">CLINICAL Rx</div>
          <div className="text-sm text-slate-400">Starting your clinical companion…</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Onboarding />;
  }

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
        <Route path="/progress" element={<Progress />} />
        <Route path="/bundles" element={<Bundles />} />
        <Route path="/ai" element={<AiChat />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
