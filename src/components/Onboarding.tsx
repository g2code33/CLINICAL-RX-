import { useState } from 'react';
import { useData } from '../stores/data';
import { newProfile } from '../services/defaults';

export function Onboarding() {
  const saveProfile = useData((s) => s.saveProfile);
  const [username, setUsername] = useState('');
  const [programme, setProgramme] = useState('Pharmacy');
  const [level, setLevel] = useState('200');
  const [site, setSite] = useState('Afrancho Polyclinic');

  const submit = async () => {
    const p = newProfile(username.trim() || 'Student');
    p.programme = programme;
    p.level = level;
    p.site = site;
    await saveProfile(p);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-slate-900 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-800">
        <div className="mb-6 text-center">
          <img src="./v1.PNG" alt="CLINICAL Rx logo" className="mx-auto h-20 w-20 rounded-2xl object-cover shadow-lg" />
          <h1 className="mt-3 text-2xl font-extrabold text-brand-700 dark:text-brand-300">CLINICAL Rx</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your personal clinical companion — works fully offline.
          </p>
        </div>

        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Create a local profile to begin. No account, no internet, no email required.
        </p>

        <div className="space-y-3">
          <div>
            <label className="label">Name / Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Calcitonin" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Programme</label>
              <select className="input" value={programme} onChange={(e) => setProgramme(e.target.value)}>
                <option>Pharmacy</option>
                <option>Medicine</option>
                <option>Nursing</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="label">Level</label>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option>100</option>
                <option>200</option>
                <option>300</option>
                <option>400</option>
                <option>500</option>
                <option>600</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Clinical site / rotation</label>
            <input className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="Afrancho Polyclinic" />
          </div>
          <button className="btn-primary w-full !py-2.5" onClick={submit}>
            Create Local Profile →
          </button>
        </div>
      </div>
    </div>
  );
}
