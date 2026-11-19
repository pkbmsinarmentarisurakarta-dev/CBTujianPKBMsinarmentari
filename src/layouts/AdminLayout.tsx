import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  Database,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_MENU = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/sekolah', label: 'Profil Sekolah', icon: Building2 },
  { to: '/admin/siswa', label: 'Data Siswa', icon: Users },
  { to: '/admin/kelas', label: 'Data Kelas', icon: GraduationCap },
  { to: '/admin/mapel', label: 'Mata Pelajaran', icon: BookOpen },
  { to: '/admin/bank-soal', label: 'Bank Soal', icon: Database },
  { to: '/admin/ujian', label: 'Manajemen Ujian', icon: ClipboardList },
  { to: '/admin/jadwal', label: 'Jadwal Ujian', icon: CalendarClock },
  { to: '/admin/kartu-ujian', label: 'Cetak Kartu Ujian', icon: IdCard },
  { to: '/admin/monitoring', label: 'Monitoring Ujian', icon: Activity },
  { to: '/admin/hasil', label: 'Hasil Ujian', icon: Award },
  { to: '/admin/laporan', label: 'Laporan', icon: BarChart3 },
  { to: '/admin/akun', label: 'Manajemen Akun', icon: ShieldCheck },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentNav = ADMIN_MENU.find((m) => (m.end ? location.pathname === m.to : location.pathname.startsWith(m.to)));

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex print:bg-white">
      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden print:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={user?.schoolLogo || '/images/school-logo.jpg'}
              alt="Logo sekolah"
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-lg border border-slate-200 object-cover shrink-0 bg-white"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">CBT Sekolah</div>
              <div className="text-xs text-slate-500 truncate">{user?.schoolName || 'Panel Admin'}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {ADMIN_MENU.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-8 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Admin CBT</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{currentNav?.label || 'Panel Kontrol'}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
            <span className="hidden md:inline whitespace-nowrap">
              {user?.activeAcademicYear || '2026/2027'} · Semester {user?.activeSemester || 'Ganjil'}
            </span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <span className="font-medium text-slate-800 whitespace-nowrap">{user?.fullName}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto print:p-0 print:max-w-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
