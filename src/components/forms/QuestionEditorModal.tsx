import { Bold, Eye, ImagePlus, Italic, List, Plus, Sigma, Subscript, Superscript, Table, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { DifficultyLevel, Question, QuestionOption, QuestionType, Subject } from '../../types';
import { LatexBlock, RichMathContent } from '../common/MathRenderer';
import { Modal } from '../common/UI';

const LATEX_SNIPPETS = [
  { label: 'Pecahan', code: '\\frac{a}{b}' },
  { label: 'Akar', code: '\\sqrt{x^2 + y^2}' },
  { label: 'Integral', code: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'Turunan', code: '\\frac{dy}{dx} = 3x^2' },
  { label: 'Matriks', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { label: 'Sigma', code: '\\sum_{i=1}^{n} x_i' },
  { label: 'Kimia', code: '2H_2(g) + O_2(g) \\rightarrow 2H_2O(l)' },
  { label: 'Kesetimbangan', code: 'N_2 + 3H_2 \\rightleftharpoons 2NH_3' },
  { label: 'Yunani', code: '\\alpha, \\beta, \\theta, \\Delta, \\pi' },
];

export function QuestionEditorModal({
  open,
  onClose,
  onSaved,
  subjects,
  initialQuestion,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  subjects: Subject[];
  initialQuestion?: Question | null;
}) {
  const { showToast } = useToast();
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const [tab, setTab] = useState<'editor' | 'preview'>('editor');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [subjectId, setSubjectId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('XII');
  const [questionType, setQuestionType] = useState<QuestionType>('single_choice');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('sedang');
  const [weight, setWeight] = useState(10);
  const [contentHtml, setContentHtml] = useState('');
  const [latexFormula, setLatexFormula] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageWidth, setImageWidth] = useState('65%');
  const [useTable, setUseTable] = useState(false);
  const [tableHeaders, setTableHeaders] = useState<string[]>(['Kolom 1', 'Kolom 2']);
  const [tableRows, setTableRows] = useState<string[][]>([
    ['Data 1', 'Data 2'],
    ['Data 3', 'Data 4'],
  ]);
  const [correctAnswerText, setCorrectAnswerText] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>([
    { option_label: 'A', content_html: '', image_url: '', is_correct: true },
    { option_label: 'B', content_html: '', image_url: '', is_correct: false },
    { option_label: 'C', content_html: '', image_url: '', is_correct: false },
    { option_label: 'D', content_html: '', image_url: '', is_correct: false },
  ]);

  useEffect(() => {
    if (!open) return;
    setTab('editor');
    if (initialQuestion) {
      setSubjectId(initialQuestion.subject_id);
      setGradeLevel(initialQuestion.grade_level);
      setQuestionType(initialQuestion.question_type);
      setDifficulty(initialQuestion.difficulty);
      setWeight(initialQuestion.weight || 10);
      setContentHtml(initialQuestion.content_html || '');
      setLatexFormula(initialQuestion.latex_formula || '');
      setImageUrl(initialQuestion.image_url || '');
      setImageWidth(initialQuestion.image_width || '65%');
      setCorrectAnswerText(initialQuestion.correct_answer_text || '');
      setExplanation(initialQuestion.explanation || '');

      try {
        const rules = JSON.parse(initialQuestion.answer_rules_json || '{}');
        setAliasesText((rules.aliases || []).join(', '));
      } catch {
        setAliasesText('');
      }

      if (initialQuestion.table_json) {
        try {
          const parsedTable = JSON.parse(initialQuestion.table_json);
          setUseTable(true);
          setTableHeaders(parsedTable.headers || ['Kolom 1', 'Kolom 2']);
          setTableRows(parsedTable.rows || [['', '']]);
        } catch {
          setUseTable(false);
        }
      } else {
        setUseTable(false);
      }

      if (initialQuestion.options?.length) {
        setOptions(
          initialQuestion.options.map((o) => ({
            option_label: o.option_label,
            content_html: o.content_html,
            image_url: o.image_url || '',
            is_correct: Boolean(o.is_correct),
          }))
        );
      }
    } else {
      setSubjectId(subjects[0]?.id || '');
      setGradeLevel('XII');
      setQuestionType('single_choice');
      setDifficulty('sedang');
      setWeight(10);
      setContentHtml('');
      setLatexFormula('');
      setImageUrl('');
      setImageWidth('65%');
      setUseTable(false);
      setTableHeaders(['Variabel', 'Nilai']);
      setTableRows([
        ['Percobaan 1', '10'],
        ['Percobaan 2', '20'],
      ]);
      setCorrectAnswerText('');
      setAliasesText('');
      setExplanation('');
      setOptions([
        { option_label: 'A', content_html: '', image_url: '', is_correct: true },
        { option_label: 'B', content_html: '', image_url: '', is_correct: false },
        { option_label: 'C', content_html: '', image_url: '', is_correct: false },
        { option_label: 'D', content_html: '', image_url: '', is_correct: false },
      ]);
    }
  }, [open, initialQuestion, subjects]);

  const handleTypeChange = (nextType: QuestionType) => {
    setQuestionType(nextType);
    if (nextType === 'true_false') {
      setOptions([
        { option_label: 'B', content_html: 'Benar', image_url: '', is_correct: true },
        { option_label: 'S', content_html: 'Salah', image_url: '', is_correct: false },
      ]);
    } else if ((nextType === 'single_choice' || nextType === 'multiple_choice') && options.length <= 2) {
      setOptions([
        { option_label: 'A', content_html: '', image_url: '', is_correct: true },
        { option_label: 'B', content_html: '', image_url: '', is_correct: false },
        { option_label: 'C', content_html: '', image_url: '', is_correct: false },
        { option_label: 'D', content_html: '', image_url: '', is_correct: false },
      ]);
    }
  };

  const wrapSelection = (before: string, after: string) => {
    const el = contentRef.current;
    if (!el) {
      setContentHtml((prev) => `${prev}${before}${after}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = contentHtml.slice(start, end) || 'teks';
    const next = contentHtml.slice(0, start) + before + selected + after + contentHtml.slice(end);
    setContentHtml(next);
  };

  const handleImageUpload = async (file: File, onUrl: (url: string) => void) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'questions');
      const res = await apiFetch<{ url: string }>('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      onUrl(res.url);
      showToast('Gambar berhasil diunggah.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunggah gambar.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) return showToast('Pilih mata pelajaran terlebih dahulu.', 'error');
    if (!contentHtml.trim()) return showToast('Teks pertanyaan wajib diisi.', 'error');

    const payload = {
      subject_id: subjectId,
      grade_level: gradeLevel,
      question_type: questionType,
      difficulty,
      weight: Number(weight) || 1,
      content_html: contentHtml,
      latex_formula: latexFormula,
      image_url: imageUrl,
      image_width: imageWidth,
      table_json: useTable ? JSON.stringify({ headers: tableHeaders, rows: tableRows }) : '',
      correct_answer_text: correctAnswerText,
      answer_rules_json: JSON.stringify({
        aliases: aliasesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        caseSensitive: false,
      }),
      explanation,
      options:
        questionType === 'short_answer' || questionType === 'essay'
          ? []
          : options.map((o) => ({
              option_label: o.option_label,
              content_html: o.content_html,
              image_url: o.image_url || '',
              is_correct: Boolean(o.is_correct),
            })),
    };

    setSaving(true);
    try {
      if (initialQuestion) {
        await apiFetch(`/api/admin/questions/${initialQuestion.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Soal berhasil diperbarui.', 'success');
      } else {
        await apiFetch('/api/admin/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Soal baru berhasil ditambahkan ke bank soal.', 'success');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan soal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewTableJson = useTable ? JSON.stringify({ headers: tableHeaders, rows: tableRows }) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialQuestion ? 'Edit Butir Soal' : 'Buat Soal Baru'}
      maxWidth="max-w-4xl"
    >
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('editor')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'editor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Editor Soal & Rumus
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Pratinjau Siswa
          </button>
        </div>
        <span className="text-xs text-slate-500">Mendukung LaTeX ($...$ / $$...$$), Tabel, dan Gambar</span>
      </div>

      {tab === 'preview' ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/50 p-6">
          <div className="text-xs font-medium text-slate-500">
            Pratinjau Tampilan Peserta · Bobot {weight} · Tingkat {difficulty}
          </div>
          <RichMathContent
            html={contentHtml || '<p><em>(Belum ada teks pertanyaan)</em></p>'}
            latexFormula={latexFormula}
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            tableJson={previewTableJson}
          />
          {questionType !== 'short_answer' && questionType !== 'essay' && (
            <div className="space-y-2 pt-2">
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                    opt.is_correct ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="font-semibold text-slate-700">{opt.option_label}.</span>
                  <div className="flex-1">
                    <RichMathContent html={opt.content_html} imageUrl={opt.image_url} imageWidth="45%" />
                  </div>
                  {opt.is_correct && <span className="text-xs font-medium text-emerald-700">Kunci</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mata Pelajaran</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Soal</label>
              <select
                value={questionType}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="single_choice">Pilihan Ganda Tunggal</option>
                <option value="multiple_choice">Pilihan Ganda Kompleks</option>
                <option value="true_false">Benar / Salah</option>
                <option value="short_answer">Isian Singkat</option>
                <option value="essay">Uraian</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tingkat Kesulitan</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="mudah">Mudah</option>
                <option value="sedang">Sedang</option>
                <option value="sulit">Sulit</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tingkat</label>
                <input
                  type="text"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="XII"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Bobot</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Editor Teks Pertanyaan */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-slate-700">Teks Pertanyaan (HTML & Inline LaTeX $...$)</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => wrapSelection('<strong>', '</strong>')}
                  title="Tebal"
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<em>', '</em>')}
                  title="Miring"
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<sub>', '</sub>')}
                  title="Subscript"
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <Subscript className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<sup>', '</sup>')}
                  title="Superscript"
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <Superscript className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<ul><li>', '</li></ul>')}
                  title="Daftar"
                  className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('$', '$')}
                  title="Sisipkan Rumus Inline"
                  className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"
                >
                  <Sigma className="h-3.5 w-3.5" />
                  $Rumus$
                </button>
              </div>
            </div>
            <textarea
              ref={contentRef}
              rows={4}
              value={contentHtml}
              onChange={(e) => setContentHtml(e.target.value)}
              placeholder="Contoh: Hitunglah nilai limit dari $\lim_{x \to 2} \frac{x^2 - 4}{x - 2}$ ..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Blok Editor Rumus LaTeX */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700">Blok Rumus Matematika / Kimia (LaTeX Opsional)</label>
              <div className="flex flex-wrap gap-1">
                {LATEX_SNIPPETS.map((sn) => (
                  <button
                    key={sn.label}
                    type="button"
                    onClick={() => setLatexFormula((prev) => (prev ? `${prev} ${sn.code}` : sn.code))}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-700"
                  >
                    + {sn.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={latexFormula}
              onChange={(e) => setLatexFormula(e.target.value)}
              placeholder="Contoh: \int_{0}^{2} (3x^2 + 2x)\,dx atau \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
            />
            {latexFormula && <LatexBlock formula={latexFormula} />}
          </div>

          {/* Upload Gambar & Tabel */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Gambar Soal (JPG, PNG, WebP)</span>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>{uploading ? 'Mengunggah...' : 'Unggah Gambar'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f, setImageUrl);
                    }}
                  />
                </label>
              </div>
              {imageUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Ukuran tampilan:</span>
                    <select
                      value={imageWidth}
                      onChange={(e) => setImageWidth(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs"
                    >
                      <option value="35%">Kecil (35%)</option>
                      <option value="50%">Sedang (50%)</option>
                      <option value="65%">Ideal (65%)</option>
                      <option value="100%">Penuh (100%)</option>
                    </select>
                  </div>
                  <img src={imageUrl} alt="Preview gambar soal" className="max-h-28 rounded border border-slate-200 object-contain" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Hapus gambar
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Belum ada gambar terlampir.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Tabel Data Soal</span>
                <button
                  type="button"
                  onClick={() => setUseTable(!useTable)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                    useTable ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>{useTable ? 'Nonaktifkan Tabel' : 'Tambahkan Tabel'}</span>
                </button>
              </div>
              {useTable && (
                <div className="space-y-2 overflow-x-auto">
                  <div className="flex gap-1">
                    {tableHeaders.map((h, i) => (
                      <input
                        key={i}
                        value={h}
                        onChange={(e) => {
                          const next = [...tableHeaders];
                          next[i] = e.target.value;
                          setTableHeaders(next);
                        }}
                        className="w-24 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold"
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setTableHeaders([...tableHeaders, `Kolom ${tableHeaders.length + 1}`]);
                        setTableRows(tableRows.map((r) => [...r, '']));
                      }}
                      className="rounded border border-slate-200 px-2 text-xs text-blue-700"
                    >
                      +Kol
                    </button>
                  </div>
                  {tableRows.map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-1">
                      {row.map((cell, cIdx) => (
                        <input
                          key={cIdx}
                          value={cell}
                          onChange={(e) => {
                            const next = tableRows.map((r) => [...r]);
                            next[rIdx][cIdx] = e.target.value;
                            setTableRows(next);
                          }}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTableRows([...tableRows, tableHeaders.map(() => '')])}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    + Tambah Baris Tabel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Jawaban & Kunci */}
          {questionType === 'short_answer' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-lg border border-slate-200 p-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kunci Jawaban Utama</label>
                <input
                  type="text"
                  value={correctAnswerText}
                  onChange={(e) => setCorrectAnswerText(e.target.value)}
                  placeholder="Contoh: 3 atau Jakarta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alternatif Jawaban Benar (pisahkan koma)</label>
                <input
                  type="text"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                  placeholder="Contoh: 3, tiga, 3.0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {questionType === 'essay' && (
            <div className="rounded-lg border border-slate-200 p-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">Pedoman Penskoran / Rubrik Uraian</label>
              <textarea
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Tuliskan rubrik penilaian untuk koreksi manual admin..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {(questionType === 'single_choice' || questionType === 'multiple_choice' || questionType === 'true_false') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  Pilihan Jawaban ({questionType === 'multiple_choice' ? 'Bisa pilih lebih dari satu kunci' : 'Pilih satu kunci benar'})
                </label>
                {questionType !== 'true_false' && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextLabel = String.fromCharCode(65 + options.length);
                      setOptions([...options, { option_label: nextLabel, content_html: '', image_url: '', is_correct: false }]);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Opsi
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                    <input
                      type={questionType === 'multiple_choice' ? 'checkbox' : 'radio'}
                      name="correct_option_group"
                      checked={Boolean(opt.is_correct)}
                      onChange={() => {
                        if (questionType === 'multiple_choice') {
                          setOptions(options.map((o, i) => (i === idx ? { ...o, is_correct: !o.is_correct } : o)));
                        } else {
                          setOptions(options.map((o, i) => ({ ...o, is_correct: i === idx })));
                        }
                      }}
                      className="h-4 w-4 text-blue-600"
                      title="Tandai sebagai kunci jawaban"
                    />
                    <span className="w-6 text-center text-xs font-bold text-slate-700">{opt.option_label}</span>
                    <input
                      type="text"
                      value={opt.content_html}
                      disabled={questionType === 'true_false'}
                      onChange={(e) =>
                        setOptions(options.map((o, i) => (i === idx ? { ...o, content_html: e.target.value } : o)))
                      }
                      placeholder={`Isi pilihan ${opt.option_label} (bisa sisipkan $rumus$)`}
                      className="flex-1 rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    {questionType !== 'true_false' && (
                      <label className="cursor-pointer rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" title="Unggah gambar opsi">
                        <ImagePlus className="h-4 w-4" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleImageUpload(f, (url) => {
                                setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, image_url: url } : o)));
                              });
                            }
                          }}
                        />
                      </label>
                    )}
                    {questionType !== 'true_false' && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                        className="rounded p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {questionType !== 'essay' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pembahasan Soal (Opsional)</label>
              <input
                type="text"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Penjelasan langkah penyelesaian untuk arsip guru..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Soal'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
