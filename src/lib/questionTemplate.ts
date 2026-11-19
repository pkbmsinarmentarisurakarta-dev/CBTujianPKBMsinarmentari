import * as XLSX from 'xlsx';
import type { Subject } from '../types';

export interface ParsedQuestionRow {
  rowNumber: number;
  subject_ref: string;
  resolvedSubjectName: string;
  grade_level: string;
  question_type: string;
  normalizedType: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | null;
  difficulty: string;
  weight: number;
  question_text: string;
  latex_formula: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  answer_key: string;
  explanation: string;
  error: string | null;
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: 'Pilihan Ganda',
  multiple_choice: 'PG Kompleks',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  essay: 'Uraian',
};

function normalizeTypeClient(raw: string): ParsedQuestionRow['normalizedType'] {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['single_choice', 'pg', 'pilihan_ganda', 'pilihan_ganda_tunggal'].includes(v)) return 'single_choice';
  if (['multiple_choice', 'pg_kompleks', 'pilihan_ganda_kompleks', 'kompleks'].includes(v)) return 'multiple_choice';
  if (['true_false', 'benar_salah', 'benar/salah', 'bs'].includes(v)) return 'true_false';
  if (['short_answer', 'isian', 'isian_singkat'].includes(v)) return 'short_answer';
  if (['essay', 'uraian', 'esai'].includes(v)) return 'essay';
  return null;
}

