import { useQuery, useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart3, CheckCircle2, ClipboardCheck, Download, Eye, FileSpreadsheet, Globe, Lock } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { RichMathContent } from '../../components/common/MathRenderer';
import { EmptyState, LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { Exam, SchoolClass, Subject } from '../../types';

export function ResultsAndReportsPage({ mode = 'results' }: { mode?: 'results' | 'reports' }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [examFilter, setExamFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [analysisExamId, setAnalysisExamId] = useState<string | null>(null);
  const [manualScores, setManualScores] = useState<Record<string, { score: string; note: string }>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  useEffect(() => {
    setManualScores({});
    setQuestionFeedback({});
    setSavingQuestionId(null);
  }, [detailSessionId]);

  const { data: examsData } = useQuery({
    queryKey: ['admin-exams'],
    queryFn: () => apiFetch<{ exams: Exam[] }>('/api/admin/exams'),
  });
  const { data: classesData } = useQuery({
    queryKey: ['admin-classes'],
    queryFn: () => apiFetch<{ classes: SchoolClass[] }>('/api/admin/classes'),
  });
  const { data: subjectsData } = useQuery({
    queryKey: ['admin-subjects'],
    queryFn: () => apiFetch<{ subjects: Subject[] }>('/api/admin/subjects'),
  });

  const { data: resultsData, isLoading } = useQuery({
    queryKey: ['admin-results', examFilter, classFilter, subjectFilter],
    queryFn: () =>
      apiFetch<{ results: any[] }>(
        `/api/admin/results?examId=${encodeURIComponent(examFilter)}&classId=${encodeURIComponent(classFilter)}&subjectId=${encodeURIComponent(subjectFilter)}`
      ),
  });

  const { data: detailData, isLoading: isDetailLoading, refetch: refetchDetail } = useQuery({
    queryKey: ['admin-result-detail', detailSessionId],
    enabled: Boolean(detailSessionId),
    queryFn: () => apiFetch<any>(`/api/admin/results/${detailSessionId}/detail`),
  });

  const { data: analysisData } = useQuery({
    queryKey: ['admin-exam-analysis', analysisExamId],
    enabled: Boolean(analysisExamId),
    queryFn: () => apiFetch<{ analysis: any[] }>(`/api/admin/exams/${analysisExamId}/analysis`),
  });

  const results = resultsData?.results || [];
  const selectedExamObj = (examsData?.exams || []).find((e) => e.id === examFilter);

  // Statistik Ringkas
  const avgScore = results.length > 0 ? (results.reduce((a, b) => a + Number(b.final_score), 0) / results.length).toFixed(2) : '0.00';
  const highest = results.length > 0 ? Math.max(...results.map((r) => Number(r.final_score))).toFixed(2) : '0.00';
  const lowest = results.length > 0 ? Math.min(...results.map((r) => Number(r.final_score))).toFixed(2) : '0.00';

  const handleTogglePublish = async (examId: string, publish: boolean) => {
    try {
      await apiFetch(`/api/admin/exams/${examId}/publish-results`, {
        method: 'POST',
        body: JSON.stringify({ publish }),
      });
      showToast(publish ? 'Nilai ujian dipublikasikan ke siswa.' : 'Publikasi nilai ditutup.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-exams'] });
      queryClient.invalidateQueries({ queryKey: ['admin-results'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveManualGrade = async (item: any) => {
    if (!detailSessionId) return;
    const questionId = item.id;
    const maxWeight = Number(item.custom_weight ?? item.weight ?? 1);
    const currentEntry = manualScores[questionId];
    const rawScoreStr = (
      currentEntry?.score ??
      (item.manual_score !== null && item.manual_score !== undefined ? String(item.manual_score) : '')
    ).trim();
    const noteStr = currentEntry?.note ?? (item.grader_note ?? '');

    if (rawScoreStr === '') {
      const msg = `Masukkan nilai uraian (0 - ${maxWeight}) terlebih dahulu.`;
      setQuestionFeedback((prev) => ({ ...prev, [questionId]: { type: 'error', message: msg } }));
      showToast(msg, 'error');
      return;
    }

    const parsedScore = Number(rawScoreStr.replace(',', '.'));
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxWeight) {
      const msg = `Nilai uraian harus berupa angka antara 0 sampai ${maxWeight}.`;
      setQuestionFeedback((prev) => ({ ...prev, [questionId]: { type: 'error', message: msg } }));
      showToast(msg, 'error');
      return;
    }

    setSavingQuestionId(questionId);
    setQuestionFeedback((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });

    try {
      await apiFetch(`/api/admin/results/${detailSessionId}/manual-grade`, {
        method: 'POST',
        body: JSON.stringify({
          questionId,
          manualScore: parsedScore,
          graderNote: noteStr,
        }),
      });
      setManualScores((prev) => ({
        ...prev,
        [questionId]: { score: String(parsedScore), note: noteStr },
      }));
      setQuestionFeedback((prev) => ({
        ...prev,
        [questionId]: {
          type: 'success',
          message: `Nilai uraian tersimpan (${parsedScore} / ${maxWeight}) dan skor akhir diperbarui.`,
        },
      }));
      showToast('Nilai uraian disimpan dan skor akhir dihitung ulang.', 'success');
      await refetchDetail();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-results'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
      ]);
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyimpan nilai uraian.';
      setQuestionFeedback((prev) => ({ ...prev, [questionId]: { type: 'error', message: msg } }));
      showToast(msg, 'error');
    } finally {
      setSavingQuestionId(null);
    }
  };

  const handleExportExcel = () => {
    const rows = results.map((r, i) => ({
      No: i + 1,
      NIS: r.nis,
      'Nama Peserta': r.student_name,
      Kelas: r.class_name || '-',
      Ujian: r.exam_title,
      'Mata Pelajaran': r.subject_name,
      Benar: r.correct_count,
      Salah: r.wrong_count,
      Kosong: r.unanswered_count,
      'Nilai Akhir': r.final_score,
      Keterangan: Number(r.final_score) >= Number(r.passing_score) ? 'Tuntas' : 'Belum Tuntas',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Nilai CBT');
    XLSX.writeFile(wb, `laporan-hasil-ujian-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Laporan Excel berhasil diunduh.', 'success');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('LAPORAN HASIL UJIAN CBT ONLINE SEKOLAH/MADRASAH', 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Tanggal Cetak: ${new Date().toLocaleString('id-ID')}   |   Jumlah Peserta: ${results.length}   |   Rata-rata: ${avgScore}   |   Tertinggi: ${highest}   |   Terendah: ${lowest}`,
      14,
      23
    );

    autoTable(doc, {
      startY: 29,
      head: [['No', 'NIS', 'Nama Peserta', 'Kelas', 'Ujian', 'Mapel', 'Benar', 'Salah', 'Nilai', 'Status']],
      body: results.map((r, i) => [
        i + 1,
        r.nis,
        r.student_name,
        r.class_name || '-',
        r.exam_title,
        r.subject_name,
        r.correct_count,
        r.wrong_count,
        r.final_score,
        Number(r.final_score) >= Number(r.passing_score) ? 'Tuntas' : 'Remedial',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
    });

    doc.save(`laporan-hasil-ujian-${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Laporan PDF berhasil diunduh.', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {mode === 'reports' ? 'Laporan & Analisis Hasil Ujian' : 'Hasil Ujian & Koreksi Manual'}
          </h2>
          <p className="text-sm text-slate-500">
            Tinjau perolehan nilai peserta, koreksi soal uraian, analisis butir soal, dan unduh laporan Excel/PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {examFilter && (
            <button
              type="button"
              onClick={() => setAnalysisExamId(examFilter)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <BarChart3 className="h-4 w-4 text-blue-600" />
              <span>Analisis Butir Soal</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={results.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Unduh Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={results.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <select
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Ujian</option>
          {(examsData?.exams || []).map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
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
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Mata Pelajaran</option>
          {(subjectsData?.subjects || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Kontrol Publikasi Nilai Ujian Terpilih */}
      {selectedExamObj && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="text-sm">
            <span className="font-semibold text-slate-900">{selectedExamObj.title}</span>
            <span className="mx-2 text-slate-300">·</span>
            <span className="text-slate-600">
              Status Publikasi:{' '}
              <strong>{selectedExamObj.results_published ? 'Terbuka untuk Siswa' : 'Disembunyikan dari Siswa'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleTogglePublish(selectedExamObj.id, !selectedExamObj.results_published)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${
              selectedExamObj.results_published
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {selectedExamObj.results_published ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
            <span>{selectedExamObj.results_published ? 'Tutup Publikasi Nilai' : 'Publikasikan Nilai ke Siswa'}</span>
          </button>
        </div>
      )}

      {/* Ringkasan Statistik */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Jumlah Peserta Dinilai</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{results.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Rata-Rata Nilai</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{avgScore}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Nilai Tertinggi</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{highest}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Nilai Terendah</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-red-700">{lowest}</div>
        </div>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : results.length === 0 ? (
        <EmptyState
          title="Belum ada hasil ujian pada filter ini"
          description="Hasil akan otomatis muncul segera setelah peserta menyelesaikan sesi ujian."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Peserta</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Ujian / Mapel</th>
                <th className="px-4 py-3 text-right">B / S / K</th>
                <th className="px-4 py-3 text-right">Nilai Akhir</th>
                <th className="px-4 py-3">Status Koreksi</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.student_name}</div>
                    <div className="font-mono text-xs text-slate-500">{r.nis}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.class_name || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.exam_title}</div>
                    <div className="text-xs text-slate-500">{r.subject_name}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                    {r.correct_count} / {r.wrong_count} / {r.unanswered_count}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{r.final_score}</td>
                  <td className="px-4 py-3">
                    {r.needs_manual_grading ? (
                      <StateIndicator variant="warning" label="Perlu Koreksi Uraian" />
                    ) : Number(r.final_score) >= Number(r.passing_score) ? (
                      <StateIndicator variant="success" label="Tuntas" />
                    ) : (
                      <StateIndicator variant="danger" label="Di Bawah KKM" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDetailSessionId(r.session_id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {r.needs_manual_grading ? <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{r.needs_manual_grading ? 'Koreksi Jawaban' : 'Detail Jawaban'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Detail Jawaban & Koreksi Uraian Manual */}
      <Modal
        open={Boolean(detailSessionId)}
        onClose={() => setDetailSessionId(null)}
        title={`Lembar Jawaban: ${detailData?.result?.student_name || ''}`}
        maxWidth="max-w-4xl"
      >
        {isDetailLoading && !detailData ? (
          <LoadingRows rows={4} />
        ) : detailData ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span>
                NIS {detailData.result.nis} · {detailData.result.class_name || '-'}
              </span>
              <span className="font-bold text-blue-700 tabular-nums">
                Skor Akhir Saat Ini: {detailData.result.final_score} (Raw {detailData.result.raw_score}/{detailData.result.max_score})
              </span>
            </div>

            <div className="space-y-4">
              {(detailData.items || []).map((item: any, idx: number) => {
                let selectedIds: string[] = [];
                try {
                  selectedIds = JSON.parse(item.selected_option_ids_json || '[]');
                } catch {
                  selectedIds = [];
                }
                const maxWeight = Number(item.custom_weight ?? item.weight ?? 1);
                const hasManualScore = item.manual_score !== null && item.manual_score !== undefined;
                const feedback = questionFeedback[item.id];
                const isSaving = savingQuestionId === item.id;
                const scoreInputValue =
                  manualScores[item.id]?.score ?? (hasManualScore ? String(item.manual_score) : '');
                const noteInputValue =
                  manualScores[item.id]?.note ?? (item.grader_note ?? '');

                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">
                        Soal #{idx + 1} · {item.question_type} · Bobot Maks {maxWeight}
                      </span>
                      {item.question_type === 'essay' ? (
                        hasManualScore ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 tabular-nums">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Dinilai Manual (+{item.manual_score})
                          </span>
                        ) : (
                          <span className="font-medium text-amber-700">Perlu Koreksi Manual</span>
                        )
                      ) : item.is_correct ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Benar (+{item.auto_score})
                        </span>
                      ) : (
                        <span className="font-medium text-red-600">Salah (+{item.auto_score})</span>
                      )}
                    </div>

                    <RichMathContent html={item.content_html} latexFormula={item.latex_formula} imageUrl={item.image_url} imageWidth="45%" />

                    {item.options?.length > 0 && (
                      <div className="space-y-1 text-xs">
                        {item.options.map((o: any) => {
                          const picked = selectedIds.includes(o.id);
                          return (
                            <div
                              key={o.id}
                              className={`flex items-center justify-between rounded border px-3 py-1.5 ${
                                picked && o.is_correct
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : picked && !o.is_correct
                                  ? 'border-red-300 bg-red-50'
                                  : o.is_correct
                                  ? 'border-emerald-200 bg-emerald-50/40'
                                  : 'border-slate-100'
                              }`}
                            >
                              <span>
                                <strong>{o.option_label}.</strong> <span dangerouslySetInnerHTML={{ __html: o.content_html }} />
                              </span>
                              <span className="text-[11px] font-medium">
                                {picked ? 'Dipilih Siswa' : ''} {o.is_correct ? '· Kunci' : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(item.question_type === 'short_answer' || item.question_type === 'essay') && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                        <div>
                          <span className="font-semibold text-slate-700">Jawaban Siswa: </span>
                          <span className="text-slate-900 whitespace-pre-wrap">{item.answer_text || '(Kosong)'}</span>
                        </div>
                        {item.question_type === 'essay' && (
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveManualGrade(item);
                              }}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <input
                                type="number"
                                min={0}
                                max={maxWeight}
                                step="any"
                                placeholder={`Skor (0 - ${maxWeight})`}
                                value={scoreInputValue}
                                onChange={(e) =>
                                  setManualScores((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      score: e.target.value,
                                      note: prev[item.id]?.note ?? (item.grader_note ?? ''),
                                    },
                                  }))
                                }
                                className="w-32 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                              />
                              <input
                                type="text"
                                placeholder="Catatan korektor (opsional)"
                                value={noteInputValue}
                                onChange={(e) =>
                                  setManualScores((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      score:
                                        prev[item.id]?.score ??
                                        (hasManualScore ? String(item.manual_score) : ''),
                                      note: e.target.value,
                                    },
                                  }))
                                }
                                className="flex-1 min-w-[180px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              />
                              <button
                                type="submit"
                                disabled={isSaving}
                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                              >
                                {isSaving ? 'Menyimpan...' : 'Simpan Nilai Uraian'}
                              </button>
                            </form>
                            {feedback && (
                              <div
                                className={`text-xs font-medium ${
                                  feedback.type === 'success' ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {feedback.message}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Analisis Butir Soal */}
      <Modal
        open={Boolean(analysisExamId)}
        onClose={() => setAnalysisExamId(null)}
        title="Analisis Butir Soal Ujian"
        maxWidth="max-w-3xl"
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5">No</th>
                <th className="px-3 py-2.5">Jenis</th>
                <th className="px-3 py-2.5">Total Jawab</th>
                <th className="px-3 py-2.5">Benar</th>
                <th className="px-3 py-2.5">Tingkat Ketercapaian</th>
                <th className="px-3 py-2.5">Kategori Empiris</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(analysisData?.analysis || []).map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">#{row.number}</td>
                  <td className="px-3 py-2.5">{row.question_type}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.total_attempts}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.correct_attempts}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">{row.correct_rate}%</td>
                  <td className="px-3 py-2.5 font-medium">{row.empirical_difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
