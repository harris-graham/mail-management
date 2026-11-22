import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';

export default function BarList({ items, labelKey = 'label', valueKey = 'count', color = 'primary' }) {
  if (!items?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  const max = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {items.map((item, index) => (
        <Box key={`${item[labelKey] || index}`}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 2 }}>
            <Typography variant="body2" noWrap sx={{ maxWidth: '75%' }}>
              {item[labelKey] || '—'}
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {item[valueKey]}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={((Number(item[valueKey]) || 0) / max) * 100}
            color={color}
            sx={{ height: 7, borderRadius: 4 }}
          />
        </Box>
      ))}
    </Box>
  );
}
