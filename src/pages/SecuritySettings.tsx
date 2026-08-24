import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { Tabs } from '../components/ui/primitives';
import { useData } from '../stores/data';
import {
  autoLockMinutes,
  disableLock,
  enablePin,
  hasRecoveryQuestion,
  recoveryQuestion,
  setRecoveryQuestion,
  clearRecoveryQuestion,
  isLockEnabled,
  lockNow,
  setAutoLockMinutes,
} from '../services/appLock';
import { audit, auditLabel, clearAudit, recentAudit } from '../services/auditLog';
import { accountState } from '../services/authService';
import { isDesktop, secureStorageAvailable, storedKeyModules } from '../services/aiSecrets';
import { availability } from '../services/aiOrchestrator';

/**
 * ⚙️ SECURITY & PRIVACY (Phase 8 §40)
 *
 * Written for a pharmacy student, not a security engineer. Every claim here
 * is one the app can actually keep — where protection is limited, it says so
 * rather than implying more.
 */

type Tab = 'lock' | 'privacy' | 'ai' | 'data' | 'activity';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'lock', label: '🔒 App Lock' },
  { key: 'privacy', label: '☁️ Cloud Privacy' },
  { key: 'ai', label: '🤖 AI Privacy' },
  { key: 'data', label: '💾 Data' },
  { key: 'activity', label: '📋 Activity' },
];

export default function SecuritySettings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('lock');
  const [msg, setMsg] = useState('');

  return (
    <div className="space-y-4">
      <PageHeader
        title="🔐 Security & Privacy"
        subtitle="What is protected, what leaves this device, and what never does."
        action={
          <button className="btn-secondary" onClick={() => navigate('/settings')}>
            ← Settings
          </button>
        }
      />

      <Tabs items={TABS} active={tab} onChange={setTab} ariaLabel="Security and privacy sections" />

      {msg && <div className="card text-sm">{msg}</div>}

      {tab === 'lock' && <AppLockTab onMessage={setMsg} />}
      {tab === 'privacy' && <CloudPrivacyTab onMessage={setMsg} />}
      {tab === 'ai' && <AiPrivacyTab />}
      {tab === 'data' && <DataTab onMessage={setMsg} />}
      {tab === 'activity' && <ActivityTab onMessage={setMsg} />}
    </div>
  );
}

// ---- App Lock ----------------------------------------------------------

