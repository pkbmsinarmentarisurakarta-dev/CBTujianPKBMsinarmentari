import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, Plus, Trash2, Users } from 'lucide-react';
import React, { useState } from 'react';
import { ConfirmModal, EmptyState, LoadingRows, Modal } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { SchoolClass, Student } from '../../types';

export function ClassesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [yearFilter, setYearFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [transferTargetId, setTransferTargetId] = useState('');

  const [formState, setFormState] = useState({
    name: '',
    grade_level: 'XII',
    academic_year_label: '2026/2027',
    major: '',
    homeroom_teacher: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-classes', yearFilter],
    queryFn: () => apiFetch<{ classes: SchoolClass[] }>(`/api/admin/classes?year=${encodeURIComponent(yearFilter)}`),
  });

  const { data: classStudentsData } = useQuery({
    queryKey: ['admin-class-students', selectedClass?.id],
    enabled: Boolean(selectedClass),
    queryFn: () => apiFetch<{ students: Student[] }>(`/api/admin/classes/${selectedClass!.id}/students`),
  });

  const openCreate = () => {
    setEditing(null);
    setFormState({ name: '', grade_level: 'XII', academic_year_label: '2026/2027', major: '', homeroom_teacher: '' });
    setFormOpen(true);
  };

  const openEdit = (c: SchoolClass) => {
    setEditing(c);
    setFormState({
      name: c.name,
      grade_level: c.grade_level,
      academic_year_label: c.academic_year_label,
      major: c.major || '',
      homeroom_teacher: c.homeroom_teacher || '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiFetch(`/api/admin/classes/${editing.id}`, { method: 'PUT', body: JSON.stringify(formState) });
        showToast('Data kelas berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/classes', { method: 'POST', body: JSON.stringify(formState) });
        showToast('Kelas baru berhasil ditambahkan.', 'success');
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/classes/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Kelas dihapus.', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleTransfer = async () => {
    if (!transferTargetId || selectedStudentIds.length === 0) return;
    try {
      await apiFetch('/api/admin/classes/transfer', {
        method: 'POST',
        body: JSON.stringify({ studentIds: selectedStudentIds, targetClassId: transferTargetId }),
      });
      showToast(`${selectedStudentIds.length} siswa dipindahkan ke kelas tujuan.`, 'success');
      setSelectedStudentIds([]);
      queryClient.invalidateQueries({ queryKey: ['admin-class-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-classes'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const classes = data?.classes || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Data Kelas</h2>
          <p className="text-sm text-slate-500">Kelola rombongan belajar, wali kelas, daftar siswa, dan mutasi antarkelas.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Semua Tahun Pelajaran</option>
            <option value="2026/2027">2026/2027</option>
            <option value="2025/2026">2025/2026</option>
          </select>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Kelas</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : classes.length === 0 ? (
        <EmptyState
          title="Belum ada data kelas"
          description="Buat kelas terlebih dahulu untuk mengelompokkan peserta ujian."
          actionLabel="Tambah Kelas"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div key={cls.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      Tingkat {cls.grade_level} · {cls.academic_year_label}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{cls.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(cls)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(cls)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div>Jurusan: {cls.major || '-'}</div>
                  <div>Wali Kelas: {cls.homeroom_teacher || '-'}</div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-semibold text-slate-800 tabular-nums">{cls.student_count || 0} Siswa</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClass(cls);
                    setSelectedStudentIds([]);
                    setTransferTargetId('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Lihat & Pindah Siswa</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Tambah/Edit Kelas */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Kelas' : 'Tambah Kelas Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kelas *</label>
              <input
                type="text"
                required
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="Contoh: XII IPA 1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tingkat *</label>
              <input
                type="text"
                required
                value={formState.grade_level}
                onChange={(e) => setFormState({ ...formState, grade_level: e.target.value })}
                placeholder="Contoh: X, XI, XII"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Pelajaran *</label>
              <input
                type="text"
                required
                value={formState.academic_year_label}
                onChange={(e) => setFormState({ ...formState, academic_year_label: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jurusan / Peminatan</label>
              <input
                type="text"
                value={formState.major}
                onChange={(e) => setFormState({ ...formState, major: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Wali Kelas</label>
              <input
                type="text"
                value={formState.homeroom_teacher}
                onChange={(e) => setFormState({ ...formState, homeroom_teacher: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Simpan Kelas
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Daftar Siswa & Pindah Kelas */}
      <Modal
        open={Boolean(selectedClass)}
        onClose={() => setSelectedClass(null)}
        title={`Anggota Kelas ${selectedClass?.name || ''}`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <select
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">-- Pilih Kelas Tujuan Mutasi --</option>
              {classes
                .filter((c) => c.id !== selectedClass?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!transferTargetId || selectedStudentIds.length === 0}
              onClick={handleTransfer}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>Pindahkan ({selectedStudentIds.length})</span>
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(classStudentsData?.students || []).length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Belum ada siswa di kelas ini.</div>
            ) : (
              (classStudentsData?.students || []).map((st) => (
                <label key={st.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(st.id)}
                    onChange={(e) =>
                      setSelectedStudentIds((prev) =>
                        e.target.checked ? [...prev, st.id] : prev.filter((id) => id !== st.id)
                      )
                    }
                  />
                  <span className="font-mono text-xs text-slate-500 w-24">{st.nis}</span>
                  <span className="font-medium text-slate-800">{st.full_name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Hapus Kelas"
        message={`Hapus kelas "${deleteTarget?.name}"? Siswa di dalamnya tetap tersimpan dengan status belum memiliki kelas.`}
        confirmLabel="Hapus Kelas"
      />
    </div>
  );
}
