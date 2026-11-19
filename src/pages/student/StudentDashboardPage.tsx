import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Award, Calendar, CheckCircle2, Clock, KeyRound, Play, ShieldCheck } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';

const EXAM_STATE_META: Record<string, { label: string; variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  belum_mulai: { label: 'Belum dimulai', variant: 'info' },
  menunggu_jadwal: { label: 'Menunggu jadwal', variant: 'neutral' },
  sedang_berlangsung: { label: 'Sedang berlangsung', variant: 'warning' },
  selesai: { label: 'Sudah selesai', variant: 'success' },
  waktu_habis: { label: 'Waktu habis', variant: 'danger' },
};

async function requestBrowserFullscreen() {
  try {
    if (document.fullscreenElement) return true;
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
    if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
      return true;
    }
  } catch {
    // Abaikan jika dibatasi kebijakan browser/iframe
  }
  return false;
}

export function StudentDashboardPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tokenModalExam, setTokenModalExam] = useState<any | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [starting, setStarting] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => apiFetch<any>('/api/student/dashboard'),
  });

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenModalExam) return;

    const cleanedToken = tokenInput.trim();
    if (!cleanedToken) {
      const msg = 'Token yang anda masukkan salah mohon masukan token lagi';
      setTokenError(msg);
      showToast(msg, 'error');
      tokenInputRef.current?.focus();
      return;
    }

    setTokenError('');
    setStarting(true);
    try {
      const res = await apiFetch<{ sessionId: string }>(`/api/student/exams/${tokenModalExam.id}/start`, {
        method: 'POST',
        body: JSON.stringify({ token: cleanedToken }),
      });
      await requestBrowserFullscreen();
      setTokenModalExam(null);
      setTokenInput('');
      setTokenError('');
      navigate(`/exam/${res.sessionId}`, { state: { autoFullscreen: true } });
    } catch (err: any) {
      const msg = err?.message || 'Token yang anda masukkan salah mohon masukan token lagi';
      setTokenError(msg);
      showToast(msg, 'error');
      setTimeout(() => {
        tokenInputRef.current?.focus();
        tokenInputRef.current?.select();
      }, 10);
    } finally {
      setStarting(false);
    }
  };

  const handleResume = async (sessionId: string) => {
    await requestBrowserFullscreen();
    navigate(`/exam/${sessionId}`, { state: { autoFullscreen: true } });
  };

  if (isLoading) return <LoadingRows rows={5} />;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Gagal memuat daftar ujian: {(error as Error).message}
      </div>
    );
  }

  const student = data?.student;
  const exams = data?.exams || [];
  const publishedResults = data?.publishedResults || [];

  return (
    <div className="space-y-8">
      {/* Kartu Identitas Siswa */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-blue-700">
              {student?.school_name} · {student?.active_academic_year} ({student?.active_semester})
            </div>
            <h1 className="text-xl font-bold text-slate-900">{student?.full_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-mono tabular-nums">NIS {student?.nis}</span>
              <span>·</span>
              <span>Kelas {student?.class_name || '-'}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> Akun Peserta Aktif
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Daftar Ujian */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Daftar & Jadwal Ujian Anda</h2>
          <p className="text-sm text-slate-500">
            Pastikan koneksi internet stabil sebelum memulai ujian. Gunakan token yang diberikan oleh pengawas ruang.
          </p>
        </div>

        {exams.length === 0 ? (
          <EmptyState
            title="Belum ada jadwal ujian untuk Anda"
            description="Ujian yang telah dijadwalkan untuk kelas Anda akan muncul secara otomatis di sini."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {exams.map((ex: any) => {
              const meta = EXAM_STATE_META[ex.student_exam_state] || EXAM_STATE_META.belum_mulai;
              const canStart = ex.student_exam_state === 'belum_mulai' && ex.exam_status === 'aktif';
              const canResume = ex.student_exam_state === 'sedang_berlangsung' && ex.active_session_id;

              return (
                <div key={ex.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-blue-700">{ex.subject_name}</span>
                      <StateIndicator variant={meta.variant} label={meta.label} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{ex.title}</h3>
                    {ex.description && <p className="text-xs text-slate-500 line-clamp-2">{ex.description}</p>}

                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-slate-600 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="tabular-nums">{ex.exam_date}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="tabular-nums">
                          {ex.start_time} - {ex.end_time} ({ex.duration_minutes + (ex.extra_minutes || 0)} mnt)
                        </span>
                      </div>
                      <div className="tabular-nums">Jumlah Soal: {ex.question_count}</div>
                      <div className="tabular-nums">
                        Percobaan: {ex.completed_attempts}/{ex.allowed_attempts}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    {ex.published_result ? (
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                        <Award className="h-4 w-4" />
                        <span className="tabular-nums">Nilai Akhir: {ex.published_result.final_score}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {ex.student_exam_state === 'selesai' ? 'Menunggu publikasi nilai' : 'Siap dilaksanakan'}
                      </span>
                    )}

                    {canResume ? (
                      <button
                        type="button"
                        onClick={() => handleResume(ex.active_session_id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Lanjutkan Ujian</span>
                      </button>
                    ) : canStart ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTokenModalExam(ex);
                          setTokenInput('');
                          setTokenError('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Mulai Ujian</span>
                      </button>
                    ) : ex.student_exam_state === 'selesai' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Terkumpul
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Riwayat Hasil Ujian yang Dipublikasikan */}
      {publishedResults.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Riwayat Hasil Ujian (Dipublikasikan)</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nama Ujian</th>
                  <th className="px-4 py-3">Mata Pelajaran</th>
                  <th className="px-4 py-3 text-right">Benar / Salah / Kosong</th>
                  <th className="px-4 py-3 text-right">KKM</th>
                  <th className="px-4 py-3 text-right">Nilai Akhir</th>
                  <th className="px-4 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedResults.map((res: any) => (
                  <tr key={res.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{res.exam_title}</td>
                    <td className="px-4 py-3 text-slate-600">{res.subject_name}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {res.correct_count} / {res.wrong_count} / {res.unanswered_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{res.passing_score}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-blue-700">{res.final_score}</td>
                    <td className="px-4 py-3">
                      <StateIndicator
                        variant={Number(res.final_score) >= Number(res.passing_score) ? 'success' : 'warning'}
                        label={Number(res.final_score) >= Number(res.passing_score) ? 'Tuntas' : 'Perlu Perbaikan'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal Input Token Ujian */}
      <Modal
        open={Boolean(tokenModalExam)}
        onClose={() => {
          setTokenModalExam(null);
          setTokenError('');
        }}
        title="Konfirmasi Token & Mulai Ujian"
        maxWidth="max-w-md"
      >
        {tokenModalExam && (
          <form onSubmit={handleStartExam} noValidate className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-sm text-slate-900">{tokenModalExam.title}</div>
              <div>Mata Pelajaran: {tokenModalExam.subject_name}</div>
              <div>Durasi Pengerjaan: {tokenModalExam.duration_minutes + (tokenModalExam.extra_minutes || 0)} menit</div>
              <div className="pt-1 text-slate-500">
                Selama ujian berlangsung, layar akan masuk ke mode layar penuh (Fullscreen). Tetap berada di tab ujian karena perpindahan tab tercatat untuk tinjauan pengawas.
              </div>
            </div>

            {tokenError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
              >
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{tokenError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Masukkan Token Ujian *</label>
              <input
                ref={tokenInputRef}
                type="text"
                autoFocus
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value.toUpperCase());
                  if (tokenError) setTokenError('');
                }}
                placeholder="Contoh: CBT2026"
                className={`w-full rounded-lg border px-3.5 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest focus:outline-none ${
                  tokenError
                    ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-600'
                    : 'border-slate-300 focus:border-blue-600'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTokenModalExam(null);
                  setTokenError('');
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={starting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {starting ? 'Memvalidasi...' : 'Mulai Kerjakan'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
