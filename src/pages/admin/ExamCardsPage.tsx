import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import { CheckSquare, Download, ExternalLink, Printer, Search, Square } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingRows, Modal } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { School } from '../../types';

interface CardStudent {
  id: string;
  nis: string;
  nisn: string;
  full_name: string;
  gender: string;
  status: string;
  class_id: string | null;
  class_name: string | null;
  grade_level: string | null;
  username: string;
}

export function ExamCardsPage() {
  const { showToast } = useToast();

  const [examFilter, setExamFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  const [cardTitle, setCardTitle] = useState('KARTU PESERTA UJIAN BERBASIS KOMPUTER (CBT)');
  const [roomLabel, setRoomLabel] = useState('Ruang Lab Komputer 1');
  const [sessionLabel, setSessionLabel] = useState('Sesi 1');
  const [showPhotoBox, setShowPhotoBox] = useState(true);
  const [showPrincipalSign, setShowPrincipalSign] = useState(true);
  const [showLoginNote, setShowLoginNote] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (printPreviewUrl) {
        URL.revokeObjectURL(printPreviewUrl);
      }
    };
  }, [printPreviewUrl]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-exam-cards', examFilter, classFilter, search, onlyActive],
    queryFn: () =>
      apiFetch<{
        school: School;
        classes: { id: string; name: string; grade_level: string }[];
        exams: any[];
        selectedExam: any | null;
        students: CardStudent[];
      }>(
        `/api/admin/exam-cards?examId=${encodeURIComponent(examFilter)}&classId=${encodeURIComponent(classFilter)}&q=${encodeURIComponent(search)}&onlyActive=${onlyActive ? 'true' : 'false'}`
      ),
  });

  const students = data?.students || [];
  const school = data?.school;
  const selectedExam = data?.selectedExam;

  useEffect(() => {
    setSelectedIds(students.map((s) => s.id));
  }, [students]);

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.includes(s.id)),
    [students, selectedIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelectedIds(students.map((s) => s.id));
  const clearAll = () => setSelectedIds([]);

  const buildExamCardsPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const marginX = 10;
    const marginY = 10;
    const gapX = 6;
    const gapY = 6;
    const cardW = (pageW - marginX * 2 - gapX) / 2; // 92mm
    const cardH = 88; // 3 rows * 88 + 2*6 + 20 = 296mm (fits A4 297mm)
    const cardsPerPage = 6;

    const todayStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    selectedStudents.forEach((stu, idx) => {
      if (idx > 0 && idx % cardsPerPage === 0) {
        doc.addPage();
      }
      const pos = idx % cardsPerPage;
      const col = pos % 2;
      const row = Math.floor(pos / 2);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);

      // Bingkai kartu
      doc.setDrawColor(51, 65, 85);
      doc.setLineWidth(0.35);
      doc.rect(x, y, cardW, cardH);

      // Kop sekolah
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, cardW, 14.5, 'F');
      doc.line(x, y + 14.5, x + cardW, y + 14.5);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text((school?.name || 'SEKOLAH / MADRASAH').toUpperCase(), x + cardW / 2, y + 5.5, {
        align: 'center',
        maxWidth: cardW - 6,
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(29, 78, 216);
      doc.text(cardTitle.toUpperCase(), x + cardW / 2, y + 10, {
        align: 'center',
        maxWidth: cardW - 6,
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Tahun Pelajaran ${school?.active_academic_year || '2026/2027'} · Semester ${school?.active_semester || 'Ganjil'}`,
        x + cardW / 2,
        y + 13.3,
        { align: 'center', maxWidth: cardW - 6 }
      );

      // Area isi
      const contentTop = y + 18.5;
      const photoW = showPhotoBox ? 18 : 0;
      const textAreaW = showPhotoBox ? cardW - 8 - photoW - 3 : cardW - 8;

      const fields: [string, string][] = [
        ['NIS / No. Peserta', stu.nis],
        ['Nama Peserta', stu.full_name],
        ['Kelas', stu.class_name || '-'],
        ['Username Login', stu.username],
        ['Ruang / Sesi', `${roomLabel || '-'} · ${sessionLabel || '-'}`],
      ];
      if (selectedExam) {
        fields.push(['Ujian', `${selectedExam.title}`]);
        fields.push(['Jadwal', `${selectedExam.exam_date} (${selectedExam.start_time}-${selectedExam.end_time})`]);
      }

      let curY = contentTop;
      doc.setFontSize(7.4);
      fields.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(label, x + 4, curY);
        doc.text(':', x + 28, curY);

        doc.setFont('helvetica', label === 'NIS / No. Peserta' || label === 'Nama Peserta' ? 'bold' : 'normal');
        doc.setTextColor(15, 23, 42);
        const wrapped = doc.splitTextToSize(String(value || '-'), textAreaW - 26);
        doc.text(wrapped[0] || '-', x + 30, curY);
        curY += 5.2;
      });

      // Kotak Pas Foto 3x4
      if (showPhotoBox) {
        const px = x + cardW - 4 - photoW;
        const py = contentTop - 1.5;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.25);
        doc.rect(px, py, photoW, 24);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Pas Foto', px + photoW / 2, py + 10.5, { align: 'center' });
        doc.text('3 x 4', px + photoW / 2, py + 14.5, { align: 'center' });
      }

      // Catatan login + Tanda tangan
      const footerY = y + cardH - 22;
      doc.setDrawColor(226, 232, 240);
      doc.line(x + 4, footerY - 2, x + cardW - 4, footerY - 2);

      if (showLoginNote) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Masuk melalui portal siswa menggunakan', x + 4, footerY + 2);
        doc.text('Username & Password yang diberikan panitia.', x + 4, footerY + 5.5);
      }

      if (showPrincipalSign) {
        const signX = x + cardW - 36;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(51, 65, 85);
        doc.text(`Dicetak, ${todayStr}`, signX, footerY + 1.5);
        doc.text('Kepala Sekolah / Panitia', signX, footerY + 5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(school?.principal_name || 'Kepala Sekolah', signX, footerY + 17.5, { maxWidth: 33 });
      }
    });

    return doc;
  };

  const handleBrowserPrint = () => {
    if (selectedStudents.length === 0) {
      showToast('Pilih minimal 1 peserta untuk mencetak kartu ujian.', 'error');
      return;
    }

    let printDialogOpened = false;
    const onBeforePrint = () => {
      printDialogOpened = true;
    };
    window.addEventListener('beforeprint', onBeforePrint, { once: true });
    try {
      window.print();
    } catch {
      // Blocked by iframe sandbox or browser policy
    }
    window.removeEventListener('beforeprint', onBeforePrint);

    if (printDialogOpened) {
      showToast(`Dialog cetak dibuka untuk ${selectedStudents.length} kartu peserta.`, 'info');
      return;
    }

    // Fallback untuk pratinjau iframe (tanpa allow-modals) atau browser yang memblokir window.print()
    try {
      const doc = buildExamCardsPdf();
      doc.autoPrint();
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      setPrintPreviewUrl(blobUrl);
      showToast('Membuka pratinjau cetak A4. Gunakan Cetak via Tab Baru atau Unduh PDF.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyiapkan pratinjau cetak kartu ujian.', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    if (selectedStudents.length === 0) {
      showToast('Pilih minimal 1 peserta untuk mengunduh PDF kartu ujian.', 'error');
      return;
    }

    setExportingPdf(true);
    try {
      const doc = buildExamCardsPdf();
      doc.save(`kartu-peserta-ujian-${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast(`PDF kartu ujian untuk ${selectedStudents.length} peserta berhasil diunduh.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat PDF kartu ujian.', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const todayDisplay = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header & Aksi Cetak */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Cetak Kartu Ujian Peserta</h2>
          <p className="text-sm text-slate-500">
            Atur informasi kartu peserta CBT, pilih siswa atau peserta ujian tertentu, lalu cetak langsung atau unduh dalam format PDF siap cetak A4.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleBrowserPrint}
            disabled={selectedStudents.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>Cetak Kartu (Print)</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={exportingPdf || selectedStudents.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>{exportingPdf ? 'Membuat PDF...' : `Unduh PDF (${selectedStudents.length})`}</span>
          </button>
        </div>
      </div>

      {/* Filter Peserta & Pengaturan Template Kartu */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter Ujian Terdaftar (Opsional)</label>
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Semua Siswa Sekolah</option>
              {(data?.exams || []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.subject_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter Kelas</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Semua Kelas</option>
              {(data?.classes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cari Nama / NIS / Username</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari peserta..."
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Hanya peserta berstatus aktif</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Judul Kartu Ujian</label>
            <input
              type="text"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Keterangan Ruang</label>
            <input
              type="text"
              value={roomLabel}
              onChange={(e) => setRoomLabel(e.target.value)}
              placeholder="Contoh: Ruang Lab Komputer 1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Keterangan Sesi / Gelombang</label>
            <input
              type="text"
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="Contoh: Sesi 1 (08.00 - 09.30)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showPhotoBox}
                onChange={(e) => setShowPhotoBox(e.target.checked)}
              />
              <span>Tampilkan Kotak Pas Foto 3x4</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showPrincipalSign}
                onChange={(e) => setShowPrincipalSign(e.target.checked)}
              />
              <span>Tampilkan Tanda Tangan Kepala Sekolah</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showLoginNote}
                onChange={(e) => setShowLoginNote(e.target.checked)}
              />
              <span>Tampilkan Petunjuk Login Peserta</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-600 tabular-nums">
              Terpilih: <strong className="text-slate-900">{selectedStudents.length}</strong> dari {students.length} peserta
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
            >
              <CheckSquare className="h-3.5 w-3.5" /> Pilih Semua
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 font-medium text-slate-600 hover:underline"
            >
              <Square className="h-3.5 w-3.5" /> Kosongkan
            </button>
          </div>
        </div>
      </div>

      {/* Pratinjau & Area Cetak Kartu Peserta */}
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : students.length === 0 ? (
        <EmptyState
          title="Tidak ada peserta ujian ditemukan"
          description="Ubah filter kelas, ujian, atau status siswa untuk menampilkan daftar kartu peserta."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-3">
          {students.map((stu) => {
            const isSelected = selectedIds.includes(stu.id);
            return (
              <div
                key={stu.id}
                onClick={() => toggleSelect(stu.id)}
                className={`relative cursor-pointer rounded-xl border bg-white transition-colors break-inside-avoid print:cursor-default print:rounded-none ${
                  isSelected
                    ? 'border-slate-400 shadow-xs print:border-slate-800 print:shadow-none'
                    : 'border-slate-200 opacity-55 print:hidden'
                }`}
              >
                {/* Indikator pilih (tidak ikut tercetak) */}
                <div className="absolute right-3 top-3 z-10 print:hidden">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    aria-label={`Pilih kartu ${stu.full_name}`}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                </div>

                {/* Kop Kartu Sekolah */}
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 print:bg-slate-100">
                  <img
                    src={school?.logo_url || '/images/school-logo.jpg'}
                    alt="Logo sekolah"
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                  />
                  <div className="min-w-0 pr-6">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-900 truncate">
                      {school?.name || 'Sekolah / Madrasah'}
                    </div>
                    <div className="text-[11px] font-bold uppercase text-blue-700 truncate">
                      {cardTitle}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Tahun Pelajaran {school?.active_academic_year || '2026/2027'} · Semester{' '}
                      {school?.active_semester || 'Ganjil'}
                    </div>
                  </div>
                </div>

                {/* Isi Identitas Peserta */}
                <div className="p-4 flex items-start justify-between gap-4">
                  <table className="flex-1 text-xs text-slate-800">
                    <tbody className="divide-y divide-transparent">
                      <tr>
                        <td className="py-0.5 text-slate-500 w-28 align-top">NIS / No. Peserta</td>
                        <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                        <td className="py-0.5 font-mono font-bold tabular-nums text-slate-900">{stu.nis}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500 align-top">Nama Peserta</td>
                        <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                        <td className="py-0.5 font-bold text-slate-900">{stu.full_name}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500 align-top">Kelas</td>
                        <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                        <td className="py-0.5 font-medium">{stu.class_name || '-'}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500 align-top">Username Login</td>
                        <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                        <td className="py-0.5 font-mono font-semibold text-blue-700">{stu.username}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-slate-500 align-top">Ruang / Sesi</td>
                        <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                        <td className="py-0.5">
                          {roomLabel || '-'} · {sessionLabel || '-'}
                        </td>
                      </tr>
                      {selectedExam && (
                        <tr>
                          <td className="py-0.5 text-slate-500 align-top">Ujian & Jadwal</td>
                          <td className="py-0.5 px-1 text-slate-400 align-top">:</td>
                          <td className="py-0.5">
                            {selectedExam.title} ({selectedExam.exam_date} · {selectedExam.start_time}-{selectedExam.end_time})
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {showPhotoBox && (
                    <div className="h-24 w-[72px] shrink-0 rounded border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-[10px] text-slate-400">
                      <span>Pas Foto</span>
                      <span>3 x 4</span>
                    </div>
                  )}
                </div>

                {/* Footer Kartu: Petunjuk & Tanda Tangan */}
                {(showLoginNote || showPrincipalSign) && (
                  <div className="flex items-end justify-between gap-4 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500">
                    <div>
                      {showLoginNote && (
                        <p className="leading-relaxed max-w-[210px]">
                          Masuk pada portal peserta menggunakan Username di atas & kata sandi yang diberikan panitia ujian.
                        </p>
                      )}
                    </div>
                    {showPrincipalSign && (
                      <div className="text-right shrink-0">
                        <div>Dicetak, {todayDisplay}</div>
                        <div className="text-slate-600">Kepala Sekolah / Panitia</div>
                        <div className="mt-6 font-bold text-slate-900">
                          {school?.principal_name || 'Kepala Sekolah'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Pratinjau Cetak A4 (Fallback ketika window.print() dibatasi mode iframe) */}
      <Modal
        open={Boolean(printPreviewUrl)}
        onClose={() => setPrintPreviewUrl(null)}
        title={`Pratinjau Cetak Kartu Ujian A4 (${selectedStudents.length} Peserta)`}
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            <p className="leading-relaxed max-w-xl">
              Dialog cetak langsung browser dibatasi di mode pratinjau halaman tertanam (iframe). Klik{' '}
              <strong>Cetak via Tab Baru</strong> untuk membuka dokumen siap cetak (otomatis memicu dialog Print), atau{' '}
              <strong>Unduh PDF A4</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {printPreviewUrl && (
                <a
                  href={printPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Cetak via Tab Baru</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Unduh PDF A4'}</span>
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-4 space-y-4">
            {Array.from({ length: Math.ceil(selectedStudents.length / 6) }).map((_, pageIdx) => {
              const pageStudents = selectedStudents.slice(pageIdx * 6, pageIdx * 6 + 6);
              return (
                <div key={pageIdx} className="mx-auto max-w-[794px] rounded-md border border-slate-300 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 border-b border-slate-100 pb-2">
                    <span>Lembar Cetak A4 — {pageStudents.length} Kartu Peserta</span>
                    <span className="tabular-nums">
                      Halaman {pageIdx + 1} dari {Math.ceil(selectedStudents.length / 6)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {pageStudents.map((stu) => (
                      <div key={stu.id} className="rounded border border-slate-400 bg-white text-[11px]">
                        <div className="border-b border-slate-300 bg-slate-100 px-3 py-2 text-center">
                          <div className="font-bold uppercase text-slate-900 truncate">
                            {school?.name || 'SEKOLAH / MADRASAH'}
                          </div>
                          <div className="text-[10px] font-bold uppercase text-blue-700 truncate">{cardTitle}</div>
                          <div className="text-[9px] text-slate-600">
                            Tahun Pelajaran {school?.active_academic_year || '2026/2027'} · Semester{' '}
                            {school?.active_semester || 'Ganjil'}
                          </div>
                        </div>
                        <div className="p-3 flex items-start justify-between gap-2">
                          <div className="space-y-0.5 text-[10px] min-w-0 flex-1">
                            <div>
                              <span className="text-slate-500">NIS:</span>{' '}
                              <strong className="font-mono tabular-nums text-slate-900">{stu.nis}</strong>
                            </div>
                            <div className="truncate">
                              <span className="text-slate-500">Nama:</span>{' '}
                              <strong className="text-slate-900">{stu.full_name}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Kelas:</span> {stu.class_name || '-'}
                            </div>
                            <div>
                              <span className="text-slate-500">Username:</span>{' '}
                              <span className="font-mono font-semibold text-blue-700">{stu.username}</span>
                            </div>
                            <div className="truncate">
                              <span className="text-slate-500">Ruang/Sesi:</span> {roomLabel || '-'} · {sessionLabel || '-'}
                            </div>
                            {selectedExam && (
                              <div className="truncate">
                                <span className="text-slate-500">Ujian:</span> {selectedExam.title}
                              </div>
                            )}
                          </div>
                          {showPhotoBox && (
                            <div className="h-16 w-12 shrink-0 rounded border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-[8px] text-slate-400">
                              <span>Pas Foto</span>
                              <span>3 x 4</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
