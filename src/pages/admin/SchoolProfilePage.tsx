import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { LoadingRows } from '../../components/common/UI';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import type { School } from '../../types';

export function SchoolProfilePage() {
  const { showToast } = useToast();
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-school'],
    queryFn: () => apiFetch<{ school: School }>('/api/admin/school'),
  });

  const [form, setForm] = useState<Partial<School>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (data?.school) {
      setForm(data.school);
    }
  }, [data]);

  const handleUploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'logos');
      const res = await apiFetch<{ url: string }>('/api/admin/upload', { method: 'POST', body: fd });
      setForm((prev) => ({ ...prev, logo_url: res.url }));
      showToast('Logo sekolah berhasil diunggah. Klik Simpan untuk menerapkan.', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/school', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          npsn: form.npsn || '',
          level: form.level || 'SMA/MA',
          address: form.address || '',
          phone: form.phone || '',
          email: form.email || '',
          principal_name: form.principal_name || '',
          logo_url: form.logo_url || '',
          app_title: form.app_title || 'CBT Online Sekolah/Madrasah',
          active_academic_year: form.active_academic_year || '2026/2027',
          active_semester: form.active_semester || 'Ganjil',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-school'] });
      await refreshUser();
      showToast('Profil sekolah dan tahun pelajaran berhasil disimpan.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingRows rows={6} />;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Profil Sekolah / Madrasah</h2>
        <p className="text-sm text-slate-500">Pengaturan identitas institusi, logo resmi, tahun pelajaran, dan semester aktif.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-6 border-b border-slate-100 pb-6">
          <img
            src={form.logo_url || '/images/school-logo.jpg'}
            alt="Logo institusi"
            referrerPolicy="no-referrer"
            className="h-20 w-20 rounded-xl border border-slate-200 object-contain bg-white p-1"
          />
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">Logo Sekolah / Madrasah</div>
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <ImagePlus className="h-4 w-4" />
              <span>{uploading ? 'Mengunggah...' : 'Unggah Logo Baru (PNG/JPG/WebP)'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadLogo(f);
                }}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Sekolah / Madrasah</label>
            <input
              type="text"
              required
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NPSN / NSM</label>
            <input
              type="text"
              value={form.npsn || ''}
              onChange={(e) => setForm({ ...form, npsn: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Jenjang Pendidikan</label>
            <select
              value={form.level || 'SMA/MA'}
              onChange={(e) => setForm({ ...form, level: e.target.value as any })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="SD/MI">SD / MI</option>
              <option value="SMP/MTs">SMP / MTs</option>
              <option value="SMA/MA">SMA / MA</option>
              <option value="SMK">SMK</option>
              <option value="PKBM">PKBM</option>
              <option value="Lembaga">Lembaga Pendidikan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kepala Sekolah / Madrasah</label>
            <input
              type="text"
              value={form.principal_name || ''}
              onChange={(e) => setForm({ ...form, principal_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Telepon</label>
            <input
              type="text"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Resmi</label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea
              rows={2}
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Judul Aplikasi CBT</label>
            <input
              type="text"
              required
              value={form.app_title || ''}
              onChange={(e) => setForm({ ...form, app_title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Pelajaran</label>
              <input
                type="text"
                required
                value={form.active_academic_year || ''}
                onChange={(e) => setForm({ ...form, active_academic_year: e.target.value })}
                placeholder="2026/2027"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Semester Aktif</label>
              <select
                value={form.active_semester || 'Ganjil'}
                onChange={(e) => setForm({ ...form, active_semester: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Profil Sekolah'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