export function downloadQuestionTemplate(subjects: Subject[]) {
  const defaultCode = subjects[0]?.code || 'MTK';

  const exampleRows = [
    {
      'Kode/Nama Mapel': defaultCode,
      Tingkat: 'X',
      'Jenis Soal': 'PG',
      Kesulitan: 'mudah',
      Bobot: 2,
      Pertanyaan: 'Jika f(x) = 2x + 5, berapakah nilai f(4)?',
      'Rumus LaTeX': 'f(x) = 2x + 5',
      'Opsi A': '11',
      'Opsi B': '13',
      'Opsi C': '15',
      'Opsi D': '17',
      'Opsi E': '19',
      'Kunci Jawaban': 'B',
      Pembahasan: 'Substitusikan x = 4 sehingga f(4) = 2(4) + 5 = 13.',
    },
    {
      'Kode/Nama Mapel': defaultCode,
      Tingkat: 'X',
      'Jenis Soal': 'PG_KOMPLEKS',
      Kesulitan: 'sedang',
      Bobot: 4,
      Pertanyaan: 'Manakah di antara bilangan berikut yang merupakan bilangan prima?',
      'Rumus LaTeX': '',
      'Opsi A': '2',
      'Opsi B': '4',
      'Opsi C': '7',
      'Opsi D': '9',
      'Opsi E': '11',
      'Kunci Jawaban': 'A,C,E',
      Pembahasan: 'Bilangan prima adalah bilangan lebih dari 1 yang hanya habis dibagi 1 dan dirinya sendiri: 2, 7, dan 11.',
    },
    {
      'Kode/Nama Mapel': defaultCode,
      Tingkat: 'X',
      'Jenis Soal': 'BENAR_SALAH',
      Kesulitan: 'mudah',
      Bobot: 2,
      Pertanyaan: 'Hasil dari 3^2 + 4^2 sama dengan 5^2.',
      'Rumus LaTeX': '3^2 + 4^2 = 5^2',
      'Opsi A': 'Benar',
      'Opsi B': 'Salah',
      'Opsi C': '',
      'Opsi D': '',
      'Opsi E': '',
      'Kunci Jawaban': 'BENAR',
      Pembahasan: '9 + 16 = 25 (tripel Pythagoras).',
    },
    {
      'Kode/Nama Mapel': defaultCode,
      Tingkat: 'X',
      'Jenis Soal': 'ISIAN',
      Kesulitan: 'sedang',
      Bobot: 5,
      Pertanyaan: 'Sebutkan ibu kota Provinsi Jawa Tengah!',
      'Rumus LaTeX': '',
      'Opsi A': '',
      'Opsi B': '',
      'Opsi C': '',
      'Opsi D': '',
      'Opsi E': '',
      'Kunci Jawaban': 'Semarang|Kota Semarang',
      Pembahasan: 'Alternatif jawaban benar dapat dipisahkan dengan tanda | (garis tegak).',
    },
    {
      'Kode/Nama Mapel': defaultCode,
      Tingkat: 'X',
      'Jenis Soal': 'URAIAN',
      Kesulitan: 'sulit',
      Bobot: 15,
      Pertanyaan: 'Jelaskan langkah-langkah penyelesaian persamaan kuadrat menggunakan rumus ABC!',
      'Rumus LaTeX': 'x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      'Opsi A': '',
      'Opsi B': '',
      'Opsi C': '',
      'Opsi D': '',
      'Opsi E': '',
      'Kunci Jawaban': 'Identifikasi a, b, c lalu hitung diskriminan D = b^2 - 4ac dan substitusi ke rumus.',
      Pembahasan: 'Dinilai secara manual oleh guru/korektor pada menu Hasil Ujian.',
    },
  ];

  const guideRows = [
    { Kolom: 'Kode/Nama Mapel', Aturan: 'Isi Kode Mapel atau Nama Mapel persis seperti di sistem (atau kosongkan jika memilih Mapel Default saat upload).' },
    { Kolom: 'Tingkat', Aturan: 'Tingkat kelas, misalnya: VII, VIII, IX, X, XI, XII.' },
    { Kolom: 'Jenis Soal', Aturan: 'Isi salah satu: PG (Pilihan Ganda), PG_KOMPLEKS (banyak jawaban benar), BENAR_SALAH, ISIAN (Isian Singkat), atau URAIAN.' },
    { Kolom: 'Kesulitan', Aturan: 'Isi salah satu: mudah, sedang, atau sulit.' },
    { Kolom: 'Bobot', Aturan: 'Angka bobot nilai soal (misal: 1, 2, 5, 10, 15).' },
    { Kolom: 'Pertanyaan', Aturan: 'Teks soal wajib diisi. Boleh berupa teks biasa maupun HTML sederhana.' },
    { Kolom: 'Rumus LaTeX', Aturan: 'Opsional. Contoh: \\frac{a}{b}, x^2 + y^2 = r^2, atau \\ce{H2O}.' },
    { Kolom: 'Opsi A - Opsi E', Aturan: 'Untuk PG & PG_KOMPLEKS minimal isi Opsi A dan Opsi B (maksimal sampai E). Untuk ISIAN & URAIAN kosongkan.' },
    { Kolom: 'Kunci Jawaban', Aturan: 'PG: huruf A/B/C/D/E. PG_KOMPLEKS: pisahkan koma (A,C,E). BENAR_SALAH: BENAR atau SALAH. ISIAN: jawaban benar (pisahkan variasi dengan |). URAIAN: pedoman penskoran (opsional).' },
    { Kolom: 'Pembahasan', Aturan: 'Opsional. Catatan pembahasan soal.' },
    { Kolom: '', Aturan: '' },
    { Kolom: '--- DAFTAR MATA PELAJARAN AKTIF ---', Aturan: 'Gunakan Kode atau Nama Mapel berikut pada kolom Kode/Nama Mapel:' },
    ...subjects.map((s) => ({
      Kolom: s.code,
      Aturan: `${s.name} (${s.category})`,
    })),
  ];

  const wb = XLSX.utils.book_new();
  const wsTemplate = XLSX.utils.json_to_sheet(exampleRows);
  wsTemplate['!cols'] = [
    { wch: 18 },
    { wch: 10 },
    { wch: 15 },
    { wch: 12 },
    { wch: 8 },
    { wch: 48 },
    { wch: 28 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 36 },
  ];

  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 28 }, { wch: 95 }];

  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template Soal');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan Pengisian');
  XLSX.writeFile(wb, 'template-bank-soal-cbt.xlsx');
}

