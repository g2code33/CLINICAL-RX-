import { useState } from 'react';
import { useData } from '../stores/data';
import { newProfile } from '../services/defaults';
import { bootstrapJourney, currentAcademicYear } from '../services/academic';

/**
 * First-run experience. Creates a LOCAL profile and the academic journey.
 * No email, password, cloud account or API key is ever requested here — the
 * app is fully usable the moment this form is submitted, with no internet.
 */
export function Onboarding() {
  const saveProfile = useData((s) => s.saveProfile);
  const [step, setStep] = useState<'welcome' | 'profile'>('welcome');
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState('');
  const [programme, setProgramme] = useState('Pharmacy');
  const [institution, setInstitution] = useState('');
  const [level, setLevel] = useState('200');
  const [academicYear, setAcademicYear] = useState(currentAcademicYear());
  const [semester, setSemester] = useState('Semester 1');
  const [site, setSite] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const p = newProfile(username.trim() || 'Student');
      p.programme = programme;
      p.level = level;
      p.site = site.trim() || institution.trim() || 'Clinical site';
      p.institution = institution.trim();
      p.academicYear = academicYear.trim() || currentAcademicYear();

      // Build the longitudinal journey (all levels, current one flagged).
      const { stage, period } = await bootstrapJourney({
        level,
        academicYear: p.academicYear,
        programme,
        institution: p.institution,
        semesterName: semester,
      });
      p.currentStageId = stage.id;
      p.currentPeriodId = period?.id;

      await saveProfile(p);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-slate-900 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
        <div className="mb-6 text-center">
          <img src="./v2.PNG" alt="CLINICAL Rx logo" className="mx-auto h-20 w-20 rounded-2xl object-cover shadow-lg" />
          <h1 className="mt-3 text-2xl font-extrabold text-brand-700 dark:text-brand-300">
            {step === 'welcome' ? 'WELCOME TO CLINICAL Rx' : 'Create your local profile'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your personal clinical learning and PharmD journey companion.
          </p>
        </div>

        {step === 'welcome' ? (
          <div className="space-y-4">
            <div className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex gap-2.5">
                <span>📴</span>
                <span>
                  <strong>Works fully offline.</strong> No account, no email, no internet needed.
                </span>
              </div>
              <div className="flex gap-2.5">
                <span>🎓</span>
                <span>
                  <strong>Grows with you</strong> from your current level through to professional practice.
                </span>
              </div>
              <div className="flex gap-2.5">
                <span>🔒</span>
                <span>
                  <strong>Your data stays yours</strong> — stored locally on this device and exportable any time.
                </span>
              </div>
            </div>
            <button className="btn-primary w-full !py-2.5" onClick={() => setStep('profile')}>
              Get Started →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input
                autoFocus
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Programme</label>
                <select className="input" value={programme} onChange={(e) => setProgramme(e.target.value)}>
                  <option>Pharmacy</option>
                  <option>PharmD</option>
                  <option>Medicine</option>
                  <option>Nursing</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="label">Current level</label>
                <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                  {['100', '200', '300', '400', '500', '600'].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Institution</label>
              <input
                className="input"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. KNUST"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Academic year</label>
                <input
                  className="input"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="2026/2027"
                />
              </div>
              <div>
                <label className="label">Semester</label>
                <select className="input" value={semester} onChange={(e) => setSemester(e.target.value)}>
                  <option>Semester 1</option>
                  <option>Semester 2</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Clinical site / rotation (optional)</label>
              <input
                className="input"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="e.g. Afrancho Polyclinic"
              />
            </div>

            <button className="btn-primary w-full !py-2.5" onClick={submit} disabled={busy}>
              {busy ? 'Setting up…' : 'Get Started →'}
            </button>
            <button className="btn-ghost w-full !py-1.5 text-xs" onClick={() => setStep('welcome')} disabled={busy}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
