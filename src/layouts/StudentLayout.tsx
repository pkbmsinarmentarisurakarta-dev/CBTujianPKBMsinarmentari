import { LogOut } from 'lucide-react';
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/masuk-siswa');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={user?.schoolLogo || '/images/school-logo.jpg'}
              alt="Logo sekolah"
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-lg border border-slate-200 object-cover shrink-0 bg-white"
            />
            <span className="text-base font-bold tracking-tight text-slate-900 truncate">
              {user?.schoolName || 'Portal Ujian Siswa'}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-800">{user?.fullName}</span>
              <span>·</span>
              <span className="tabular-nums">NIS {user?.nis || user?.username}</span>
              {user?.className && (
                <>
                  <span>·</span>
                  <span>{user.className}</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-500" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
