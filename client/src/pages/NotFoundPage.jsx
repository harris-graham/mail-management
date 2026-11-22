import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Typography } from '@mui/material';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Box sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h2" sx={{ fontWeight: 800, color: 'primary.main' }}>
        404
      </Typography>
      <Typography variant="h6" sx={{ mt: 1 }}>
        {t('errors.notFound')}
      </Typography>
      <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate('/')}>
        {t('nav.dashboard')}
      </Button>
    </Box>
  );
}
