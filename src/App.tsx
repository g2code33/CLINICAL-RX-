import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useData } from './stores/data';
import { newSettings } from './services/defaults';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { ClinicalDays } from './pages/ClinicalDays';
import { Diseases } from './pages/Diseases';
import { Medicines } from './pages/Medicines';
import { Investigations } from './pages/Investigations';
import { Questions } from './pages/Questions';
import { Revision } from './pages/Revision';
import { Progress } from './pages/Progress';
import { Bundles } from './pages/Bundles';
import { AiChat } from './pages/AiChat';
import { SettingsPage } from './pages/Settings';

export default function App() {
  const ready = useData((s) => s.ready);
  const init = useData((s) => s.init);
  const profile = useData((s) => s.profile);

  useEffect(() => {
    init();
  }, [init]);

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
          <div className="mb-3 text-4xl">💊</div>
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
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clinical" element={<ClinicalDays />} />
        <Route path="/diseases" element={<Diseases />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/investigations" element={<Investigations />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/revision" element={<Revision />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/bundles" element={<Bundles />} />
        <Route path="/ai" element={<AiChat />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
