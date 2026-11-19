import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import React, { useState } from 'react';
import { InlineMathText, RichMathContent } from '../../components/common/MathRenderer';
import { ConfirmModal, EmptyState, LoadingRows, Modal, StateIndicator } from '../../components/common/UI';
import { QuestionEditorModal } from '../../components/forms/QuestionEditorModal';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import {
  downloadQuestionTemplate,
  parseQuestionWorkbook,
  QUESTION_TYPE_LABELS,
  type ParsedQuestionRow,
} from '../../lib/questionTemplate';
import type { Question, Subject } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  single_choice: 'Pilihan Ganda',
  multiple_choice: 'PG Kompleks',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Uraian',
};

export function QuestionBankPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [subjectId, setSubjectId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [qType, setQType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  // Impor & Template Excel Soal
  const [importOpen, setImportOpen] = useState(false);
  const [defaultSubjectId, setDefaultSubjectId] = useState('');
  const [importBuffer, setImportBuffer] = useState<ArrayBuffer | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedQuestionRow[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: subjectsData } = useQuery({
    queryKey: ['admin-subjects'],
    queryFn: () => apiFetch<{ subjects: Subject[] }>('/api/admin/subjects'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-questions', subjectId, difficulty, qType, search, page],
    queryFn: () =>
      apiFetch<{ questions: Question[]; total: number; limit: number }>(
        `/api/admin/questions?subjectId=${encodeURIComponent(subjectId)}&difficulty=${encodeURIComponent(difficulty)}&type=${encodeURIComponent(qType)}&q=${encodeURIComponent(search)}&page=${page}&limit=15`
      ),
  });

  const handleDuplicate = async (q: Question) => {
    try {
      await apiFetch(`/api/admin/questions/${q.id}/duplicate`, { method: 'POST' });
      showToast('Soal berhasil digandakan.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/questions/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Soal dihapus dari bank soal.', 'success');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDownloadTemplate = () => {
    downloadQuestionTemplate(subjectsData?.subjects || []);
    showToast('Template Excel Bank Soal berhasil diunduh.', 'success');
  };

  const handleSelectImportFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const rows = parseQuestionWorkbook(buf, subjectsData?.subjects || [], defaultSubjectId);
      if (rows.length === 0) {
        showToast('Berkas tidak berisi baris soal. Pastikan mengisi pada sheet "Template Soal".', 'error');
        return;
      }
      setImportBuffer(buf);
      setImportFileName(file.name);
      setParsedRows(rows);
    } catch (err: any) {
      showToast(err?.message || 'Gagal membaca berkas Excel/CSV.', 'error');
    }
  };

  const handleDefaultSubjectChange = (nextSubjectId: string) => {
    setDefaultSubjectId(nextSubjectId);
    if (importBuffer) {
      setParsedRows(parseQuestionWorkbook(importBuffer, subjectsData?.subjects || [], nextSubjectId));
    }
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => !r.error);
    if (validRows.length === 0) {
      showToast('Tidak ada baris soal yang valid untuk diimpor.', 'error');
      return;
    }

    setImporting(true);
    try {
      const res = await apiFetch<{ inserted: number; skippedCount: number; skipped: string[] }>(
        '/api/admin/questions/import',
        {
          method: 'POST',
          body: JSON.stringify({
            defaultSubjectId,
            rows: validRows.map((r) => ({
              rowNumber: r.rowNumber,
              subject_ref: r.subject_ref,
              grade_level: r.grade_level,
              question_type: r.question_type,
              difficulty: r.difficulty,
              weight: r.weight,
              question_text: r.question_text,
              latex_formula: r.latex_formula,
              option_a: r.option_a,
              option_b: r.option_b,
              option_c: r.option_c,
              option_d: r.option_d,
              option_e: r.option_e,
              answer_key: r.answer_key,
              explanation: r.explanation,
            })),
          }),
        }
      );

      showToast(
        res.skippedCount > 0
          ? `Impor selesai: ${res.inserted} soal ditambahkan, ${res.skippedCount} baris dilewati.`
          : `${res.inserted} soal berhasil diimpor ke Bank Soal.`,
        'success'
      );
      setImportOpen(false);
      setImportBuffer(null);
      setImportFileName('');
      setParsedRows([]);
      queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-subjects'] });
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengimpor soal ke server.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const questions = data?.questions || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || 15)));
  const validImportCount = parsedRows.filter((r) => !r.error).length;
  const invalidImportCount = parsedRows.length - validImportCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bank Soal Sekolah</h2>
          <p className="text-sm text-slate-500">
            Kelola butir soal pilihan ganda, kompleks, benar/salah, isian, uraian, bergambar, tabel, dan rumus LaTeX.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>Unduh Template Soal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setImportOpen(true);
              setDefaultSubjectId(subjectId || subjectsData?.subjects[0]?.id || '');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-blue-600" />
            <span>Impor Soal (Excel/CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingQuestion(null);
              setEditorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Buat Soal Baru</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari isi soal atau rumus LaTeX..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Mata Pelajaran</option>
          {(subjectsData?.subjects || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={qType}
          onChange={(e) => {
            setQType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Jenis Soal</option>
          <option value="single_choice">Pilihan Ganda Tunggal</option>
          <option value="multiple_choice">Pilihan Ganda Kompleks</option>
          <option value="true_false">Benar / Salah</option>
          <option value="short_answer">Isian Singkat</option>
          <option value="essay">Uraian</option>
        </select>
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Semua Tingkat Kesulitan</option>
          <option value="mudah">Mudah</option>
          <option value="sedang">Sedang</option>
          <option value="sulit">Sulit</option>
        </select>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : questions.length === 0 ? (
        <EmptyState
          title="Belum ada butir soal"
          description="Tambahkan butir soal dengan teks, rumus matematika/kimia, tabel, atau gambar."
          actionLabel="Buat Soal Pertama"
          onAction={() => {
            setEditingQuestion(null);
            setEditorOpen(true);
          }}
        />
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-900 tabular-nums">#{(page - 1) * 15 + idx + 1}</span>
                  <span>·</span>
                  <span className="font-medium text-blue-700">{q.subject_name}</span>
                  <span>·</span>
                  <span>{TYPE_LABELS[q.question_type] || q.question_type}</span>
                  <span>·</span>
                  <span className="capitalize">Kesulitan: {q.difficulty}</span>
                  <span>·</span>
                  <span>Tingkat {q.grade_level}</span>
                  <span>·</span>
                  <span className="tabular-nums font-medium text-slate-700">Bobot {q.weight}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQuestion(q);
                      setEditorOpen(true);
                    }}
                    title="Edit soal"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(q)}
                    title="Gandakan soal"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplikat
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(q)}
                    title="Hapus soal"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </button>
                </div>
              </div>

              <RichMathContent
                html={q.content_html}
                latexFormula={q.latex_formula}
                imageUrl={q.image_url}
                imageWidth={q.image_width}
                tableJson={q.table_json}
              />

              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  {q.options.map((opt) => (
                    <div
                      key={opt.id || opt.option_label}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                        opt.is_correct ? 'border-emerald-300 bg-emerald-50/50 text-slate-900' : 'border-slate-200 bg-slate-50/40 text-slate-700'
                      }`}
                    >
                      <span className="font-semibold shrink-0">{opt.option_label}.</span>
                      <div className="flex-1 min-w-0">
                        <InlineMathText html={opt.content_html} />
                      </div>
                      {Boolean(opt.is_correct) && (
                        <span className="text-xs font-semibold text-emerald-700 shrink-0">Kunci</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {q.question_type === 'short_answer' && (
                <div className="text-xs text-emerald-700 font-medium">
                  Kunci Jawaban Singkat: <span className="font-mono">{q.correct_answer_text}</span>
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-slate-500 tabular-nums">
                Halaman {page} dari {totalPages} ({data?.total} soal)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <QuestionEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-questions'] })}
        subjects={subjectsData?.subjects || []}
        initialQuestion={editingQuestion}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        danger
        title="Hapus Butir Soal"
        message="Yakin ingin menghapus butir soal ini dari bank soal?"
        confirmLabel="Hapus Soal"
      />

      {/* Modal Impor Massal Soal dari Template Excel */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportBuffer(null);
          setImportFileName('');
          setParsedRows([]);
        }}
        title="Impor Soal dari Template Excel / CSV"
        maxWidth="max-w-5xl"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="font-semibold text-sm text-slate-900">Langkah Mudah Buat Soal Massal</div>
              <p>
                1. Unduh template Excel berisi contoh lengkap (PG, PG Kompleks, Benar/Salah, Isian, Uraian) dan daftar kode mapel sekolah.
              </p>
              <p>
                2. Isi daftar soal Anda pada sheet <strong>Template Soal</strong>, lalu unggah kembali berkasnya di bawah ini.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Unduh Template (.xlsx)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Mata Pelajaran Default (jika kolom Mapel kosong)
              </label>
              <select
                value={defaultSubjectId}
                onChange={(e) => handleDefaultSubjectChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">-- Sesuai kolom Kode/Nama Mapel di file --</option>
                {(subjectsData?.subjects || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Unggah Berkas Template Soal (.xlsx, .xls, .csv)
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600 hover:border-blue-400">
                <span className="truncate">{importFileName || 'Pilih berkas Excel/CSV dari komputer...'}</span>
                <span className="ml-3 rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 shrink-0">
                  Pilih Berkas
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSelectImportFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800 tabular-nums">
                    Total Terbaca: {parsedRows.length} baris
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    Valid: {validImportCount}
                  </span>
                  {invalidImportCount > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-red-600 tabular-nums">
                        Perlu Perbaikan: {invalidImportCount}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-slate-500">Hanya baris berstatus Valid yang akan disimpan ke Bank Soal.</span>
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Baris</th>
                      <th className="px-3 py-2">Mapel</th>
                      <th className="px-3 py-2">Jenis</th>
                      <th className="px-3 py-2">Pertanyaan</th>
                      <th className="px-3 py-2">Kunci</th>
                      <th className="px-3 py-2 text-right">Bobot</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNumber} className={row.error ? 'bg-red-50/40' : ''}>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500">#{row.rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{row.resolvedSubjectName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {row.normalizedType ? QUESTION_TYPE_LABELS[row.normalizedType] : row.question_type}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate text-slate-900" title={row.question_text}>
                          {row.question_text || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">{row.answer_key || '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.weight}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <StateIndicator variant="danger" label={row.error} />
                          ) : (
                            <StateIndicator variant="success" label="Valid" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || validImportCount === 0}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {importing ? 'Mengimpor soal...' : `Impor ${validImportCount} Soal Valid`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