function AppLockTab({ onMessage }: { onMessage: (s: string) => void }) {
  const [enabled, setEnabled] = useState(isLockEnabled());
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [idle, setIdle] = useState(autoLockMinutes());
  const [error, setError] = useState('');

  const turnOn = async () => {
    setError('');
    if (pin !== confirm) {
      setError('The two PINs do not match.');
      return;
    }
    const res = await enablePin(pin);
    if (!res.ok) {
      setError(res.error ?? 'Could not set the PIN.');
      return;
    }
    audit('security.lock-enabled');
    setEnabled(true);
    setPin('');
    setConfirm('');
    onMessage('🔒 App Lock is on. You will be asked for your PIN when the app starts.');
  };

  const turnOff = async () => {
    setError('');
    const res = await disableLock(current);
    if (!res.ok) {
      setError(res.error ?? 'Incorrect PIN.');
      return;
    }
    audit('security.lock-disabled');
    setEnabled(false);
    setCurrent('');
    onMessage('App Lock is off.');
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="font-semibold">🔒 App Lock</h2>
        <p className="text-sm opacity-80">
          Ask for a PIN before showing your records. Useful on a shared or family computer.
        </p>
        <div className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
          <strong>What this does and does not do.</strong> App Lock stops someone casually opening the app and reading
          your notes. It does <em>not</em> encrypt the database on disk, so it will not stop someone with technical
          access to the computer. For that, use your operating system’s disk encryption and user account.
        </div>

        {!enabled ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Choose a PIN (4–12 digits)
                <input
                  type="password"
                  inputMode="numeric"
                  className="input mt-1 w-full"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  autoComplete="new-password"
                />
              </label>
              <label className="text-xs">
                Confirm PIN
                <input
                  type="password"
                  inputMode="numeric"
                  className="input mt-1 w-full"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
                  autoComplete="new-password"
                />
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary" disabled={!pin || !confirm} onClick={() => void turnOn()}>
              Turn on App Lock
            </button>
            <p className="text-xs opacity-70">
              Your PIN is never stored. Only a salted PBKDF2 hash is kept, using your browser’s built-in cryptography.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">✅ App Lock is on.</p>
            <label className="block text-xs">
              Lock automatically after this many minutes in the background
              <select
                className="input mt-1"
                value={idle}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  setIdle(v);
                  await setAutoLockMinutes(v);
                  audit('security.setting-changed', { detail: 'auto-lock interval' });
                }}
              >
                <option value={0}>Never</option>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </label>
            <button
              className="btn-secondary"
              onClick={() => {
                lockNow();
                window.location.reload();
              }}
            >
              Lock now
            </button>

            <RecoveryQuestionPanel onMessage={onMessage} />

            <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
              <label className="text-xs">
                Enter your PIN to turn App Lock off
                <input
                  type="password"
                  inputMode="numeric"
                  className="input mt-1 w-full max-w-48"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
              <button className="btn-secondary mt-2" disabled={!current} onClick={() => void turnOff()}>
                Turn off App Lock
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Security question for PIN recovery.
 *
 * Without this a forgotten PIN meant clearing app settings — recoverable, but
 * alarming and easy to get wrong. The answer is hashed with PBKDF2 and its own
 * salt, exactly like the PIN; it is never stored in readable form.
 */
function RecoveryQuestionPanel({ onMessage }: { onMessage: (m: string) => void }) {
  const [configured, setConfigured] = useState(hasRecoveryQuestion());
  const [existing, setExisting] = useState(recoveryQuestion());
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const SUGGESTIONS = [
    'What was the name of your first secondary school?',
    'What is the name of the ward where you had your first clinical rotation?',
    'What was the title of your first research project?',
    'Which town did your family live in when you were ten?',
  ];

  const save = async () => {
    setBusy(true);
    setError('');
    const res = await setRecoveryQuestion(question, answer, pin);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save the security question.');
      return;
    }
    audit('security.recovery-configured');
    setConfigured(true);
    setExisting(recoveryQuestion());
    setOpen(false);
    setQuestion('');
    setAnswer('');
    setPin('');
    onMessage('🔑 Security question saved. You can now reset a forgotten PIN from the lock screen.');
  };

  const clear = async () => {
    setBusy(true);
    setError('');
    const res = await clearRecoveryQuestion(pin);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not remove the security question.');
      return;
    }
    audit('security.recovery-cleared');
    setConfigured(false);
    setExisting(null);
    setPin('');
    onMessage('Security question removed. A forgotten PIN can no longer be reset on this device.');
  };

  return (
    <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
      <h3 className="text-sm font-semibold">🔑 Forgotten-PIN recovery</h3>

      {configured ? (
        <>
          <p className="mt-1 text-xs opacity-75">
            ✅ A security question is set. If you forget your PIN, choose <em>Forgot your PIN?</em> on the lock screen.
          </p>
          <p className="mt-1 rounded bg-slate-50 p-2 text-xs dark:bg-slate-700">{existing}</p>
        </>
      ) : (
        <p className="mt-1 text-xs opacity-75">
          No security question set. Add one so a forgotten PIN can be reset without clearing app settings.
        </p>
      )}

      {!open ? (
        <button className="btn-secondary mt-2 text-xs" onClick={() => setOpen(true)}>
          {configured ? 'Change or remove question' : 'Set a security question'}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          {!configured && (
            <div className="flex flex-wrap gap-1">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  className="focus-ring rounded-full bg-slate-100 px-2 py-1 text-[11px] hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                  onClick={() => setQuestion(q)}
                >
                  {q.length > 42 ? q.slice(0, 42) + '…' : q}
                </button>
              ))}
            </div>
          )}

          <label className="block text-xs">
            Question
            <input
              className="input mt-1 w-full"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Something only you can answer"
            />
          </label>

          <label className="block text-xs">
            Answer
            <input
              className="input mt-1 w-full"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Capitalisation and punctuation are ignored"
            />
          </label>

          <label className="block text-xs">
            Confirm with your current PIN
            <input
              type="password"
              inputMode="numeric"
              className="input mt-1 w-full max-w-48"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary text-xs"
              disabled={busy || !question.trim() || !answer.trim() || !pin}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save question'}
            </button>
            {configured && (
              <button className="btn-secondary text-xs !text-red-600" disabled={busy || !pin} onClick={() => void clear()}>
                Remove question
              </button>
            )}
            <button
              className="btn-secondary text-xs"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>

          <p className="text-[11px] opacity-70">
            Your answer is never stored — only a salted PBKDF2 hash, the same protection used for your PIN. Recovery
            sets a new PIN; it never reveals the old one, and it never deletes your records.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Cloud privacy -----------------------------------------------------

