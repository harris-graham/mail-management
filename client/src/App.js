import React from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MailListPage from './pages/MailListPage';
import MailCreatePage from './pages/MailCreatePage';
import MailDetailPage from './pages/MailDetailPage';
import UsersPage from './pages/UsersPage';
import ReferencePage from './pages/ReferencePage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route element={<ProtectedRoute permission="mail.read" />}>
            <Route path="mail" element={<MailListPage />} />
            <Route path="mail/:id" element={<MailDetailPage />} />
            <Route path="archive" element={<MailListPage archiveMode />} />
          </Route>

          <Route element={<ProtectedRoute permission="mail.create" />}>
            <Route path="mail/new" element={<MailCreatePage />} />
          </Route>

          <Route element={<ProtectedRoute permission="analytics.read" />}>
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="user.read" />}>
            <Route path="users" element={<UsersPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="reference.manage" />}>
            <Route path="reference" element={<ReferencePage />} />
          </Route>

          <Route element={<ProtectedRoute permission="audit.read" />}>
            <Route path="audit" element={<AuditPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="db.manage" />}>
            <Route path="admin" element={<AdminPage />} />
          </Route>

          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
