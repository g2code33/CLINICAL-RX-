import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { syncClient } from '../services/syncClient';
import { PasswordInput } from '../components/ui';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  hasSecurityQuestion: boolean;
  isAdmin: boolean;
}

export function AdminPage() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

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

  async function doReset() {
    if (!resetEmail || !resetPw) return;
    setMsg('');
    const res = await syncClient.adminResetPassword(bUrl, token, resetEmail, resetPw);
    setMsg(res.ok ? `✓ Password reset for ${resetEmail}` : '⚠️ ' + (res.error || 'Failed'));
    if (res.ok) { setResetEmail(''); setResetPw(''); }
  }

  async function doDelete(email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setMsg('');
    const res = await syncClient.adminDeleteUser(bUrl, token, email);
    setMsg(res.ok ? `✓ Deleted ${email}` : '⚠️ ' + (res.error || 'Failed'));
    if (res.ok) loadUsers();
  }

  if (!token) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="card text-center">
          <h1 className="text-xl font-bold"> Admin Panel</h1>
          <p className="mt-2 text-sm text-slate-400">Please sign in first.</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/auth')}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">️ Admin Panel</h1>
          <p className="text-sm text-slate-400">Admin: {adminEmail || 'not configured'}</p>
        </div>
        <button className="btn-secondary" onClick={loadUsers}>🔄 Refresh</button>
      </div>

      {msg && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700">{msg}</div>}

      {/* User list */}
      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">👥 Registered Users ({users.length})</h2>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-400 dark:border-slate-700">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Created</th>
                  <th className="pb-2">Recovery</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">{u.name}</td>
                    <td className="py-2 text-slate-400">{u.email}</td>
                    <td className="py-2 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">{u.hasSecurityQuestion ? '✅' : '—'}</td>
                    <td className="py-2">{u.isAdmin ? '👑 Admin' : 'User'}</td>
                    <td className="py-2">
                      {!u.isAdmin && (
                        <button className="text-xs text-red-500 hover:text-red-700" onClick={() => doDelete(u.email)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset password */}
      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">🔑 Reset User Password</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">User email</label><input className="input" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="user@example.com" /></div>
          <div><label className="label">New password</label><PasswordInput value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="At least 6 characters" /></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={!resetEmail || !resetPw} onClick={doReset}>Reset Password</button></div>
        </div>
      </div>

      {/* Delete user */}
      <div className="card">
        <h2 className="mb-3 font-semibold">🗑 Delete User</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label">User email</label><input className="input" value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} placeholder="user@example.com" /></div>
          <div className="flex items-end"><button className="btn-primary w-full !bg-red-600" disabled={!deleteEmail} onClick={() => doDelete(deleteEmail)}>Delete User</button></div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <button className="btn-ghost" onClick={() => navigate('/settings')}>← Back to Settings</button>
      </div>
    </div>
  );
}
