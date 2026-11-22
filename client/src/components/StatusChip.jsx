import React from 'react';
import { Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';

const STATUS_COLORS = {
  draft: 'default',
  registered: 'info',
  analyzed: 'info',
  pending_visa: 'warning',
  visa_approved: 'success',
  visa_rejected: 'error',
  assigned: 'primary',
  in_progress: 'primary',
  processed: 'success',
  archived: 'default',
  cancelled: 'default',
};

const PRIORITY_COLORS = {
  low: 'default',
  normal: 'info',
  high: 'warning',
  urgent: 'error',
};

export function StatusChip({ status, size = 'small' }) {
  const { t } = useTranslation();
  return (
    <Chip
      size={size}
      label={t(`status.${status}`, status)}
      color={STATUS_COLORS[status] || 'default'}
      variant={status === 'archived' || status === 'cancelled' ? 'outlined' : 'filled'}
    />
  );
}

export function PriorityChip({ priority, size = 'small' }) {
  const { t } = useTranslation();
  return (
    <Chip
      size={size}
      label={t(`priority.${priority}`, priority)}
      color={PRIORITY_COLORS[priority] || 'default'}
      variant="outlined"
    />
  );
}

export default StatusChip;
