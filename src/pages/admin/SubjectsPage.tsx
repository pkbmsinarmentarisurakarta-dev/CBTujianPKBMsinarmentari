import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { ConfirmModal, EmptyState, LoadingRows, Modal } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { Subject } from '../../types';

export function SubjectsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [formState, setFormState] = useState({ code: '', name: '', category: 'Wajib', description: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subjects'],
    queryFn: () => apiFetch<{ subjects: Subject[] }>('/api/admin/subjects'),
  });

  const openCreate = () => {
    setEditing(null);
    setFormState({ code: '', name: '', category: 'Wajib', description: '' });
    setFormOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setFormState({ code: s.code, name: s.name, category: s.category, description: s.description || '' });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiFetch(`/api/admin/subjects/${editing.id}`, { method: 'PUT', body: JSON.stringify(formState) });
        showToast('Mata pelajaran diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/subjects', { method: 'POST', body: JSON.stringify(formState) });
        showToast('Mata pelajaran ditambahkan.', 'success');
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-subjects'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/subjects/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Mata pelajaran dihapus.', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-subjects'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const subjects = data?.subjects || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Mata Pelajaran</h2>
          <p className="text-sm text-slate-500">Daftar kode, kategori kurikulum, dan deskripsi mata pelajaran ujian.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Mata Pelajaran</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : subjects.length === 0 ? (
        <EmptyState
          title="Belum ada mata pelajaran"
          description="Tambahkan mata pelajaran untuk mulai menyusun bank soal dan jadwal ujian."
          actionLabel="Tambah Mata Pelajaran"
          onAction={openCreate}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Mata Pelajaran</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Jumlah Soal</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.category}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{s.question_count || 0} butir</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{s.description || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kode Mapel *</label>
              <input
                type="text"
                required
                value={formState.code}
                onChange={(e) => setFormState({ ...formState, code: e.target.value })}
                placeholder="Contoh: MAT-12"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategori *</label>
              <select
                value={formState.category}
                onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Wajib">Kelompok Wajib</option>
                <option value="Peminatan MIPA">Peminatan MIPA</option>
                <option value="Peminatan IPS">Peminatan IPS</option>
                <option value="Keagamaan">Keagamaan / Madrasah</option>
                <option value="Kejuruan">Produktif / Kejuruan</option>
                <option value="Muatan Lokal">Muatan Lokal</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Mata Pelajaran *</label>
              <input
                type="text"
                required
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi</label>
              <textarea
                rows={2}
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Hapus Mata Pelajaran"
        message={`Yakin menghapus mata pelajaran "${deleteTarget?.name}"?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
