import { Activity, ArrowRight, Eye, EyeOff, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../../components/common/UI';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';

interface PublicSchool {
  name: string;
  level: string;
  logo_url: string;
  app_title: string;
  active_academic_year: string;
  active_semester: string;
}

export function AdminLoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [school, setSchool] = useState<PublicSchool | null>(null);

  // Lupa password admin
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetCodeHint, setResetCodeHint] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate(user.role === 'ADMIN' ? '/admin' : '/student', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    apiFetch<{ school: PublicSchool }>('/api/public/school-info')
      .then((d) => setSchool(d.school))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!identifier.trim() || !password) {
      setErrorMsg('Mohon lengkapi username atau email admin dan kata sandi.');
      return;
    }
    setSubmitting(true);
    try {
      const loggedUser = await login({
        identifier: identifier.trim(),
        password,
        portal: 'ADMIN',
      });
      showToast(`Selamat datang, ${loggedUser.fullName}`, 'success');
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal masuk ke panel admin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string; verificationHint: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: forgotIdentifier }),
      });
      setResetCodeHint(res.verificationHint);
      showToast(res.message, 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ code: resetCode, newPassword }),
      });
      showToast(res.message, 'success');
      setForgotOpen(false);
      setResetCodeHint('');
      setResetCode('');
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Panel Kiri: Identitas Konsol Admin & Proktor */}
          <div className="lg:col-span-5 bg-slate-900 text-white p-8 sm:p-10 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3.5">
                <img
                  src={school?.logo_url || '/images/school-logo.jpg'}
                  alt="Logo sekolah"
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-xl bg-white p-1 object-contain shrink-0"
                />
                <div>
                  <div className="text-xs font-medium text-slate-300">
                    {school?.level || 'SMA/MA'} · {school?.active_academic_year || '2026/2027'}
                  </div>
                  <div className="text-base font-bold leading-snug">
                    {school?.name || 'MA/SMA Nusantara Cendekia'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <div className="text-xs font-semibold tracking-wide text-blue-300">
                  Konsol Pengawas & Administrator
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-balance">
                  Portal Admin & Proktor CBT
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Kelola data peserta, bank soal terstruktur, jadwal dan token ujian, pemantauan peserta secara langsung, koreksi manual, hingga laporan hasil ujian sekolah.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-3 border-t border-slate-800 pt-6 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Pengaturan ujian, bobot soal, dan token akses peserta</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Pemantauan status sesi dan pelanggaran peserta real-time</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Audit aktivitas, koreksi uraian, dan ekspor Excel/PDF</span>
              </div>
            </div>
          </div>

          {/* Panel Kanan: Form Login Khusus Admin / Proktor */}
          <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Login Admin / Proktor</h2>
              <p className="mt-1 text-sm text-slate-500">
                Masuk dengan akun administrator atau proktor resmi yang terdaftar di sekolah.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Username atau Email Admin
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Masukkan username atau email admin"
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">Kata Sandi</label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi admin"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Tampilkan atau sembunyikan kata sandi"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60 whitespace-nowrap"
              >
                {submitting ? 'Memverifikasi akun...' : 'Masuk ke Panel Admin / Proktor'}
              </button>
            </form>
          </div>
        </div>

        {/* Tautan Terpisah ke Portal Peserta / Siswa */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-slate-500">
          <span>
            {school?.app_title || 'CBT Online Sekolah/Madrasah'} · Semester {school?.active_semester || 'Ganjil'}
          </span>
          <Link
            to="/masuk-siswa"
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline whitespace-nowrap"
          >
            <span>Portal Masuk Ujian Peserta / Siswa</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Modal Lupa Password Admin */}
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Pemulihan Kata Sandi Admin" maxWidth="max-w-md">
        {!resetCodeHint ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <p className="text-sm text-slate-600">
              Masukkan username atau email admin sekolah yang terdaftar untuk membuat kode verifikasi pemulihan sandi.
            </p>
            <input
              type="text"
              required
              value={forgotIdentifier}
              onChange={(e) => setForgotIdentifier(e.target.value)}
              placeholder="Username atau email admin"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                Batal
              </button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Buat Kode Verifikasi
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              Kode verifikasi pemulihan: <strong className="font-mono text-sm">{resetCodeHint}</strong>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Masukkan Kode Verifikasi</label>
              <input
                type="text"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kata Sandi Baru</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                Tutup
              </button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Simpan Kata Sandi
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
