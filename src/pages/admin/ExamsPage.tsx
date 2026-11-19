import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, KeyRound, ListChecks, Pencil, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import React, { useState } from 'react';
import { ConfirmModal, EmptyState, LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { Exam, ExamStatus, Question, SchoolClass, Student, Subject } from '../../types';

const STATUS_BADGE: Record<ExamStatus, { variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  draft: { variant: 'neutral', label: 'Draft' },
  terjadwal: { variant: 'info', label: 'Terjadwal' },
  aktif: { variant: 'success', label: 'Aktif Berlangsung' },
  selesai: { variant: 'warning', label: 'Selesai' },
  diarsipkan: { variant: 'neutral', label: 'Diarsipkan' },
};

export function ExamsPage({ mode = 'manage' }: { mode?: 'manage' | 'schedule' }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [configExamId, setConfigExamId] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<'questions' | 'participants'>('questions');

  const [formState, setFormState] = useState({
    title: '',
    exam_type: 'Penilaian Tengah Semester',
    academic_year: '2026/2027',
    semester: 'Ganjil' as 'Ganjil' | 'Genap',
    subject_id: '',
    class_id: '',
    description: '',
    exam_date: new Date().toISOString().slice(0, 10),
    start_time: '07:30',
    end_time: '09:30',
    duration_minutes: 90,
    passing_score: 75,
    rounding_mode: 'two_decimals' as 'none' | 'nearest_int' | 'one_decimal' | 'two_decimals',
    exam_token: 'CBT2026',
    max_attempts: 1,
    shuffle_questions: true,
    shuffle_options: true,
    questions_per_page: 1,
    results_published: false,
    status: 'draft' as ExamStatus,
  });

  const { data: examsData, isLoading } = useQuery({
    queryKey: ['admin-exams'],
    queryFn: () => apiFetch<{ exams: Exam[] }>('/api/admin/exams'),
  });
  const { data: subjectsData } = useQuery({
    queryKey: ['admin-subjects'],
    queryFn: () => apiFetch<{ subjects: Subject[] }>('/api/admin/subjects'),
  });
  const { data: classesData } = useQuery({
    queryKey: ['admin-classes'],
    queryFn: () => apiFetch<{ classes: SchoolClass[] }>('/api/admin/classes'),
  });
  const { data: allQuestionsData } = useQuery({
    queryKey: ['admin-questions-picker'],
    enabled: Boolean(configExamId),
    queryFn: () => apiFetch<{ questions: Question[] }>('/api/admin/questions?limit=100'),
  });
  const { data: allStudentsData } = useQuery({
    queryKey: ['admin-students-picker'],
    enabled: Boolean(configExamId),
    queryFn: () => apiFetch<{ students: Student[] }>('/api/admin/students?limit=200'),
  });
  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ['admin-exam-detail', configExamId],
    enabled: Boolean(configExamId),
    queryFn: () => apiFetch<any>(`/api/admin/exams/${configExamId}`),
  });

  const [selectedBankQIds, setSelectedBankQIds] = useState<string[]>([]);
  const [selectedClassAdd, setSelectedClassAdd] = useState('');
  const [selectedManualStudentId, setSelectedManualStudentId] = useState('');

  const openCreate = () => {
    setEditing(null);
    setFormState({
      title: '',
      exam_type: 'Penilaian Tengah Semester',
      academic_year: '2026/2027',
      semester: 'Ganjil',
      subject_id: subjectsData?.subjects[0]?.id || '',
      class_id: '',
      description: '',
      exam_date: new Date().toISOString().slice(0, 10),
      start_time: '07:30',
      end_time: '09:30',
      duration_minutes: 90,
      passing_score: 75,
      rounding_mode: 'two_decimals',
      exam_token: Math.random().toString(36).slice(2, 8).toUpperCase(),
      max_attempts: 1,
      shuffle_questions: true,
      shuffle_options: true,
      questions_per_page: 1,
      results_published: false,
      status: 'draft',
    });
    setFormOpen(true);
  };

  const openEdit = (ex: Exam) => {
    setEditing(ex);
    setFormState({
      title: ex.title,
      exam_type: ex.exam_type,
      academic_year: ex.academic_year,
      semester: ex.semester,
      subject_id: ex.subject_id,
      class_id: ex.class_id || '',
      description: ex.description || '',
      exam_date: ex.exam_date,
      start_time: ex.start_time,
      end_time: ex.end_time,
      duration_minutes: ex.duration_minutes,
      passing_score: ex.passing_score,
      rounding_mode: ex.rounding_mode,
      exam_token: ex.exam_token,
      max_attempts: ex.max_attempts,
      shuffle_questions: Boolean(ex.shuffle_questions),
      shuffle_options: Boolean(ex.shuffle_options),
      questions_per_page: ex.questions_per_page,
      results_published: Boolean(ex.results_published),
      status: ex.status,
    });
    setFormOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formState,
        class_id: formState.class_id || null,
        duration_minutes: Number(formState.duration_minutes),
        passing_score: Number(formState.passing_score),
        max_attempts: Number(formState.max_attempts),
        questions_per_page: Number(formState.questions_per_page),
      };
      if (editing) {
        await apiFetch(`/api/admin/exams/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Pengaturan ujian diperbarui.', 'success');
      } else {
        const res = await apiFetch<{ id: string }>('/api/admin/exams', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Ujian dibuat. Silakan pilih soal dan peserta ujian.', 'success');
        setConfigExamId(res.id);
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/exams/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Ujian dihapus.', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAttachQuestions = async () => {
    if (!configExamId || selectedBankQIds.length === 0) return;
    try {
      await apiFetch(`/api/admin/exams/${configExamId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ questionIds: selectedBankQIds }),
      });
      setSelectedBankQIds([]);
      showToast('Soal ditambahkan ke ujian.', 'success');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDetachQuestion = async (questionId: string) => {
    if (!configExamId) return;
    await apiFetch(`/api/admin/exams/${configExamId}/questions/${questionId}`, { method: 'DELETE' });
    refetchDetail();
    queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
  };

  const handleAddParticipants = async (payload: { classId?: string; studentIds?: string[] }) => {
    if (!configExamId) return;
    try {
      const res = await apiFetch<{ addedCount: number }>(`/api/admin/exams/${configExamId}/participants`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast(`${res.addedCount} peserta diproses ke ujian.`, 'success');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateParticipant = async (studentId: string, extraMinutes: number, allowedAttempts: number) => {
    if (!configExamId) return;
    try {
      await apiFetch(`/api/admin/exams/${configExamId}/participants/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ extra_minutes: extraMinutes, allowed_attempts: allowedAttempts }),
      });
      showToast('Waktu tambahan/kesempatan peserta diperbarui.', 'success');
      refetchDetail();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleResetSession = async (studentId: string) => {
    if (!configExamId) return;
    try {
      await apiFetch(`/api/admin/exams/${configExamId}/reset-session/${studentId}`, { method: 'POST' });
      showToast('Sesi ujian peserta berhasil direset.', 'success');
      refetchDetail();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const exams = examsData?.exams || [];
  const attachedQIds = new Set((detailData?.questions || []).map((q: any) => q.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {mode === 'schedule' ? 'Jadwal Pelaksanaan Ujian' : 'Manajemen Ujian'}
          </h2>
          <p className="text-sm text-slate-500">
            {mode === 'schedule'
              ? 'Daftar jadwal, sesi waktu, token rilis, dan status pelaksanaan seluruh ujian.'
              : 'Buat ujian, tentukan token, atur pengacakan, pilih soal dari bank soal, dan kelola peserta.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>Buat Ujian Baru</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : exams.length === 0 ? (
        <EmptyState
          title="Belum ada ujian"
          description="Buat jadwal ujian baru dan hubungkan dengan butir soal dari Bank Soal."
          actionLabel="Buat Ujian"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-4">
          {exams.map((ex) => {
            const st = STATUS_BADGE[ex.status] || STATUS_BADGE.draft;
            return (
              <div key={ex.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-blue-700">{ex.subject_name}</span>
                      <span>·</span>
                      <span>{ex.exam_type}</span>
                      <span>·</span>
                      <span>{ex.academic_year} ({ex.semester})</span>
                      {ex.class_name && (
                        <>
                          <span>·</span>
                          <span>{ex.class_name}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{ex.title}</h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <StateIndicator variant={st.variant} label={st.label} />
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                      <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-slate-500">Token:</span>
                      <span className="font-mono font-bold text-slate-900">{ex.exam_token}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-y border-slate-100 py-3 text-xs sm:grid-cols-5">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="tabular-nums">{ex.exam_date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="tabular-nums">
                      {ex.start_time} - {ex.end_time} ({ex.duration_minutes} mnt)
                    </span>
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Soal Terpasang: <strong className="text-slate-900">{ex.attached_question_count || 0}</strong>
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Peserta Terdaftar: <strong className="text-slate-900">{ex.participant_count || 0}</strong>
                  </div>
                  <div className="text-slate-600">
                    Publikasi Nilai:{' '}
                    <strong className={ex.results_published ? 'text-emerald-700' : 'text-slate-700'}>
                      {ex.results_published ? 'Dipublikasikan' : 'Tertutup'}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfigExamId(ex.id);
                      setConfigTab('questions');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ListChecks className="h-3.5 w-3.5 text-blue-600" />
                    <span>Kelola Soal ({ex.attached_question_count || 0})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfigExamId(ex.id);
                      setConfigTab('participants');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    <span>Peserta & Sesi ({ex.participant_count || 0})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(ex)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit & Status</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(ex)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Form Buat/Edit Ujian */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Pengaturan Ujian' : 'Buat Ujian Baru'} maxWidth="max-w-3xl">
        <form onSubmit={handleSaveExam} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Ujian *</label>
              <input
                type="text"
                required
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                placeholder="Contoh: Penilaian Akhir Semester Matematika XII"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Ujian</label>
              <select
                value={formState.exam_type}
                onChange={(e) => setFormState({ ...formState, exam_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Ulangan Harian">Ulangan Harian</option>
                <option value="Penilaian Tengah Semester">Penilaian Tengah Semester</option>
                <option value="Penilaian Akhir Semester">Penilaian Akhir Semester</option>
                <option value="Try Out">Try Out</option>
                <option value="Ujian Madrasah/Sekolah">Ujian Madrasah / Sekolah</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mata Pelajaran *</label>
              <select
                required
                value={formState.subject_id}
                onChange={(e) => setFormState({ ...formState, subject_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(subjectsData?.subjects || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kelas Target (Opsional)</label>
              <select
                value={formState.class_id}
                onChange={(e) => setFormState({ ...formState, class_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">-- Pilih Manual / Multi Kelas --</option>
                {(classesData?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status Ujian</label>
              <select
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value as ExamStatus })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="terjadwal">Terjadwal</option>
                <option value="aktif">Aktif</option>
                <option value="selesai">Selesai</option>
                <option value="diarsipkan">Diarsipkan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Ujian *</label>
              <input
                type="date"
                required
                value={formState.exam_date}
                onChange={(e) => setFormState({ ...formState, exam_date: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jam Mulai</label>
                <input
                  type="time"
                  required
                  value={formState.start_time}
                  onChange={(e) => setFormState({ ...formState, start_time: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jam Selesai</label>
                <input
                  type="time"
                  required
                  value={formState.end_time}
                  onChange={(e) => setFormState({ ...formState, end_time: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Durasi (Menit)</label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={formState.duration_minutes}
                  onChange={(e) => setFormState({ ...formState, duration_minutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Token Ujian</label>
                <input
                  type="text"
                  required
                  value={formState.exam_token}
                  onChange={(e) => setFormState({ ...formState, exam_token: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">KKM / Passing Score</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={formState.passing_score}
                  onChange={(e) => setFormState({ ...formState, passing_score: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kesempatan</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={formState.max_attempts}
                  onChange={(e) => setFormState({ ...formState, max_attempts: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.shuffle_questions}
                  onChange={(e) => setFormState({ ...formState, shuffle_questions: e.target.checked })}
                />
                <span>Acak urutan soal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.shuffle_options}
                  onChange={(e) => setFormState({ ...formState, shuffle_options: e.target.checked })}
                />
                <span>Acak pilihan jawaban</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.results_published}
                  onChange={(e) => setFormState({ ...formState, results_published: e.target.checked })}
                />
                <span>Publikasikan nilai ke siswa</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Simpan Pengaturan Ujian
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Kelola Soal & Peserta Ujian */}
      <Modal
        open={Boolean(configExamId)}
        onClose={() => setConfigExamId(null)}
        title={`Konfigurasi Ujian: ${detailData?.exam?.title || ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setConfigTab('questions')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              configTab === 'questions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Daftar Soal Ujian ({detailData?.questions?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setConfigTab('participants')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              configTab === 'participants' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Peserta & Pengaturan Sesi ({detailData?.participants?.length || 0})
          </button>
        </div>

        {configTab === 'questions' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700">Soal Terpasang pada Ujian</div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                {(detailData?.questions || []).length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">Belum ada soal terpasang. Pilih dari bank soal di samping.</div>
                ) : (
                  (detailData?.questions || []).map((q: any, idx: number) => (
                    <div key={q.id} className="flex items-start justify-between gap-2 p-3 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">#{idx + 1}</span> ·{' '}
                        <span className="text-blue-700">{q.subject_name}</span>
                        <div
                          className="mt-1 text-slate-600 line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: q.content_html }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDetachQuestion(q.id)}
                        className="text-red-600 hover:underline shrink-0"
                      >
                        Lepas
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Pilih dari Bank Soal</span>
                <button
                  type="button"
                  disabled={selectedBankQIds.length === 0}
                  onClick={handleAttachQuestions}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  + Pasang ({selectedBankQIds.length})
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                {(allQuestionsData?.questions || [])
                  .filter((q) => !attachedQIds.has(q.id))
                  .map((q) => (
                    <label key={q.id} className="flex items-start gap-2.5 p-3 text-xs hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBankQIds.includes(q.id)}
                        onChange={(e) =>
                          setSelectedBankQIds((prev) =>
                            e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                          )
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">
                          {q.subject_name} · {q.question_type} · Bobot {q.weight}
                        </div>
                        <div className="text-slate-500 line-clamp-2" dangerouslySetInnerHTML={{ __html: q.content_html }} />
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex gap-2">
                <select
                  value={selectedClassAdd}
                  onChange={(e) => setSelectedClassAdd(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="">-- Tambah Satu Kelas --</option>
                  {(classesData?.classes || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.student_count} siswa)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedClassAdd}
                  onClick={() => handleAddParticipants({ classId: selectedClassAdd })}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Tambah Kelas
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedManualStudentId}
                  onChange={(e) => setSelectedManualStudentId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="">-- Tambah Siswa Manual --</option>
                  {(allStudentsData?.students || []).map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.nis} - {st.full_name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedManualStudentId}
                  onClick={() => handleAddParticipants({ studentIds: [selectedManualStudentId] })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                >
                  + Tambah
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">NIS / Nama</th>
                    <th className="px-3 py-2.5">Kelas</th>
                    <th className="px-3 py-2.5">Status Sesi</th>
                    <th className="px-3 py-2.5">Waktu Ekstra</th>
                    <th className="px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(detailData?.participants || []).map((p: any) => (
                    <tr key={p.student_id}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{p.full_name}</div>
                        <div className="font-mono text-slate-500">{p.nis}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{p.class_name || '-'}</td>
                      <td className="px-3 py-2.5">{p.session_status || p.status}</td>
                      <td className="px-3 py-2.5 tabular-nums">+{p.extra_minutes} mnt</td>
                      <td className="px-3 py-2.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateParticipant(p.student_id, p.extra_minutes + 15, p.allowed_attempts)}
                          className="text-blue-700 hover:underline"
                        >
                          +15 Mnt
                        </button>
                        {p.session_status === 'berlangsung' && (
                          <button
                            type="button"
                            onClick={() => handleResetSession(p.student_id)}
                            className="inline-flex items-center gap-1 text-amber-700 hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" /> Reset Sesi
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteExam}
        danger
        title="Hapus Ujian"
        message={`Hapus ujian "${deleteTarget?.title}" beserta seluruh riwayat sesi dan hasilnya?`}
        confirmLabel="Hapus Ujian"
      />
    </div>
  );
}
