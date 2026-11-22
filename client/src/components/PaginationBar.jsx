import React from 'react';
import { Box, MenuItem, Select, TablePagination, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function PaginationBar({ pagination, onPageChange, onPageSizeChange }) {
  const { t } = useTranslation();
  if (!pagination) return null;
  const { page, pageSize, total } = pagination;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        px: 2,
        py: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {total} {t('common.total').toLowerCase()}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('common.rowsPerPage')}
          </Typography>
          <Select
            size="small"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <MenuItem key={size} value={size}>
                {size}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('common.page')} {page} {t('common.of')} {pagination.totalPages || 1}
          </Typography>
          <TablePagination
            component="div"
            count={total}
            page={page - 1}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[]}
            onPageChange={(_, nextPage) => onPageChange(nextPage + 1)}
            sx={{ '.MuiTablePagination-toolbar': { minHeight: 40, p: 0 } }}
          />
        </Box>
      </Box>
    </Box>
  );
}
