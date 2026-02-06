import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import { Toaster as Sonner } from 'sonner';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PresentMemberPage from '@/pages/PresentMemberPage';
import PendingApprovalsPage from '@/pages/PendingApprovalsPage';
import AttendanceRecordsPage from '@/pages/AttendanceRecordsPage';
import MembersPage from '@/pages/MembersPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import SeedPage from '@/pages/SeedPage';
import UsersPage from '@/pages/UsersPage';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const authUser = auth.currentUser;

  // If Firebase already has a session but our context hasn't hydrated yet,
  // wait instead of redirecting back to /login.
  if (isLoading || (!user && authUser)) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const authUser = auth.currentUser;

  if (isLoading || (!user && authUser)) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/present"
        element={
          <ProtectedRoute>
            <PresentMemberPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pending"
        element={
          <ProtectedRoute>
            <PendingApprovalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/records"
        element={
          <ProtectedRoute>
            <AttendanceRecordsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/members"
        element={
          <ProtectedRoute>
            <MembersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <AdminRoute>
            <AuditLogsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        }
      />
      <Route path="/seed" element={<SeedPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Sonner />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