function CloudPrivacyTab({ onMessage }: { onMessage: (s: string) => void }) {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const account = accountState();

  const toggle = async (key: string, value: boolean, label: string) => {
    const s = useData.getState().settings;
    if (!s) return;
    await useData.getState().saveSettings({
      ...s,
      updatedAt: Date.now(),
      onlineAccount: { ...s.onlineAccount, [key]: value },
    });
    audit('security.setting-changed', { detail: label });
    onMessage(`${label} ${value ? 'enabled' : 'disabled'}.`);
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="font-semibold">☁️ Cloud privacy</h2>
        <p className="text-sm opacity-80">
          {account.signedIn
            ? `Signed in as ${account.email}. Only the categories below are uploaded.`
            : 'You are not signed in. Nothing leaves this device at all.'}
        </p>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.onlineAccount?.autoSync !== false}
            disabled={!account.signedIn}
            onChange={(e) => void toggle('autoSync', e.target.checked, 'Automatic cloud sync')}
          />
          <span>
            Automatic cloud sync
            <span className="block text-xs opacity-70">Your learning records sync between your devices.</span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.onlineAccount?.syncAiConversations === true}
            disabled={!account.signedIn}
            onChange={(e) => void toggle('syncAiConversations', e.target.checked, 'AI conversation sync')}
          />
          <span>
            Sync AI conversations
            <span className="block text-xs opacity-70">
              Off by default. Your chats stay on this device unless you turn this on.
            </span>
          </span>
        </label>

        <div className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
          <strong>Never uploaded, in any mode:</strong> your AI API keys, your session token, your App Lock PIN, and
          local AI model files.
        </div>

        <button className="btn-secondary" onClick={() => navigate('/sync')}>
          Open Sync Center
        </button>
      </div>

      <div className="card space-y-1 text-sm">
        <h3 className="font-semibold">Your cloud data is yours alone</h3>
        <p className="text-xs opacity-80">
          Every cloud request is authenticated, and the server decides which records you may see from your sign-in token
          — never from anything the app sends. Another account cannot read your records even if it knows their ids.
        </p>
      </div>
    </div>
  );
}

// ---- AI privacy --------------------------------------------------------

