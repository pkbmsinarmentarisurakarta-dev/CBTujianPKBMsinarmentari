import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ConfirmModal, LoadingRows, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';

export function SettingsAndTestPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [testingVu, setTestingVu] = useState<number | null>(null);
  const [loadResults, setLoadResults] = useState<any[]>([]);

  // Form Pengaturan Koneksi API Supabase (Service Role Key write-only di server)
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [showServiceKey, setShowServiceKey] = useState(false);

  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const [diagResult, setDiagResult] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<any[] | null>(null);

  const { data: statusData, isLoading } = useQuery({
    queryKey: ['admin-system-status'],
    queryFn: () => apiFetch<any>('/api/admin/system/status'),
  });

  useEffect(() => {
    if (statusData?.supabaseConfig) {
      setSupabaseUrl(statusData.supabaseConfig.supabaseUrl || '');
      setAnonKey(statusData.supabaseConfig.anonKey || '');
    }
  }, [statusData]);

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await apiFetch<any>('/api/admin/system/supabase-config', {
        method: 'PUT',
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          anonKey: anonKey.trim(),
          serviceRoleKey: serviceRoleKey.trim(),
        }),
      });
      setServiceRoleKey('');
      setDiagResult(res.testResult);
      await queryClient.invalidateQueries({ queryKey: ['admin-system-status'] });
      showToast(
        res.testResult?.ok
          ? 'Konfigurasi Supabase disimpan dan terhubung penuh!'
          : 'Konfigurasi disimpan di server. Periksa detail diagnostik migrasi di bawah.',
        res.testResult?.ok ? 'success' : 'info'
      );
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      const res = await apiFetch<any>('/api/admin/system/supabase-test', {
        method: 'POST',
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          serviceRoleKey: serviceRoleKey.trim(),
        }),
      });
      setDiagResult(res);
      showToast(res.message, res.ok ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setTestingConn(false);
    }
  };

  const handleSyncToSupabase = async () => {
    setSyncingData(true);
    try {
      const res = await apiFetch<any>('/api/admin/system/supabase-sync', { method: 'POST' });
      setSyncReport(res.report || []);
      showToast(res.message, res.ok ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSyncingData(false);
    }
  };

  const handleResetConfig = async () => {
    try {
      await apiFetch('/api/admin/system/supabase-config', { method: 'DELETE' });
      setResetOpen(false);
      setDiagResult(null);
      setSyncReport(null);
      setServiceRoleKey('');
      await queryClient.invalidateQueries({ queryKey: ['admin-system-status'] });
      showToast('Konfigurasi API Supabase runtime telah dihapus.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const runLoadTest = async (virtualUsers: 100 | 200) => {
    setTestingVu(virtualUsers);
    try {
      const res = await apiFetch<any>('/api/admin/system/load-test', {
        method: 'POST',
        body: JSON.stringify({ virtualUsers }),
      });
      setLoadResults((prev) => [res, ...prev]);
      showToast(
        `Uji beban ${virtualUsers} pengguna virtual selesai: ${res.passed ? 'LULUS' : 'PERLU PERHATIAN'}`,
        res.passed ? 'success' : 'error'
      );
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setTestingVu(null);
    }
  };

  if (isLoading) return <LoadingRows rows={5} />;

  const safeCfg = statusData?.supabaseConfig;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Pengaturan Koneksi API Supabase & Sistem</h2>
        <p className="text-sm text-slate-500">
          Kelola kredensial koneksi langsung ke Supabase PostgreSQL (tersimpan aman khusus server), uji kesiapan 17 tabel RLS, dan jalankan uji beban.
        </p>
      </div>

      {/* Panel Pengaturan Koneksi API Supabase */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Koneksi API Supabase</h3>
              <p className="text-xs text-slate-500">
                Driver aktif: <strong>{statusData?.activeDriver}</strong> · Sumber konfigurasi: {safeCfg?.source}
              </p>
            </div>
          </div>
          <StateIndicator
            variant={statusData?.supabaseReachable ? 'success' : 'warning'}
            label={statusData?.supabaseReachable ? 'Terhubung ke Supabase' : 'Belum Terhubung ke Supabase'}
          />
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
          <div>
            <strong>Keamanan Kunci API:</strong> Nilai <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> hanya
            dikirim satu arah ke server dan disimpan pada berkas internal server (tidak pernah dikirim balik ke browser).
          </div>
        </div>

        <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project URL (<code className="font-mono">SUPABASE_URL</code>) *
              </label>
              <input
                type="url"
                required
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://abcdefghijklmno.supabase.co"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Publishable / Anon Key (<code className="font-mono">SUPABASE_ANON_KEY</code>) *
              </label>
              <input
                type="text"
                required
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Service Role Key (<code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> — Khusus Server)
                </label>
                {safeCfg?.hasServiceRoleKey && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <KeyRound className="h-3 w-3" /> Tersimpan ({safeCfg.serviceRoleKeyMask})
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showServiceKey ? 'text' : 'password'}
                  value={serviceRoleKey}
                  onChange={(e) => setServiceRoleKey(e.target.value)}
                  placeholder={
                    safeCfg?.hasServiceRoleKey
                      ? 'Biarkan kosong jika tidak ingin mengganti Service Role Key yang tersimpan'
                      : 'Masukkan secret service_role key dari Supabase Settings -> API'
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-sm font-mono focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowServiceKey(!showServiceKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showServiceKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={testingConn || !supabaseUrl}
                onClick={handleTestConnection}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testingConn ? 'animate-spin' : ''}`} />
                <span>{testingConn ? 'Menguji Koneksi...' : 'Uji Koneksi & Cek 17 Tabel'}</span>
              </button>

              <button
                type="button"
                disabled={syncingData || !statusData?.supabaseConfigured}
                onClick={handleSyncToSupabase}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{syncingData ? 'Menyinkronkan...' : 'Sinkronkan Data ke Supabase'}</span>
              </button>

              {safeCfg?.source === 'Pengaturan Admin Server' && (
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{savingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi API'}</span>
            </button>
          </div>
        </form>

        {/* Hasil Diagnostik Koneksi & 17 Tabel */}
        {diagResult && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">{diagResult.message}</span>
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                Tabel Siap: {diagResult.readyTablesCount || 0}/{diagResult.totalTables || 17} · Storage:{' '}
                {diagResult.bucketReady ? 'Siap' : 'Belum Ada'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {(diagResult.tables || []).map((t: any) => (
                <div
                  key={t.table}
                  title={t.error || 'Tabel siap'}
                  className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-mono ${
                    t.ready ? 'border-emerald-200 bg-white text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {t.ready ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-600 shrink-0" />
                  )}
                  <span className="truncate">{t.table}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Laporan Sinkronisasi */}
        {syncReport && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-900">Ringkasan Sinkronisasi Data ke Supabase:</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              {syncReport.map((item) => (
                <div key={item.table} className="rounded border border-slate-200 bg-white px-3 py-1.5 flex justify-between">
                  <span className="font-mono text-slate-700 truncate">{item.table}</span>
                  <span className={`font-semibold tabular-nums ${item.error ? 'text-red-600' : 'text-emerald-700'}`}>
                    {item.error ? 'Error' : `${item.count} baris`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panduan Tahapan Konfigurasi Supabase di Dalam Aplikasi */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Panduan Langkah-demi-Langkah Menghubungkan Supabase</h3>
        <ol className="list-decimal pl-5 space-y-2.5 text-sm text-slate-700 leading-relaxed">
          <li>
            <strong>Buat Proyek Supabase:</strong> Masuk ke dashboard <code className="font-mono text-xs">supabase.com</code>, klik <em>New Project</em>, tentukan nama proyek (mis. <code className="font-mono text-xs">cbt-sekolah</code>), kata sandi database, dan pilih region terdekat (<code className="font-mono text-xs">ap-southeast-1</code> Singapore).
          </li>
          <li>
            <strong>Jalankan 3 Skrip Migrasi SQL:</strong> Buka menu <em>SQL Editor</em> di Supabase dan jalankan isi berkas secara berurutan:
            <span className="block font-mono text-xs text-blue-700 mt-1">
              1) supabase/migrations/001_init_schema.sql → 2) supabase/migrations/002_rls_policies.sql → 3) supabase/migrations/003_functions_and_storage.sql
            </span>
          </li>
          <li>
            <strong>Ambil Kredensial API:</strong> Di Supabase buka <em>Project Settings → API</em>, lalu salin <strong>Project URL</strong>, <strong>anon public key</strong>, dan <strong>service_role secret key</strong>.
          </li>
          <li>
            <strong>Masukkan ke Panel Pengaturan Ini:</strong> Tempel ketiga nilai pada formulir di atas, klik <strong>Uji Koneksi & Cek 17 Tabel</strong> untuk memastikan seluruh tabel & bucket <code className="font-mono text-xs">cbt-media</code> terbaca, lalu klik <strong>Simpan Konfigurasi API</strong>.
          </li>
          <li>
            <strong>Sinkronkan Data & Uji RLS:</strong> Klik <strong>Sinkronkan Data ke Supabase</strong> untuk menyalin data awal sekolah, siswa, bank soal, dan ujian; lalu jalankan <code className="font-mono text-xs">supabase/tests/rls_tests.sql</code> di SQL Editor untuk memverifikasi proteksi RLS.
          </li>
        </ol>
      </div>

      {/* Pengujian Beban Nyata 100 & 200 VU */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Uji Beban Konkurensi (100 & 200 Pengguna Virtual)</h3>
              <p className="text-xs text-slate-500">
                Menjalankan transaksi paralel autosave jawaban ke basis data dan memverifikasi 0 jawaban hilang.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testingVu !== null}
              onClick={() => runLoadTest(100)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 text-blue-600" />
              <span>{testingVu === 100 ? 'Menguji 100 VU...' : 'Uji 100 VU'}</span>
            </button>
            <button
              type="button"
              disabled={testingVu !== null}
              onClick={() => runLoadTest(200)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{testingVu === 200 ? 'Menguji 200 VU...' : 'Uji 200 VU'}</span>
            </button>
          </div>
        </div>

        {loadResults.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0" />
            <span>Belum ada pengujian beban dijalankan pada sesi ini. Klik salah satu tombol uji di atas untuk mengukur hasil aktual.</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Beban Uji</th>
                  <th className="px-3 py-2.5">Jawaban Diharapkan / Tersimpan</th>
                  <th className="px-3 py-2.5">Hilang</th>
                  <th className="px-3 py-2.5">Latensi Rata-rata / P95</th>
                  <th className="px-3 py-2.5">Durasi Total</th>
                  <th className="px-3 py-2.5">Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadResults.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{r.virtualUsers} VU</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      {r.expectedAnswers} / {r.storedAnswers}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">{r.lostAnswers}</td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">
                      {r.avgLatencyMs} ms / {r.p95LatencyMs} ms
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums">{r.totalDurationMs} ms</td>
                    <td className="px-3 py-2.5">
                      <StateIndicator variant={r.passed ? 'success' : 'danger'} label={r.passed ? 'Lulus' : 'Gagal'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetConfig}
        danger
        title="Reset Konfigurasi API Supabase"
        message="Apakah Anda yakin ingin menghapus konfigurasi koneksi API Supabase yang disimpan melalui panel Admin? Aplikasi akan kembali ke pengaturan environment (.env) atau mode SQLite lokal."
        confirmLabel="Ya, Reset Konfigurasi"
      />
    </div>
  );
}
