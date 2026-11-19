import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function StudentLoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [school, setSchool] = useState<PublicSchool | null>(null);

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
      setErrorMsg('Mohon lengkapi NIS atau username peserta dan kata sandi.');
      return;
    }
    setSubmitting(true);
    try {
      const loggedUser = await login({
        identifier: identifier.trim(),
        password,
        portal: 'SISWA',
      });
      showToast(`Selamat datang, ${loggedUser.fullName}`, 'success');
      navigate('/student', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal masuk ke halaman ujian peserta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Panel Kiri: Identitas Sekolah & Tata Tertib Singkat Peserta */}
          <div className="lg:col-span-5 bg-blue-700 text-white p-8 sm:p-10 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3.5">
                <img
                  src={school?.logo_url || '/images/school-logo.jpg'}
                  alt="Logo sekolah"
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-xl bg-white p-1 object-contain shrink-0"
                />
                <div>
                  <div className="text-xs font-medium text-blue-100">
                    {school?.level || 'SMA/MA'} · {school?.active_academic_year || '2026/2027'}
                  </div>
                  <div className="text-base font-bold leading-snug">
                    {school?.name || 'MA/SMA Nusantara Cendekia'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <div className="text-xs font-semibold tracking-wide text-blue-100">
                  Portal Peserta Ujian
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight text-balance">
                  Masuk Ruang Ujian CBT
                </h1>
                <p className="text-sm text-blue-100 leading-relaxed">
                  Gunakan NIS atau username peserta yang dibagikan panitia ujian sekolah untuk mengakses jadwal ujian aktif dan memasukkan token ujian.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-3 border-t border-blue-600/80 pt-6 text-xs text-blue-100">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-200 shrink-0" />
                <span>Timer sinkronisasi waktu server & token sesi ujian</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-blue-200 shrink-0" />
                <span>Pembatasan satu sesi ujian aktif per peserta</span>
              </div>
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-4 w-4 text-blue-200 shrink-0" />
                <span>Penyimpanan jawaban otomatis saat koneksi terganggu</span>
              </div>
            </div>
          </div>

          {/* Panel Kanan: Form Login Khusus Peserta / Siswa */}
          <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Login Peserta / Siswa</h2>
              <p className="mt-1 text-sm text-slate-500">
                Masukkan NIS atau username peserta dan kata sandi Anda untuk memulai ujian.
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
                  NIS atau Username Peserta
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Masukkan NIS atau username peserta"
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kata Sandi</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi peserta"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 whitespace-nowrap"
              >
                {submitting ? 'Memverifikasi peserta...' : 'Masuk ke Halaman Ujian'}
              </button>
            </form>
          </div>
        </div>

        {/* Tautan Terpisah ke Portal Admin / Proktor */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-slate-500">
          <span>
            {school?.app_title || 'CBT Online Sekolah/Madrasah'} · Semester {school?.active_semester || 'Ganjil'}
          </span>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-blue-700 hover:underline whitespace-nowrap"
          >
            <span>Portal Masuk Admin / Proktor</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