function AiPrivacyTab() {
  const [keyModules, setKeyModules] = useState<string[]>([]);
  const [secure, setSecure] = useState(false);
  const avail = useMemo(() => availability('general'), []);

  useEffect(() => {
    void storedKeyModules().then(setKeyModules);
    void secureStorageAvailable().then(setSecure);
  }, []);

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="font-semibold">🤖 AI privacy</h2>
        <p className="text-sm opacity-80">
          {avail.effective === 'local'
            ? '💻 Requests currently run on Local AI — nothing leaves this machine.'
            : avail.effective === 'cloud'
              ? '☁️ Requests currently run on a cloud provider.'
              : 'No AI provider is active right now.'}
        </p>

        <div className="rounded bg-slate-100 p-2 text-xs dark:bg-slate-700">
          <strong>What is sent to a cloud AI.</strong> Only the small set of records retrieved for the question you
          asked — never your whole database. With Local AI, nothing is sent anywhere.
        </div>

        <h3 className="pt-1 text-sm font-medium">Your API keys</h3>
        <p className="text-xs opacity-80">
          {secure
            ? '🔐 Stored in your operating system’s encrypted credential store. The app interface cannot read them back — they are decrypted only at the moment a request is sent.'
            : isDesktop()
              ? '⚠️ Secure OS storage is unavailable, so keys are kept in memory for this session only.'
              : '⚠️ In the browser build, keys are kept in memory for this session only. Install the desktop app for encrypted storage.'}
        </p>
        <p className="text-xs opacity-70">
          {keyModules.length
            ? `${keyModules.length} module${keyModules.length === 1 ? ' has' : 's have'} a stored key.`
            : 'No keys stored yet.'}
        </p>
      </div>

      <div className="card space-y-1 text-sm">
        <h3 className="font-semibold">🛡️ How the AI is kept honest</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs opacity-85">
          <li>Your records are given to the model as clearly-fenced <em>data</em>, never as instructions — so a note containing “ignore previous instructions” cannot re-programme it.</li>
          <li>When no records match, the AI is explicitly told not to claim it found something in your notes.</li>
          <li>High-stakes clinical topics get a short verification reminder rather than a disclaimer on every reply.</li>
          <li>Actions that would change your data always require your confirmation first.</li>
          <li>Outbound AI requests may only reach known provider domains over HTTPS.</li>
        </ul>
      </div>
    </div>
  );
}

// ---- Data --------------------------------------------------------------

function DataTab({ onMessage }: { onMessage: (s: string) => void }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <h2 className="font-semibold">💾 Your data</h2>
        <p className="text-sm opacity-80">
          Everything lives in a local database on this device first. The cloud is an optional copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={async () => {
              const { downloadBackup } = await import('../services/backup');
              downloadBackup();
              audit('data.exported', { detail: 'local backup file' });
              onMessage('Backup downloaded.');
            }}
          >
            Download a backup
          </button>
          <button className="btn-secondary" onClick={() => navigate('/sync')}>
            Backup & restore
          </button>
        </div>
        <p className="text-xs opacity-70">
          Exports never contain API keys, session tokens or your PIN.
        </p>
      </div>

      <div className="card space-y-1 text-sm">
        <h3 className="font-semibold">🚫 No patient records</h3>
        <p className="text-xs opacity-85">
          CLINICAL Rx has no patient database and no fields for names, phone numbers, addresses or hospital numbers. If
          you paste something that looks identifying into a note, the app warns you so you can remove it. Keep your
          clinical documentation de-identified.
        </p>
      </div>
    </div>
  );
}

// ---- Activity ----------------------------------------------------------

function ActivityTab({ onMessage }: { onMessage: (s: string) => void }) {
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => recentAudit(80), [tick]);

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">📋 Security activity</h2>
        <button
          className="btn-secondary"
          onClick={() => {
            clearAudit();
            setTick((t) => t + 1);
            onMessage('Activity log cleared.');
          }}
        >
          Clear log
        </button>
      </div>
      <p className="text-xs opacity-75">
        Recent sign-ins, syncs, backups and security changes. Stored on this device only. Passwords, keys, tokens and
        note contents are never recorded here.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm opacity-70">No activity recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto text-xs">
          {entries.map((e) => (
            <div key={e.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-200 py-1 dark:border-slate-700">
              <span>
                {e.ok === false ? '⚠️' : '•'} {auditLabel(e.event)}
                {e.detail ? <span className="opacity-70"> — {e.detail}</span> : null}
                {typeof e.count === 'number' ? <span className="opacity-70"> ({e.count})</span> : null}
              </span>
              <span className="opacity-60">{new Date(e.ts).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
