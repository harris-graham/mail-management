import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';
import PaginationBar from '../components/PaginationBar';
import { formatDateTime, humanizeAction } from '../utils/format';

export default function AuditPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ actorId: '', action: '', entity: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [state, setState] = useState({ loading: true, error: '' });
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const params = { page, pageSize };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const { data } = await client.get('/admin/audit', { params });
      setRows(data.data);
      setPagination({ ...data.pagination, totalPages: Math.ceil(data.pagination.total / pageSize) || 1 });
      setState({ loading: false, error: '' });
    } catch (error) {
      setState({ loading: false, error: apiError(error, t('errors.loadFailed')) });
    }
  }, [filters, page, pageSize, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    client
      .get('/users')
      .then(({ data }) => setUsers(data.data))
      .catch(() => {});
  }, []);

  const update = (key) => (event) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  return (
    <Box>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('audit.actor')}</InputLabel>
              <Select label={t('audit.actor')} value={filters.actorId} onChange={update('actorId')}>
                <MenuItem value="">{t('common.all')}</MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label={t('audit.action')} value={filters.action} onChange={update('action')} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label={t('audit.entity')} value={filters.entity} onChange={update('entity')} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label={t('mail.from')}
              value={filters.from}
              onChange={update('from')}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label={t('mail.to')}
              value={filters.to}
              onChange={update('to')}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={1}>
            <Button fullWidth variant="outlined" onClick={() => setFilters({ actorId: '', action: '', entity: '', from: '', to: '' })}>
              {t('common.reset')}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('audit.date')}</TableCell>
                <TableCell>{t('audit.actor')}</TableCell>
                <TableCell>{t('audit.action')}</TableCell>
                <TableCell>{t('audit.entity')}</TableCell>
                <TableCell>{t('audit.details')}</TableCell>
                <TableCell>{t('audit.ip')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!state.loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t('audit.noEntries')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>
                    {row.actor_name ? (
                      <>
                        <Typography variant="body2">{row.actor_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.actor_matricule}
                        </Typography>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={humanizeAction(row.action)} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.entity}</Typography>
                    {row.entity_id && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {row.entity_id}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Tooltip
                      title={
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11 }}>
                          {JSON.stringify({ old: row.old_values, new: row.new_values }, null, 2)}
                        </pre>
                      }
                    >
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {row.new_values ? JSON.stringify(row.new_values).slice(0, 90) : '—'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{row.ip || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <PaginationBar
          pagination={pagination}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Paper>
    </Box>
  );
}
