import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from './i18n/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { AppLayout } from './components/layout/AppLayout';

import { DashboardPage } from './pages/DashboardPage';
import { ProductionPage } from './pages/ProductionPage';
import { StockIssuesPage } from './pages/StockIssuesPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DailyClosingPage } from './pages/DailyClosingPage';
import { ProductsPage } from './pages/ProductsPage';
import { SellersPage } from './pages/SellersPage';
import { StockPage } from './pages/StockPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { BackupCenterPage } from './pages/BackupCenterPage';
import { LoginPage } from './pages/LoginPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRole?: string }> = ({
  children,
  requiredRole,
}) => {
  const { user, isLoading, isOwner } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream-100">
        <div className="w-10 h-10 border-4 border-maroon-800 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'owner' && !isOwner) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <SyncProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="production" element={<ProductionPage />} />
                  <Route path="issues" element={<StockIssuesPage />} />
                  <Route path="settlements" element={<SettlementsPage />} />
                  <Route
                    path="expenses"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <ExpensesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="closing"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <DailyClosingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="products"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <ProductsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="sellers"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <SellersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="stock" element={<StockPage />} />
                  <Route
                    path="reports"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <ReportsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="audit"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <AuditLogsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="backup"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <BackupCenterPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings/backup"
                    element={
                      <ProtectedRoute requiredRole="owner">
                        <BackupCenterPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </SyncProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
