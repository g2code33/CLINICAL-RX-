import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useData } from './stores/data';
import { newSettings } from './services/defaults';
import { setupAutoAndReconnect } from './services/autoBundle';
import { lockState, startAutoLock } from './services/appLock';
import { shouldRemind, computeStreak } from './services/streaks';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { useUi } from './stores/ui';
import { Layout } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { ClinicalDays } from './pages/ClinicalDays';
import { WardRounds } from './pages/WardRounds';
import { Journey } from './pages/Journey';
import { Archive } from './pages/Archive';
import { Courses } from './pages/Courses';
import { LearningOverview } from './pages/LearningOverview';
import { LearningNotes } from './pages/LearningNotes';
import { Favorites } from './pages/Favorites';
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
import AiWorkspace from './pages/AiWorkspace';
import AiSettings from './pages/AiSettings';
import SyncCenter from './pages/SyncCenter';
import SecuritySettings from './pages/SecuritySettings';
import { LockScreen } from './components/LockScreen';
// Phase 6 — PharmD Journey + Professional Career Engine
import JourneyHome, { JourneyTimeline } from './pages/journey/JourneyHome';
import { AcademicArchive, PortfolioPage } from './pages/journey/ArchiveAndPortfolio';
import {
  AchievementsPage,
  CertificationsPage,
  ClinicalExperiencePage,
  GoalsPage,
  LeadershipPage,
  ProjectsPage,
  ResearchPage,
  SkillsPage,
} from './pages/journey/ProfessionalSections';
import { SettingsPage } from './pages/Settings';
import { ResetPassword } from './pages/ResetPassword';
import { AuthPage } from './pages/Auth';
import { AdminPage } from './pages/Admin';

export default function App() {
  const ready = useData((s) => s.ready);
  const init = useData((s) => s.init);
  const profile = useData((s) => s.profile);

  useEffect(() => { init(); }, [init]);

  // Background sync: batched, backed off, and entirely optional (§18).
  useEffect(() => {
    if (!ready) return;
    let stop = () => {};
    import('./services/syncScheduler')
      .then((m) => {
        m.startSyncScheduler();
        stop = m.stopSyncScheduler;
      })
      .catch(() => {});
    // Give every installation a stable identity, independent of any account.
    import('./services/authService').then((m) => m.ensureDeviceIdentity()).catch(() => {});
    return () => stop();
  }, [ready]);

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

  // Academic journey backfill: profiles created before the journey existed
  // get one built from their level, so the app is never in a broken state.
  useEffect(() => {
    if (!ready) return;
    import('./services/academic').then((m) => m.ensureJourney()).catch(() => {});
  }, [ready]);

  // Auto-backup: if scheduled and due, download + stamp.
  useEffect(() => {
    if (!ready) return;
    import('./services/backup').then((m) => m.runAutoBackupCheck()).catch(() => {});
  }, [ready]);

  // Reminder watcher: fires desktop/system notifications for due reminders.
  useEffect(() => {
    if (!ready) return;
    const stop = import('./services/reminders').then((m) => m.startReminderWatcher());
    let cancelled = false;
    return () => { cancelled = true; stop.then((s) => s()).catch(() => {}); };
  }, [ready]);

  // Queued AI tasks: retry when the network is back (and on startup).
  useEffect(() => {
    if (!ready) return;
    import('./services/aiTaskQueue').then((m) => m.processPendingAiTasks()).catch(() => {});
    // Ward-round analyses queued while offline/without AI are retried here too.
    import('./services/wardAi').then((m) => m.processPendingWardAnalyses()).catch(() => {});
    const onOnline = () => {
      import('./services/aiTaskQueue').then((m) => m.processPendingAiTasks()).catch(() => {});
      import('./services/wardAi').then((m) => m.processPendingWardAnalyses()).catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [ready]);

  // Auto weekly quizzes: generate a quiz for every completed week that
  // doesn't have one yet (appears under 📅 Weekly quizzes in the Quiz tab).
  useEffect(() => {
    if (!ready) return;
    import('./services/weeklyQuiz').then((m) => m.runAutoWeeklyQuizzes()).catch(() => {});
  }, [ready]);

  const settings = useData((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const mode = settings?.appearance ?? 'system'; const dark = mode === 'dark' || (mode === 'system' && mq.matches); root.classList.toggle('dark', dark); };
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [settings]);

  useEffect(() => { if (useData.getState().profile && !useData.getState().settings) { useData.getState().saveSettings(newSettings()); } }, [useData((s) => s.profile)]);

  // App Lock state. Evaluated once at start-up; the lock screen flips it.
  const [locked, setLocked] = useState(() => {
    try {
      return lockState().locked;
    } catch {
      return false; // a broken lock config must never brick the app
    }
  });

  // Re-lock after the app has been in the background too long.
  useEffect(() => {
    const stop = startAutoLock();
    const onVis = () => {
      if (!document.hidden) {
        try {
          if (lockState().locked) setLocked(true);
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (!ready) {
    return (<div className="flex h-screen items-center justify-center bg-slate-900 text-slate-100"><div className="text-center"><img src="./v2.PNG" alt="CLINICAL Rx logo" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" /><div className="animate-pulse text-lg font-semibold">CLINICAL Rx</div><div className="text-sm text-slate-400">Starting your clinical companion…</div></div></div>);
  }
  // 🔒 APP LOCK (Phase 8 §15). Rendered before the router, so no private
  // record can reach the DOM while the app is locked.
  if (locked) {
    return <LockScreen onUnlocked={() => setLocked(false)} />;
  }
  if (!profile) { return <Onboarding />; }

  return (
    <Layout>
      <KeyboardShortcuts />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/journey" element={<JourneyHome />} />
        <Route path="/journey/setup" element={<Journey />} />
        <Route path="/journey/timeline" element={<JourneyTimeline />} />
        <Route path="/journey/archive" element={<AcademicArchive />} />
        <Route path="/journey/portfolio" element={<PortfolioPage />} />
        <Route path="/journey/clinical-experience" element={<ClinicalExperiencePage />} />
        <Route path="/journey/skills" element={<SkillsPage />} />
        <Route path="/journey/projects" element={<ProjectsPage />} />
        <Route path="/journey/research" element={<ResearchPage />} />
        <Route path="/journey/leadership" element={<LeadershipPage />} />
        <Route path="/journey/achievements" element={<AchievementsPage />} />
        <Route path="/journey/certifications" element={<CertificationsPage />} />
        <Route path="/journey/goals" element={<GoalsPage />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/learning" element={<LearningOverview />} />
        <Route path="/notes" element={<LearningNotes />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/clinical" element={<ClinicalDays />} />
        <Route path="/ward-rounds" element={<WardRounds />} />
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
        <Route path="/ai" element={<AiWorkspace />} />
        <Route path="/ai-capture" element={<AiChat />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/ai" element={<AiSettings />} />
        <Route path="/sync" element={<SyncCenter />} />
        <Route path="/settings/security" element={<SecuritySettings />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
