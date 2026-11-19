import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AdminLayout } from './layouts/AdminLayout';
import { StudentLayout } from './layouts/StudentLayout';
import { AccountsAndAuditPage } from './pages/admin/AccountsAndAuditPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { ClassesPage } from './pages/admin/ClassesPage';
import { ExamCardsPage } from './pages/admin/ExamCardsPage';
import { ExamsPage } from './pages/admin/ExamsPage';
import { MonitoringPage } from './pages/admin/MonitoringPage';
import { QuestionBankPage } from './pages/admin/QuestionBankPage';
import { ResultsAndReportsPage } from './pages/admin/ResultsAndReportsPage';
import { SchoolProfilePage } from './pages/admin/SchoolProfilePage';
import { SettingsAndTestPage } from './pages/admin/SettingsAndTestPage';
import { StudentsPage } from './pages/admin/StudentsPage';
import { SubjectsPage } from './pages/admin/SubjectsPage';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';
import { StudentLoginPage } from './pages/auth/StudentLoginPage';
import { ExamRoomPage } from './pages/student/ExamRoomPage';
import { StudentDashboardPage } from './pages/student/StudentDashboardPage';
import type { UserRole } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Memverifikasi sesi pengguna...
      </div>
    );
  }
  if (!user) return <Navigate to={role === 'ADMIN' ? '/admin/login' : '/masuk-siswa'} replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/student'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Portal Masuk Terpisah: Peserta/Siswa & Admin/Proktor */}
              <Route path="/" element={<Navigate to="/masuk-siswa" replace />} />
              <Route path="/masuk-siswa" element={<StudentLoginPage />} />
              <Route path="/login" element={<StudentLoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/masuk-admin" element={<AdminLoginPage />} />

              {/* Rute Admin */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute role="ADMIN">
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="sekolah" element={<SchoolProfilePage />} />
                <Route path="siswa" element={<StudentsPage />} />
                <Route path="kelas" element={<ClassesPage />} />
                <Route path="mapel" element={<SubjectsPage />} />
                <Route path="bank-soal" element={<QuestionBankPage />} />
                <Route path="ujian" element={<ExamsPage mode="manage" />} />
                <Route path="jadwal" element={<ExamsPage mode="schedule" />} />
                <Route path="kartu-ujian" element={<ExamCardsPage />} />
                <Route path="monitoring" element={<MonitoringPage />} />
                <Route path="hasil" element={<ResultsAndReportsPage mode="results" />} />
                <Route path="laporan" element={<ResultsAndReportsPage mode="reports" />} />
                <Route path="akun" element={<AccountsAndAuditPage />} />
                <Route path="pengaturan" element={<SettingsAndTestPage />} />
              </Route>

              {/* Rute Siswa */}
              <Route
                path="/student"
                element={
                  <ProtectedRoute role="SISWA">
                    <StudentLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<StudentDashboardPage />} />
              </Route>

              {/* Ruang Ujian Siswa */}
              <Route
                path="/exam/:sessionId"
                element={
                  <ProtectedRoute role="SISWA">
                    <ExamRoomPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/masuk-siswa" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
