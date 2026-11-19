import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Maximize2,
  Send,
  Wifi,
  WifiOff,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { InlineMathText, RichMathContent } from '../../components/common/MathRenderer';
import { ConfirmModal, LoadingRows } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';

interface LocalAnswerState {
  selectedOptionIds: string[];
  answerText: string;
  isFlagged: boolean;
}

function formatTimer(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ExamRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, LocalAnswerState>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [warningBanner, setWarningBanner] = useState('');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const seqRef = useRef<number>(1);
  const pendingQueueRef = useRef<Map<string, LocalAnswerState>>(new Map());
  const submittedRef = useRef(false);

  // Pastikan layar penuh aktif saat baru masuk ruang ujian jika belum fullscreen
  useEffect(() => {
    const shouldAutoFullscreen = Boolean((location.state as { autoFullscreen?: boolean } | null)?.autoFullscreen);
    if (shouldAutoFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, [location.state]);

  // Muat sesi ujian dari server (tanpa kunci jawaban!)
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    apiFetch<any>(`/api/student/sessions/${sessionId}`)
      .then((data) => {
        setSessionInfo(data.session);
        setQuestions(data.questions || []);
        setRemainingSeconds(data.session.remaining_seconds);

        const initialMap: Record<string, LocalAnswerState> = {};
        let maxSeq = 1;
        for (const a of data.answers || []) {
          let sel: string[] = [];
          try {
            sel = JSON.parse(a.selected_option_ids_json || '[]');
          } catch {
            sel = [];
          }
          initialMap[a.question_id] = {
            selectedOptionIds: sel,
            answerText: a.answer_text || '',
            isFlagged: Boolean(a.is_flagged),
          };
          if (a.client_seq && a.client_seq >= maxSeq) maxSeq = a.client_seq + 1;
        }
        seqRef.current = maxSeq;
        setAnswersMap(initialMap);
        setLoading(false);
      })
      .catch((err: any) => {
        setLoadError(err.message || 'Tidak dapat memuat sesi ujian.');
        setLoading(false);
      });
  }, [sessionId]);

  // Kirim jawaban ke server dengan retry & idempotency key
  const persistAnswer = useCallback(
    async (questionId: string, state: LocalAnswerState) => {
      if (!sessionId || submittedRef.current) return;
      setSaveState('saving');
      const seq = seqRef.current++;
      const idemKey = `${sessionId}-${questionId}-${seq}`;

      try {
        const res = await apiFetch<{ saved: boolean; remainingSeconds: number }>(
          `/api/student/sessions/${sessionId}/answers`,
          {
            method: 'PUT',
            body: JSON.stringify({
              questionId,
              selectedOptionIds: state.selectedOptionIds,
              answerText: state.answerText,
              isFlagged: state.isFlagged,
              idempotencyKey: idemKey,
              clientSeq: seq,
            }),
          }
        );
        pendingQueueRef.current.delete(questionId);
        if (typeof res.remainingSeconds === 'number') {
          setRemainingSeconds(res.remainingSeconds);
        }
        setSaveState('saved');
      } catch {
        pendingQueueRef.current.set(questionId, state);
        setSaveState('offline');
      }
    },
    [sessionId]
  );

  // Flush antrean retry setiap koneksi pulih atau berkala 8 detik
  useEffect(() => {
    const flushPending = async () => {
      if (!navigator.onLine || pendingQueueRef.current.size === 0 || submittedRef.current) return;
      const entries = Array.from(pendingQueueRef.current.entries());
      for (const [qId, state] of entries) {
        await persistAnswer(qId, state);
      }
    };
    const timer = setInterval(flushPending, 8000);
    return () => clearInterval(timer);
  }, [persistAnswer]);

  // Submit final ujian
  const submitExam = useCallback(
    async (isTimeout = false) => {
      if (!sessionId || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        // Pastikan antrean tertunda dicoba kirim dulu
        for (const [qId, state] of Array.from(pendingQueueRef.current.entries())) {
          await persistAnswer(qId, state).catch(() => {});
        }
        const res = await apiFetch<any>(`/api/student/sessions/${sessionId}/submit`, {
          method: 'POST',
          body: JSON.stringify({ isTimeout }),
        });
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        showToast(
          isTimeout
            ? 'Waktu habis! Jawaban Anda telah dikumpulkan otomatis oleh sistem.'
            : res.resultsPublished && res.result
            ? `Ujian selesai dikumpulkan. Nilai Anda: ${res.result.final_score}`
            : 'Ujian selesai dikumpulkan! Terima kasih telah mengikuti ujian.',
          'success'
        );
        navigate('/student', { replace: true });
      } catch (err: any) {
        submittedRef.current = false;
        setSubmitting(false);
        showToast(err.message || 'Gagal mengumpulkan ujian. Coba lagi.', 'error');
      }
    },
    [sessionId, persistAnswer, showToast, navigate]
  );

  // Hitung mundur timer & auto-submit saat habis + heartbeat sinkronisasi waktu server tiap 25 detik
  useEffect(() => {
    if (!sessionInfo || loading) return;
    const secInterval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(secInterval);
          submitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const heartbeatInterval = setInterval(() => {
      if (!sessionId || submittedRef.current) return;
      apiFetch<{ ok: boolean; remainingSeconds: number }>(`/api/student/sessions/${sessionId}/activity`, {
        method: 'POST',
        body: JSON.stringify({ eventType: 'heartbeat' }),
      })
        .then((res) => {
          if (typeof res.remainingSeconds === 'number') {
            setRemainingSeconds(res.remainingSeconds);
            if (res.remainingSeconds <= 0) submitExam(true);
          }
        })
        .catch(() => {});
    }, 25_000);

    return () => {
      clearInterval(secInterval);
      clearInterval(heartbeatInterval);
    };
  }, [sessionInfo, loading, sessionId, submitExam]);

  // Pemantauan aktivitas peserta (tanpa menggugurkan otomatis!)
  useEffect(() => {
    if (!sessionId || loading) return;

    const logEvent = (eventType: string, details: string) => {
      if (submittedRef.current) return;
      apiFetch(`/api/student/sessions/${sessionId}/activity`, {
        method: 'POST',
        body: JSON.stringify({ eventType, details }),
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.hidden) {
        setWarningBanner('Peringatan: Anda terdeteksi berpindah tab/aplikasi. Tetap fokus pada halaman ujian.');
        logEvent('tab_switch', 'Peserta meninggalkan tab ujian');
      }
    };

    const onBlur = () => {
      logEvent('window_blur', 'Jendela ujian kehilangan fokus');
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setWarningBanner('Anda keluar dari mode layar penuh (Fullscreen). Klik tombol Layar Penuh untuk kenyamanan ujian.');
        logEvent('fullscreen_exit', 'Peserta keluar dari mode fullscreen');
      } else {
        setWarningBanner('');
      }
    };

    const onOffline = () => {
      setIsOnline(false);
      setSaveState('offline');
      logEvent('connection_lost', 'Koneksi internet peserta terputus');
    };

    const onOnline = () => {
      setIsOnline(true);
      logEvent('connection_restored', 'Koneksi internet peserta pulih');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [sessionId, loading]);

  const updateAnswer = (questionId: string, updater: (prev: LocalAnswerState) => LocalAnswerState, immediate = true) => {
    setAnswersMap((prev) => {
      const curr = prev[questionId] || { selectedOptionIds: [], answerText: '', isFlagged: false };
      const next = updater(curr);
      if (immediate) {
        persistAnswer(questionId, next);
      }
      return { ...prev, [questionId]: next };
    });
  };

  // Debounce khusus input teks (isian singkat & uraian)
  const textTimerRef = useRef<Record<string, any>>({});
  const handleTextChange = (questionId: string, text: string) => {
    updateAnswer(questionId, (curr) => ({ ...curr, answerText: text }), false);
    if (textTimerRef.current[questionId]) clearTimeout(textTimerRef.current[questionId]);
    textTimerRef.current[questionId] = setTimeout(() => {
      setAnswersMap((latest) => {
        const currentAns = latest[questionId];
        if (currentAns) persistAnswer(questionId, currentAns);
        return latest;
      });
    }, 600);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-8 mt-12 rounded-xl border border-red-200 bg-white text-center space-y-4">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="text-lg font-bold text-slate-900">Sesi Ujian Tidak Tersedia</h2>
        <p className="text-sm text-slate-600">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/student')}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white"
        >
          Kembali ke Dashboard Siswa
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx];
  const currentAnswer: LocalAnswerState = currentQuestion
    ? answersMap[currentQuestion.id] || { selectedOptionIds: [], answerText: '', isFlagged: false }
    : { selectedOptionIds: [], answerText: '', isFlagged: false };

  const isQuestionAnswered = (q: any) => {
    const a = answersMap[q.id];
    if (!a) return false;
    if (q.question_type === 'short_answer' || q.question_type === 'essay') {
      return a.answerText.trim().length > 0;
    }
    return a.selectedOptionIds.length > 0;
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const flaggedCount = questions.filter((q) => answersMap[q.id]?.isFlagged).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header Ruang Ujian */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 truncate">
              {sessionInfo?.student_name} · NIS {sessionInfo?.nis} · {sessionInfo?.class_name || '-'}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">{sessionInfo?.exam_title}</h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              {isOnline && saveState !== 'offline' ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-slate-600">{saveState === 'saving' ? 'Menyimpan...' : 'Tersimpan otomatis'}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-red-700 font-medium">Koneksi terputus (antrean aman)</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              title="Aktifkan Layar Penuh"
              className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Layar Penuh</span>
            </button>

            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                remainingSeconds <= 300
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Peringatan Aktivitas */}
      {warningBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900">
          <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>{warningBanner}</span>
            </div>
            <button type="button" onClick={() => setWarningBanner('')} className="font-semibold underline shrink-0">
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Workspace 2 Kolom: Panel Soal + Navigasi Nomor Soal */}
      <div className="mx-auto w-full max-w-7xl flex-1 grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12">
        {/* Panel Soal Utama */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          {currentQuestion && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  Soal Nomor {currentIdx + 1} dari {questions.length}
                </span>
                <span className="text-xs text-slate-500">
                  {currentQuestion.question_type === 'single_choice'
                    ? 'Pilihan Ganda'
                    : currentQuestion.question_type === 'multiple_choice'
                    ? 'Pilihan Ganda Kompleks (Pilih lebih dari 1)'
                    : currentQuestion.question_type === 'true_false'
                    ? 'Benar / Salah'
                    : currentQuestion.question_type === 'short_answer'
                    ? 'Isian Singkat'
                    : 'Uraian'}
                </span>
              </div>

              <RichMathContent
                html={currentQuestion.content_html}
                latexFormula={currentQuestion.latex_formula}
                imageUrl={currentQuestion.image_url}
                imageWidth={currentQuestion.image_width}
                tableJson={currentQuestion.table_json}
              />

              {/* Input Pilihan Jawaban */}
              {(currentQuestion.question_type === 'single_choice' || currentQuestion.question_type === 'true_false') && (
                <div className="space-y-2.5 pt-2">
                  {(currentQuestion.options || []).map((opt: any) => {
                    const selected = currentAnswer.selectedOptionIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          updateAnswer(currentQuestion.id, (curr) => ({ ...curr, selectedOptionIds: [opt.id] }))
                        }
                        className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left text-sm transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50/60 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                            selected ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {opt.option_label}
                        </span>
                        <div className="flex-1 pt-0.5">
                          <InlineMathText html={opt.content_html} />
                          {opt.image_url && (
                            <img src={opt.image_url} alt="Opsi" className="mt-2 max-h-36 rounded border border-slate-200" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.question_type === 'multiple_choice' && (
                <div className="space-y-2.5 pt-2">
                  {(currentQuestion.options || []).map((opt: any) => {
                    const selected = currentAnswer.selectedOptionIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          updateAnswer(currentQuestion.id, (curr) => {
                            const exists = curr.selectedOptionIds.includes(opt.id);
                            return {
                              ...curr,
                              selectedOptionIds: exists
                                ? curr.selectedOptionIds.filter((id) => id !== opt.id)
                                : [...curr.selectedOptionIds, opt.id],
                            };
                          })
                        }
                        className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left text-sm transition-colors ${
                          selected ? 'border-blue-600 bg-blue-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <input type="checkbox" readOnly checked={selected} className="mt-1 h-4 w-4 text-blue-600" />
                        <span className="font-bold text-slate-700">{opt.option_label}.</span>
                        <div className="flex-1">
                          <InlineMathText html={opt.content_html} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.question_type === 'short_answer' && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Jawaban Singkat Anda</label>
                  <input
                    type="text"
                    value={currentAnswer.answerText}
                    onChange={(e) => handleTextChange(currentQuestion.id, e.target.value)}
                    placeholder="Ketik jawaban singkat di sini..."
                    className="w-full max-w-md rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}

              {currentQuestion.question_type === 'essay' && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Jawaban Uraian Anda</label>
                  <textarea
                    rows={6}
                    value={currentAnswer.answerText}
                    onChange={(e) => handleTextChange(currentQuestion.id, e.target.value)}
                    placeholder="Tuliskan langkah penyelesaian dan jawaban uraian secara lengkap..."
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm leading-relaxed focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tombol Aksi Navigasi Bawah */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Sebelumnya</span>
            </button>

            <button
              type="button"
              onClick={() =>
                currentQuestion &&
                updateAnswer(currentQuestion.id, (curr) => ({ ...curr, isFlagged: !curr.isFlagged }))
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium ${
                currentAnswer.isFlagged
                  ? 'border-amber-400 bg-amber-100 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Flag className="h-4 w-4" />
              <span>{currentAnswer.isFlagged ? 'Batalkan Tanda' : 'Tandai Soal'}</span>
            </button>

            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <span>Selanjutnya</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Send className="h-4 w-4" />
                <span>Selesai Ujian</span>
              </button>
            )}
          </div>
        </div>

        {/* Panel Navigasi Nomor Soal */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Navigasi Nomor Soal</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {answeredCount}/{questions.length} terjawab
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const answered = isQuestionAnswered(q);
                const flagged = Boolean(answersMap[q.id]?.isFlagged);
                const isCurrent = idx === currentIdx;

                let colorCls = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
                if (flagged) {
                  colorCls = 'bg-amber-400 text-slate-900 border-amber-500';
                } else if (answered) {
                  colorCls = 'bg-emerald-600 text-white border-emerald-700';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-10 rounded-lg border text-sm font-semibold tabular-nums transition-transform ${colorCls} ${
                      isCurrent ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legenda Warna Navigasi */}
            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded bg-emerald-600 inline-block shrink-0" />
                <span>Hijau: Sudah dijawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded bg-amber-400 inline-block shrink-0" />
                <span>Kuning: Ditandai untuk ditinjau ({flaggedCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded bg-slate-200 inline-block shrink-0" />
                <span>Abu-abu: Belum dijawab ({unansweredCount})</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmSubmitOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Kumpulkan & Selesai Ujian</span>
            </button>
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={() => submitExam(false)}
        loading={submitting}
        title="Konfirmasi Pengumpulan Ujian"
        message={`Anda telah menjawab ${answeredCount} dari ${questions.length} soal (${unansweredCount} belum dijawab, ${flaggedCount} ditandai). Setelah dikumpulkan, jawaban tidak dapat diubah lagi. Lanjutkan?`}
        confirmLabel="Ya, Kumpulkan Jawaban"
      />
    </div>
  );
}