export function parseQuestionWorkbook(
  buffer: ArrayBuffer,
  subjects: Subject[],
  defaultSubjectId: string
): ParsedQuestionRow[] {
  const wb = XLSX.read(buffer);
  const sheetName = wb.SheetNames.includes('Template Soal') ? 'Template Soal' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  const subjectByCode = new Map(subjects.map((s) => [s.code.trim().toLowerCase(), s]));
  const subjectByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const defaultSubject = subjects.find((s) => s.id === defaultSubjectId) || null;

  return rawRows
    .map((r, index): ParsedQuestionRow | null => {
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
            return String(r[k]).trim();
          }
        }
        return '';
      };

      const subjectRef = getVal('Kode/Nama Mapel', 'Kode Mapel', 'Mapel', 'Mata Pelajaran', 'subject_ref');
      const gradeLevel = getVal('Tingkat', 'Kelas', 'grade_level') || 'X';
      const qTypeRaw = getVal('Jenis Soal', 'Jenis', 'question_type') || 'PG';
      const difficulty = (getVal('Kesulitan', 'Tingkat Kesulitan', 'difficulty') || 'sedang').toLowerCase();
      const weightNum = Number(getVal('Bobot', 'weight') || '1');
      const weight = Number.isFinite(weightNum) && weightNum > 0 ? weightNum : 1;
      const questionText = getVal('Pertanyaan', 'Soal', 'Teks Pertanyaan', 'content_html', 'question_text');
      const latexFormula = getVal('Rumus LaTeX', 'LaTeX', 'latex_formula');
      const optionA = getVal('Opsi A', 'A', 'option_a');
      const optionB = getVal('Opsi B', 'B', 'option_b');
      const optionC = getVal('Opsi C', 'C', 'option_c');
      const optionD = getVal('Opsi D', 'D', 'option_d');
      const optionE = getVal('Opsi E', 'E', 'option_e');
      const answerKey = getVal('Kunci Jawaban', 'Kunci', 'answer_key');
      const explanation = getVal('Pembahasan', 'explanation');

      // Lewati baris yang benar-benar kosong
      if (!questionText && !subjectRef && !optionA && !answerKey) {
        return null;
      }

      const matchedSubject =
        (subjectRef
          ? subjectByCode.get(subjectRef.toLowerCase()) || subjectByName.get(subjectRef.toLowerCase())
          : undefined) || defaultSubject;

      const normalizedType = normalizeTypeClient(qTypeRaw);
      let error: string | null = null;

      if (!questionText) {
        error = 'Teks pertanyaan wajib diisi.';
      } else if (!matchedSubject) {
        error = `Mapel "${subjectRef || '-'}" tidak ditemukan. Pilih Mapel Default atau perbaiki kolom Mapel.`;
      } else if (!normalizedType) {
        error = `Jenis soal "${qTypeRaw}" tidak valid.`;
      } else if (normalizedType === 'single_choice' || normalizedType === 'multiple_choice') {
        const availableLabels = [
          optionA ? 'A' : '',
          optionB ? 'B' : '',
          optionC ? 'C' : '',
          optionD ? 'D' : '',
          optionE ? 'E' : '',
        ].filter(Boolean);
        const keys = answerKey
          .toUpperCase()
          .split(/[,;\s]+/)
          .map((k) => k.trim())
          .filter(Boolean);
        if (availableLabels.length < 2) {
          error = 'Pilihan ganda minimal memiliki Opsi A dan Opsi B.';
        } else if (keys.length === 0 || !keys.some((k) => availableLabels.includes(k))) {
          error = `Kunci jawaban "${answerKey || '-'}" tidak sesuai opsi tersedia (${availableLabels.join(', ')}).`;
        }
      } else if (normalizedType === 'true_false') {
        const k = answerKey.toUpperCase();
        if (!['BENAR', 'TRUE', 'B', 'A', '1', 'YA', 'SALAH', 'FALSE', 'S', '2', 'TIDAK'].includes(k)) {
          error = 'Kunci Benar/Salah harus BENAR atau SALAH.';
        }
      } else if (normalizedType === 'short_answer' && !answerKey) {
        error = 'Kunci jawaban isian singkat wajib diisi.';
      }

      return {
        rowNumber: index + 2,
        subject_ref: subjectRef,
        resolvedSubjectName: matchedSubject ? `${matchedSubject.code} - ${matchedSubject.name}` : '-',
        grade_level: gradeLevel,
        question_type: qTypeRaw,
        normalizedType,
        difficulty,
        weight,
        question_text: questionText,
        latex_formula: latexFormula,
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        option_e: optionE,
        answer_key: answerKey,
        explanation,
        error,
      };
    })
    .filter((item): item is ParsedQuestionRow => item !== null);
}
