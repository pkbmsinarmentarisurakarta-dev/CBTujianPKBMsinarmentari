import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { LoadingRows, StateIndicator } from '../../components/common/UI';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch, getStoredToken } from '../../lib/api';

function formatCountdown(seconds: number) {
  if (!seconds || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MonitoringPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedExamId, setSelectedExamId] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-monitoring', selectedExamId],
    queryFn: () =>
      apiFetch<any>(`/api/admin/monitoring${selectedExamId ? `?examId=${encodeURIComponent(selectedExamId)}` : ''}`),
  });

  const activeExamId = selectedExamId || data?.selectedExamId || '';

  // Koneksi WebSocket efisiensi tinggi (tanpa polling berlebihan)
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}${
      activeExamId ? `&examId=${encodeURIComponent(activeExamId)}` : ''
    }`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'monitoring:update' || msg.type === 'activity:alert') {
          queryClient.invalidateQueries({ queryKey: ['admin-monitoring'] });
        }
      } catch {
        // Abaikan payload non-JSON
      }
    };

    return () => ws.close();
  }, [activeExamId, queryClient]);

  // Countdown tick lokal tiap detik untuk kelancaran visual antara event WebSocket
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleResetSession = async (studentId: string, name: string) => {
    if (!activeExamId) return;
    try {
      await apiFetch(`/api/admin/exams/${activeExamId}/reset-session/${studentId}`, { method: 'POST' });
      showToast(`Sesi ujian ${name} berhasil direset.`, 'success');
      refetch();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (isLoading) return <LoadingRows rows={6} />;

  const summary = data?.summary;
  const participants = data?.participants || [];
  const activityLogs = data?.activityLogs || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Monitoring Ujian Real-Time</h2>
          <p className="text-sm text-slate-500">
            Pantau kehadiran, sisa waktu peserta, status koneksi, dan catatan indikator aktivitas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            {wsConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                <span>Saluran Live Terhubung</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-600" />
                <span>Sinkronisasi Manual</span>
              </>
            )}
          </div>
          <select
            value={activeExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {(data?.exams || []).map((ex: any) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.status})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Peserta Terdaftar</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.totalRegistered}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Belum Mulai</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-700">{summary.notStarted}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Sedang Mengerjakan</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{summary.ongoing}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Sudah Submit</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{summary.completed}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">Total Catatan Aktivitas</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{summary.totalAlerts}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Tabel Peserta */}
        <div className="lg:col-span-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">Daftar Status Peserta</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Peserta</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sisa Waktu</th>
                <th className="px-4 py-3">Terjawab</th>
                <th className="px-4 py-3">Indikator</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {participants.map((p: any) => {
                const liveRemain =
                  p.session_status === 'berlangsung' ? Math.max(0, (p.remaining_seconds || 0) - tick) : 0;
                return (
                  <tr key={p.student_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.full_name}</div>
                      <div className="font-mono text-slate-500">{p.nis}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.class_name || '-'}</td>
                    <td className="px-4 py-3">
                      {p.session_status === 'berlangsung' ? (
                        <StateIndicator variant="info" label="Sedang Ujian" />
                      ) : p.session_status === 'selesai' || p.session_status === 'waktu_habis' ? (
                        <StateIndicator variant="success" label="Selesai" />
                      ) : (
                        <StateIndicator variant="neutral" label="Belum Mulai" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                      {p.session_status === 'berlangsung' ? formatCountdown(liveRemain) : '-'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{p.answered_count || 0} soal</td>
                    <td className="px-4 py-3">
                      {p.suspicious_count > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700 tabular-nums">
                          <AlertTriangle className="h-3.5 w-3.5" /> {p.suspicious_count}x catatan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Wajar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.session_status === 'berlangsung' && (
                        <button
                          type="button"
                          onClick={() => handleResetSession(p.student_id, p.full_name)}
                          className="inline-flex items-center gap-1 text-amber-700 hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Feed Log Aktivitas */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">Rekap Aktivitas Sesi</h3>
            <p className="text-xs text-slate-500">Indikator untuk tinjauan pengawas, bukan vonis otomatis.</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {activityLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Belum ada catatan aktivitas sesi pada ujian ini.</div>
            ) : (
              activityLogs.map((log: any) => (
                <div key={log.id} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{log.full_name}</span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {new Date(log.occurred_at + (log.occurred_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    {log.event_type === 'session_started' || log.event_type === 'session_submitted' ? (
                      <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    ) : (
                      <Activity className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className="font-mono">{log.event_type}</span>
                    {log.details && <span>· {log.details}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
