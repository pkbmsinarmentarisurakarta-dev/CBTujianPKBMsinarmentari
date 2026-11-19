import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Power } from 'lucide-react';
import React, { useState } from 'react';
import { LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';

export function AccountsAndAuditPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', full_name: '', password: '' });

  const { data: accData, isLoading: accLoading } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => apiFetch<{ admins: any[] }>('/api/admin/accounts'),
  });
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => apiFetch<{ logs: any[] }>('/api/admin/audit-logs'),
  });

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/accounts', { method: 'POST', body: JSON.stringify(form) });
      showToast('Akun administrator baru berhasil ditambahkan.', 'success');
      setFormOpen(false);
      setForm({ username: '', email: '', full_name: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await apiFetch(`/api/admin/accounts/${id}/toggle`, { method: 'PATCH' });
      showToast('Status akun admin diperbarui.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Akun & Audit Keamanan</h2>
          <p className="text-sm text-slate-500">Kelola akun operator/proktor sekolah dan pantau catatan audit sistem.</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Admin / Proktor</span>
        </button>
      </div>

      {accLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900">Daftar Akun Administrator</div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Nama Lengkap</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(accData?.admins || []).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{a.username}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{a.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.email || '-'}</td>
                  <td className="px-4 py-3">
                    <StateIndicator variant={a.is_active ? 'success' : 'danger'} label={a.is_active ? 'Aktif' : 'Nonaktif'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggle(a.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Power className="h-3.5 w-3.5" /> {a.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Log */}
      {logsLoading ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900">Jejak Audit Aktivitas Sistem (100 Terakhir)</div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Waktu (WIB)</th>
                <th className="px-4 py-2.5">Aktor</th>
                <th className="px-4 py-2.5">Peran</th>
                <th className="px-4 py-2.5">Aksi</th>
                <th className="px-4 py-2.5">Entitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(logsData?.logs || []).map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500">
                    {new Date(l.created_at + (l.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{l.actor_name || l.actor_username || 'Sistem'}</td>
                  <td className="px-4 py-2.5">{l.actor_role}</td>
                  <td className="px-4 py-2.5 font-mono text-blue-700">{l.action}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {l.entity_type} {l.entity_id ? `(${String(l.entity_id).slice(0, 12)})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Tambah Akun Admin / Proktor" maxWidth="max-w-md">
        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username *</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password Minimal 6 Karakter *</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              Simpan Akun
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
