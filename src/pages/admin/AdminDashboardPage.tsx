import { useQuery } from '@tanstack/react-query';
import { Activity, BookOpen, CheckCircle2, ClipboardList, Database, GraduationCap, PlayCircle, Users } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LoadingRows } from '../../components/common/UI';
import { apiFetch } from '../../lib/api';

export function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch<any>('/api/admin/dashboard'),
  });

  if (isLoading) return <LoadingRows rows={6} />;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Gagal memuat ringkasan dashboard: {(error as Error).message}
      </div>
    );
  }

  const s = data.stats;
  const kpiCards = [
    { label: 'Jumlah Siswa', value: s.totalStudents, icon: Users, to: '/admin/siswa' },
    { label: 'Jumlah Kelas', value: s.totalClasses, icon: GraduationCap, to: '/admin/kelas' },
    { label: 'Mata Pelajaran', value: s.totalSubjects, icon: BookOpen, to: '/admin/mapel' },
    { label: 'Bank Soal', value: s.totalQuestions, icon: Database, to: '/admin/bank-soal' },
    { label: 'Total Ujian', value: s.totalExams, icon: ClipboardList, to: '/admin/ujian' },
    { label: 'Ujian Aktif', value: s.activeExams, icon: PlayCircle, to: '/admin/monitoring', accent: true },
    { label: 'Peserta Sedang Ujian', value: s.ongoingParticipants, icon: Activity, to: '/admin/monitoring' },
    { label: 'Peserta Selesai Ujian', value: s.completedParticipants, icon: CheckCircle2, to: '/admin/hasil' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ringkasan Penyelenggaraan Ujian</h2>
          <p className="text-sm text-slate-500">Data langsung dari basis data sekolah dan sesi peserta aktif.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/monitoring"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Buka Monitoring
          </Link>
          <Link
            to="/admin/ujian"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            Kelola Ujian
          </Link>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{card.label}</span>
                <Icon className={`h-4 w-4 ${card.accent ? 'text-blue-600' : 'text-slate-400'}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold tabular-nums ${card.accent ? 'text-blue-700' : 'text-slate-900'}`}>
                {card.value}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Grafik Statistik */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Rata-Rata Nilai per Ujian</h3>
            <p className="text-xs text-slate-500">Perbandingan skor rata-rata pada ujian yang telah dinilai.</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chartByExam || []} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => String(v).slice(0, 18)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val: any) => [`${val ?? 0}`, 'Rata-rata']}
                  contentStyle={{ borderRadius: '8px', borderColor: '#e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="avgScore" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Sebaran Rentang Nilai</h3>
            <p className="text-xs text-slate-500">Distribusi perolehan nilai akhir seluruh peserta.</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.scoreDistribution || []} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(val: any) => [`${val ?? 0} peserta`, 'Jumlah']}
                  contentStyle={{ borderRadius: '8px', borderColor: '#e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="jumlah" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Aktivitas Terbaru */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Aktivitas Terbaru Sistem</h3>
            <p className="text-xs text-slate-500">Catatan audit autentikasi, sesi ujian, dan perubahan data.</p>
          </div>
          <Link to="/admin/akun" className="text-xs font-medium text-blue-700 hover:underline">
            Lihat Semua Log
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {(data.recentLogs || []).map((log: any) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-medium text-blue-700">{log.action}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-700 truncate">{log.actor_name || 'Sistem'} ({log.actor_role})</span>
              </div>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {new Date(log.created_at + (log.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('id-ID')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
