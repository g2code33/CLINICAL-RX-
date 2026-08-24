import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { syncClient } from '../services/syncClient';
import { PasswordInput } from '../components/ui';
import { Modal } from '../components/Modal';
import { confirmAction } from '../components/ui/globalConfirm';
import { IconManager } from '../components/admin/IconManager';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  hasSecurityQuestion: boolean;
  securityQuestion?: string | null;
  isAdmin: boolean;
  hasPassword?: boolean;
}

export function AdminPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'users' | 'icons'>('users');
  const [adminEmail, setAdminEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const token = settings?.onlineAccount?.token ?? '';
  const bUrl = settings?.onlineAccount?.backendUrl ?? '';

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true); setMsg('');
    const res = await syncClient.listUsers(bUrl, token);
    if (!res.ok) { setMsg('⚠️ ' + (res.error || 'Failed to load users. Are you an admin?')); setLoading(false); return; }
    setUsers(res.data.users || []);
    setAdminEmail(res.data.adminEmail || '');
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, query]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.isAdmin).length;
    const withSec = users.filter((u) => u.hasSecurityQuestion).length;
    return { total, admins, withSec };
  }, [users]);

  async function doReset(email: string, pw: string) {
    if (!email || !pw) return;
    setBusy(true); setMsg('');
    const res = await syncClient.adminResetPassword(bUrl, token, email, pw);
    setMsg(res.ok ? `✓ Password reset for ${email}` : '⚠️ ' + (res.error || 'Failed'));
    setBusy(false);
    if (res.ok) { setResetEmail(''); setResetPw(''); setResetTarget(null); }
  }

  async function doDelete(email: string) {
    setBusy(true); setMsg('');
    const res = await syncClient.adminDeleteUser(bUrl, token, email);
    setMsg(res.ok ? `✓ Deleted ${email}` : '⚠️ ' + (res.error || 'Failed'));
    setBusy(false);
    if (res.ok) { setDeleteTarget(null); setDetail(null); loadUsers(); }
  }

  async function doChangeEmail(email: string, to: string) {
    if (!email || !to) return;
    setBusy(true); setMsg('');
    const res = await syncClient.adminChangeEmail(bUrl, token, email, to);
    setMsg(res.ok ? `✓ Email changed to ${to}` : '⚠️ ' + (res.error || 'Failed'));
    setBusy(false);
    if (res.ok) { setDetail(null); loadUsers(); }
  }

  async function doRename(email: string, name: string) {
    if (!email || !name) return;
    setBusy(true); setMsg('');
    const res = await syncClient.adminUpdateName(bUrl, token, email, name);
    setMsg(res.ok ? `✓ Name updated` : '⚠️ ' + (res.error || 'Failed'));
    setBusy(false);
    if (res.ok) { setDetail(null); loadUsers(); }
  }

  async function doClearSecurity(email: string) {
    if (!(await confirmAction({
      title: 'Clear this security question?',
      message: 'The user will need to set a new security question before they can use it to reset their password.',
      confirmLabel: 'Clear question',
      destructive: true,
    }))) return;
    setBusy(true); setMsg('');
    const res = await syncClient.adminClearSecurity(bUrl, token, email);
    setMsg(res.ok ? `✓ Security question cleared` : '⚠️ ' + (res.error || 'Failed'));
    setBusy(false);
    if (res.ok) { setDetail(null); loadUsers(); }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🛡️ Admin Panel</h1>
          <p className="text-sm text-slate-400">
            {tab === 'users'
              ? `Admin: ${adminEmail || 'not configured'}`
              : 'Appearance customisation for this device'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'users' && token && (
            <button className="btn-secondary" onClick={loadUsers}>🔄 Refresh</button>
          )}
          <button className="btn-ghost" onClick={() => navigate('/settings')}>← Settings</button>
        </div>
      </div>

      {/* Admin sections. Icons are a LOCAL tool, so it stays usable without an
          account — only user management needs a signed-in admin. */}
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Admin sections">
        {([
          { key: 'users' as const, icon: '👥', label: 'Users' },
          { key: 'icons' as const, icon: '🎨', label: 'Icons & emojis' },
        ]).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
            }`}
            onClick={() => setTab(t.key)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700">{msg}</div>}

      {tab === 'icons' && <IconManager />}

      {tab === 'users' && !token && (
        <div className="card text-center">
          <p className="text-sm text-slate-400">Sign in with an admin account to manage users.</p>
          <button className="btn-primary mt-3" onClick={() => navigate('/auth')}>Go to Sign In</button>
        </div>
      )}

      {tab === 'users' && token && (
      <>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="card !p-4 text-center">
          <div className="text-2xl font-extrabold text-brand-600">{stats.total}</div>
          <div className="text-xs text-slate-400">Total users</div>
        </div>
        <div className="card !p-4 text-center">
          <div className="text-2xl font-extrabold">{stats.admins}</div>
          <div className="text-xs text-slate-400">Admins</div>
        </div>
        <div className="card !p-4 text-center">
          <div className="text-2xl font-extrabold text-green-600">{stats.withSec}</div>
          <div className="text-xs text-slate-400">Have security Q</div>
        </div>
      </div>

      {/* User list */}
      <div className="card mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">👥 Registered Users ({filtered.length})</h2>
          <input className="input !w-auto !py-1 text-sm" placeholder="🔍 Search name / email…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-400 dark:border-slate-700">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Created</th>
                  <th className="pb-2">Security Q</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    onClick={() => { setDetail(u); setNewEmail(''); setNewName(u.name || ''); }}
                  >
                    <td className="py-2 font-medium">{u.name}</td>
                    <td className="py-2 text-slate-400">{u.email}</td>
                    <td className="py-2 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-2" title={u.securityQuestion || ''}>{u.hasSecurityQuestion ? '✅' : '—'}</td>
                    <td className="py-2">{u.isAdmin ? '👑 Admin' : 'User'}</td>
                    <td className="py-2 text-right">
                      <span className="text-xs text-brand-600 dark:text-brand-400">Manage →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset password (form) */}
      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">🔑 Reset User Password</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">User email</label><input className="input" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="user@example.com" /></div>
          <div><label className="label">New password</label><PasswordInput value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="At least 6 characters" /></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={busy || !resetEmail || !resetPw} onClick={() => doReset(resetEmail, resetPw)}>Reset Password</button></div>
        </div>
      </div>

      </>
      )}

      {/* Reset confirm modal */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`🔑 Reset password for ${resetTarget?.email ?? ''}`}>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-300">Set a new password for <strong>{resetTarget?.email}</strong>. They can sign in with it immediately.</p>
        <div className="space-y-3">
          <PasswordInput value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="New password (at least 6 chars)" autoFocus />
          <button className="btn-primary w-full" disabled={busy || resetPw.length < 6} onClick={() => resetTarget && doReset(resetTarget.email, resetPw)}>
            {busy ? 'Resetting…' : 'Confirm reset'}
          </button>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`🗑 Delete ${deleteTarget?.email ?? ''}`}>
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">⚠️ This permanently deletes the account and all its synced data. This cannot be undone.</p>
        <button className="btn-primary w-full !bg-red-600" disabled={busy} onClick={() => deleteTarget && doDelete(deleteTarget.email)}>
          {busy ? 'Deleting…' : 'Yes, delete this user'}
        </button>
      </Modal>

      {/* User detail modal — powerful management */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`🛡️ Manage ${detail?.name ?? ''}`} wide>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <div><strong>Email:</strong> {detail.email}</div>
              <div><strong>Joined:</strong> {new Date(detail.createdAt).toLocaleString()}</div>
              <div><strong>Security question:</strong> {detail.hasSecurityQuestion ? detail.securityQuestion || '✅ set' : '—'}</div>
              <div><strong>Role:</strong> {detail.isAdmin ? '👑 Admin' : 'User'}</div>
            </div>

            {/* Change email */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="label">✉️ Change email</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" />
                <button className="btn-secondary shrink-0" disabled={busy || !newEmail.trim()} onClick={() => detail && doChangeEmail(detail.email, newEmail.trim())}>
                  {busy ? '…' : 'Change'}
                </button>
              </div>
            </div>

            {/* Rename */}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="label">✏️ Name</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <button className="btn-secondary shrink-0" disabled={busy || !newName.trim()} onClick={() => detail && doRename(detail.email, newName.trim())}>
                  {busy ? '…' : 'Rename'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!detail.isAdmin && (
                <>
                  <button className="btn-secondary" onClick={() => { setResetTarget(detail); setResetEmail(detail.email); setResetPw(''); setDetail(null); }}>🔑 Reset password</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => doClearSecurity(detail.email)}>🧹 Clear security Q</button>
                  <button className="btn-primary !bg-red-600" disabled={busy} onClick={() => { setDeleteTarget(detail); setDetail(null); }}>🗑 Delete user</button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
