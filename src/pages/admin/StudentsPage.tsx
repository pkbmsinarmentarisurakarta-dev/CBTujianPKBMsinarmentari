import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, KeyRound, Pencil, Plus, Power, Search, Trash2, Upload } from 'lucide-react';
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { ConfirmModal, EmptyState, LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { SchoolClass, Student } from '../../types';

export function StudentsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  const [formState, setFormState] = useState({
    nis: '',
    nisn: '',
    full_name: '',
    gender: 'L' as 'L' | 'P' | '',
    class_id: '',
    username: '',
    password: '',
    status: 'aktif' as 'aktif' | 'nonaktif',
  });

  const { data: classesData } = useQuery({
    queryKey: ['admin-classes'],
    queryFn: () => apiFetch<{ classes: SchoolClass[] }>('/api/admin/classes'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-students', search, classFilter],
    queryFn: () =>
      apiFetch<{ students: Student[]; total: number }>(
        `/api/admin/students?q=${encodeURIComponent(search)}&classId=${encodeURIComponent(classFilter)}&limit=100`
      ),
  });

  const openCreate = () => {
    setEditing(null);
    setFormState({
      nis: '',
      nisn: '',
      full_name: '',
      gender: 'L',
      class_id: classesData?.classes[0]?.id || '',
      username: '',
      password: '',
      status: 'aktif',
    });
    setFormOpen(true);
  };

  const openEdit = (st: Student) => {
    setEditing(st);
    setFormState({
      nis: st.nis,
      nisn: st.nisn || '',
      full_name: st.full_name,
      gender: st.gender || '',
      class_id: st.class_id || '',
      username: st.username,
      password: '',
      status: st.status,
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiFetch(`/api/admin/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...formState, class_id: formState.class_id || null }),
        });
        showToast('Data siswa berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/students', {
          method: 'POST',
          body: JSON.stringify({ ...formState, class_id: formState.class_id || null }),
        });
        showToast('Siswa baru berhasil ditambahkan.', 'success');
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleStatus = async (st: Student) => {
    try {
      const res = await apiFetch<{ status: string }>(`/api/admin/students/${st.id}/toggle-status`, { method: 'PATCH' });
      showToast(`Akun ${st.full_name} kini ${res.status}.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleResetPassword = async (st: Student) => {
    try {
      await apiFetch(`/api/admin/students/${st.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: 'Siswa2026!' }),
      });
      showToast(`Password ${st.full_name} direset ke: Siswa2026!`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/students/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Data siswa dihapus.', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleExportExcel = () => {
    const rows = (data?.students || []).map((s, idx) => ({
      No: idx + 1,
      NIS: s.nis,
      NISN: s.nisn || '',
      'Nama Lengkap': s.full_name,
      'L/P': s.gender || '',
      Kelas: s.class_name || '-',
      Username: s.username,
      Status: s.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, 'data-siswa-cbt.xlsx');
    showToast('Data siswa diekspor ke Excel.', 'success');
  };

  const handleImportExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
      const rows = raw
        .map((r) => ({
          nis: String(r.NIS ?? r.nis ?? '').trim(),
          nisn: String(r.NISN ?? r.nisn ?? '').trim(),
          full_name: String(r['Nama Lengkap'] ?? r.full_name ?? r.Nama ?? '').trim(),
          gender: String(r['L/P'] ?? r.gender ?? r.JK ?? '').trim(),
          class_name: String(r.Kelas ?? r.class_name ?? '').trim(),
          username: String(r.Username ?? r.username ?? r.NIS ?? r.nis ?? '').trim(),
          password: String(r.Password ?? r.password ?? '').trim(),
        }))
        .filter((r) => r.nis && r.full_name);

      if (rows.length === 0) {
        return showToast('Berkas tidak memiliki kolom NIS dan Nama Lengkap yang valid.', 'error');
      }

      const res = await apiFetch<{ inserted: number; skippedCount: number }>('/api/admin/students/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      showToast(`Impor selesai: ${res.inserted} ditambahkan, ${res.skippedCount} dilewati (duplikat).`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
    } catch (err: any) {
      showToast(err.message || 'Gagal membaca berkas Excel/CSV.', 'error');
    }
  };

  const students = data?.students || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Data Siswa</h2>
          <p className="text-sm text-slate-500">Kelola peserta ujian, impor massal Excel/CSV, dan manajemen akun siswa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4 text-slate-500" />
            <span>Impor Excel/CSV</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportExcel(f);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Ekspor Excel</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Siswa</span>
          </button>
        </div>
      </div>

      {/* Filter & Pencarian */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan nama, NIS, atau username..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Kelas</option>
          {(classesData?.classes || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 tabular-nums ml-auto">Total: {data?.total || 0} siswa</span>
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : students.length === 0 ? (
        <EmptyState
          title="Belum ada data siswa sesuai pencarian"
          description="Tambahkan siswa secara manual atau impor daftar peserta melalui berkas Excel/CSV."
          actionLabel="Tambah Siswa Pertama"
          onAction={openCreate}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">NIS</th>
                <th className="px-4 py-3">Nama Lengkap</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">{st.nis}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{st.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{st.class_name || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{st.username}</td>
                  <td className="px-4 py-3">
                    <StateIndicator
                      variant={st.status === 'aktif' ? 'success' : 'danger'}
                      label={st.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetailStudent(st)}
                        title="Detail siswa"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(st)}
                        title="Edit siswa"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(st)}
                        title="Reset kata sandi ke Siswa2026!"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-700"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(st)}
                        title={st.status === 'aktif' ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(st)}
                        title="Hapus siswa"
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

      {/* Modal Tambah / Edit */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NIS *</label>
              <input
                type="text"
                required
                value={formState.nis}
                onChange={(e) => setFormState({ ...formState, nis: e.target.value, username: editing ? formState.username : e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NISN (Opsional)</label>
              <input
                type="text"
                value={formState.nisn}
                onChange={(e) => setFormState({ ...formState, nisn: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                value={formState.full_name}
                onChange={(e) => setFormState({ ...formState, full_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
              <select
                value={formState.class_id}
                onChange={(e) => setFormState({ ...formState, class_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">-- Tanpa Kelas --</option>
                {(classesData?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={formState.gender}
                onChange={(e) => setFormState({ ...formState, gender: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="L">Laki-laki (L)</option>
                <option value="P">Perempuan (P)</option>
                <option value="">Tidak ditentukan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username Login *</label>
              <input
                type="text"
                required
                value={formState.username}
                onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password Awal</label>
                <input
                  type="text"
                  value={formState.password}
                  onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                  placeholder="Default: Siswa2026!"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Simpan Siswa
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detail */}
      <Modal open={Boolean(detailStudent)} onClose={() => setDetailStudent(null)} title="Detail Peserta Ujian" maxWidth="max-w-md">
        {detailStudent && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Nama Lengkap</dt>
              <dd className="font-semibold text-slate-900">{detailStudent.full_name}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">NIS / NISN</dt>
              <dd className="font-mono text-slate-900">{detailStudent.nis} / {detailStudent.nisn || '-'}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Kelas</dt>
              <dd className="text-slate-900">{detailStudent.class_name || '-'}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Username</dt>
              <dd className="font-mono text-slate-900">{detailStudent.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Login Terakhir</dt>
              <dd className="text-slate-700">{detailStudent.last_login_at ? new Date(detailStudent.last_login_at + 'Z').toLocaleString('id-ID') : 'Belum pernah login'}</dd>
            </div>
          </dl>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Hapus Data Siswa"
        message={`Apakah Anda yakin ingin menghapus akun siswa "${deleteTarget?.full_name}" (NIS ${deleteTarget?.nis})?`}
        confirmLabel="Hapus Permanen"
      />
    </div>
  );
}
