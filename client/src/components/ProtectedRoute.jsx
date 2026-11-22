import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute({ permission }) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={36} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {t('common.loading')}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          403
        </Typography>
        <Typography color="text.secondary">{t('errors.forbidden')}</Typography>
      </Box>
    );
  }

  return <Outlet />;
}
