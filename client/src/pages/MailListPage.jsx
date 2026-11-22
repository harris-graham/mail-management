import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import client, { apiError, downloadFile } from '../api/client';
import PageHeader from '../components/PageHeader';
import PaginationBar from '../components/PaginationBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { PriorityChip, StatusChip } from '../components/StatusChip';
import { formatDate } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const TYPES = ['correspondance', 'consultation', 'def'];
const STATUSES = [
  'draft',
  'registered',
  'analyzed',
  'pending_visa',
  'visa_approved',
  'visa_rejected',
  'assigned',
  'in_progress',
  'processed',
  'archived',
  'cancelled',
];

const EMPTY_FILTERS = {
  q: '',
  type: '',
  status: '',
  year: '',
  overdue: false,
  unassigned: false,
  archived: '',
};

export default function MailListPage({ archiveMode = false }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    archived: archiveMode ? 'true' : '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [state, setState] = useState({ loading: true, error: '' });
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [assignComment, setAssignComment] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const params = {
        page,
        pageSize,
        sort: 'received_at',
        direction: 'desc',
      };
      if (filters.q) params.q = filters.q;
      if (filters.type) params.type = filters.type;
      if (filters.status) params.status = filters.status;
      if (filters.year) params.year = filters.year;
      if (filters.overdue) params.overdue = 'true';
      if (filters.unassigned) params.unassigned = 'true';
      if (filters.archived) params.archived = filters.archived;
      if (archiveMode) params.archived = 'true';
      const { data } = await client.get('/mail', { params });
      setRecords(data.data);
      setPagination(data.pagination);
      setSelected([]);
      setState({ loading: false, error: '' });
    } catch (error) {
      setState({ loading: false, error: apiError(error, t('errors.loadFailed')) });
    }
  }, [filters, page, pageSize, archiveMode, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hasPermission('mail.assign')) return;
    client
      .get('/users/assignable')
      .then(({ data }) => setAssignees(data.data))
      .catch(() => {});
  }, [hasPermission]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, index) => current - index);
  }, []);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleSelect = (id) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const allSelected = records.length > 0 && selected.length === records.length;

  const toggleAll = () => {
    setSelected(allSelected ? [] : records.map((record) => record.id));
  };

  const exportData = async (format) => {
    try {
      const params = { format, pageSize: 10000, sort: 'received_at', direction: 'desc' };
      if (filters.q) params.q = filters.q;
      if (filters.type) params.type = filters.type;
      if (filters.status) params.status = filters.status;
      if (filters.year) params.year = filters.year;
      if (filters.archived) params.archived = filters.archived;
      await downloadFile(
        '/mail/export',
        `courriers-${new Date().toISOString().slice(0, 10)}.${format}`,
        params
      );
    } catch (error) {
      setSnack(apiError(error, t('errors.generic')));
    }
  };

  const runBulk = async (action, payload = {}) => {
    setBusy(true);
    try {
      const { data } = await client.post('/mail/bulk', {
        ids: selected,
        action,
        ...payload,
      });
      const failures = data.results.filter((result) => !result.ok);
      setSnack(
        failures.length
          ? `${data.results.length - failures.length} / ${data.results.length} · ${failures[0].error}`
          : t('common.saved')
      );
      setSelected([]);
      setConfirm(null);
      setAssignOpen(false);
      await load();
    } catch (error) {
      setSnack(apiError(error, t('errors.generic')));
    } finally {
      setBusy(false);
    }
  };

  const assign = () => {
    if (!assignTo) return;
    runBulk('assign', { assignedTo: assignTo, comment: assignComment || undefined });
  };

  const headerActions = (
    <>
      {hasPermission('mail.export') && (
        <>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => exportData('xlsx')}
          >
            {t('mail.exportXlsx')}
          </Button>
          <Button variant="outlined" onClick={() => exportData('csv')}>
            {t('mail.exportCsv')}
          </Button>
        </>
      )}
      {!archiveMode && hasPermission('mail.create') && (
        <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/mail/new">
          {t('mail.new')}
        </Button>
      )}
    </>
  );

  return (
    <Box>
      <PageHeader
        title={archiveMode ? t('nav.archive') : t('mail.title')}
        subtitle={
          archiveMode
            ? t('reference.subtitle')
            : t('dashboard.subtitle')
        }
        actions={headerActions}
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label={t('common.search')}
              placeholder={t('mail.reference')}
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('mail.type')}</InputLabel>
              <Select
                label={t('mail.type')}
                value={filters.type}
                onChange={(event) => updateFilter('type', event.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {t(`type.${type}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('mail.status')}</InputLabel>
              <Select
                label={t('mail.status')}
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {STATUSES.filter((status) => (archiveMode ? status === 'archived' : true)).map((status) => (
                  <MenuItem key={status} value={status}>
                    {t(`status.${status}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('mail.year')}</InputLabel>
              <Select
                label={t('mail.year')}
                value={filters.year}
                onChange={(event) => updateFilter('year', event.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                {years.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={filters.overdue}
                    onChange={(event) => updateFilter('overdue', event.target.checked)}
                  />
                }
                label={<Typography variant="caption">{t('mail.overdueOnly')}</Typography>}
              />
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {selected.length > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ mr: 1 }}>
            {t('mail.selected', { count: selected.length })}
          </Typography>
          {hasPermission('mail.assign') && (
            <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setAssignOpen(true)}>
              {t('mail.assign')}
            </Button>
          )}
          {hasPermission('mail.update') && (
            <Button size="small" startIcon={<TaskAltIcon />} onClick={() => runBulk('process')}>
              {t('mail.process')}
            </Button>
          )}
          {hasPermission('mail.archive') && !archiveMode && (
            <Button size="small" startIcon={<ArchiveIcon />} onClick={() => runBulk('archive')}>
              {t('mail.archive')}
            </Button>
          )}
          {hasPermission('mail.delete') && (
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() =>
                setConfirm({
                  title: t('mail.deleteConfirm'),
                  message: t('mail.deleteConfirm'),
                  action: () => runBulk('delete'),
                  destructive: true,
                })
              }
            >
              {t('common.delete')}
            </Button>
          )}
        </Paper>
      )}

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
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={toggleAll}
                  />
                </TableCell>
                <TableCell>{t('mail.reference')}</TableCell>
                <TableCell>{t('mail.subject')}</TableCell>
                <TableCell>{t('mail.type')}</TableCell>
                <TableCell>{t('mail.status')}</TableCell>
                <TableCell>{t('mail.priority')}</TableCell>
                <TableCell>{t('mail.assignedTo')}</TableCell>
                <TableCell>{t('mail.receivedAt')}</TableCell>
                <TableCell>{t('mail.dueAt')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!state.loading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t('mail.noResults')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {records.map((record) => {
                const overdue =
                  record.due_at &&
                  new Date(record.due_at) < new Date() &&
                  !['processed', 'archived', 'cancelled'].includes(record.status);
                return (
                  <TableRow key={record.id} hover selected={selected.includes(record.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected.includes(record.id)}
                        onChange={() => toggleSelect(record.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        component={RouterLink}
                        to={`/mail/${record.id}`}
                        variant="body2"
                        sx={{ fontWeight: 700, color: 'primary.main', textDecoration: 'none' }}
                      >
                        {record.reference}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 340 }}>
                      <Typography variant="body2" noWrap title={record.subject || ''}>
                        {record.subject || record.analysis || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{t(`type.${record.type}`, record.type)}</Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={record.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityChip priority={record.priority} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{record.assigned_to_name || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(record.received_at || record.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={overdue ? 'error.main' : 'text.primary'}
                        fontWeight={overdue ? 700 : 400}
                      >
                        {formatDate(record.due_at)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
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

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('mail.assign')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('mail.assignTo')}</InputLabel>
              <Select
                label={t('mail.assignTo')}
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
              >
                {assignees.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.full_name} · {user.matricule}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              label={t('mail.comment')}
              value={assignComment}
              onChange={(event) => setAssignComment(event.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={assign} disabled={!assignTo || busy}>
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        destructive={confirm?.destructive}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.action?.()}
      />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack('')}
        message={snack}
      />
    </Box>
  );
}
