import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import client, { apiError, downloadFile } from '../api/client';
import PageHeader from '../components/PageHeader';
import BarList from '../components/BarList';

const DIMENSIONS = ['nature', 'ministry', 'service', 'agent', 'status', 'type'];
const INTERVALS = ['day', 'week', 'month', 'quarter', 'year'];
const TYPES = ['correspondance', 'consultation', 'def'];

export default function ReportsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ from: '', to: '', type: '', interval: 'month', dimension: 'nature' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [dimension, setDimension] = useState([]);
  const [sla, setSla] = useState([]);
  const [workload, setWorkload] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.type) params.type = filters.type;
      const [summaryResponse, seriesResponse, dimensionResponse, slaResponse, workloadResponse] =
        await Promise.all([
          client.get('/analytics/summary', { params }),
          client.get('/analytics/timeseries', { params: { ...params, interval: filters.interval } }),
          client.get('/analytics/by-dimension', { params: { ...params, dimension: filters.dimension } }),
          client.get('/analytics/sla', { params }),
          client.get('/analytics/workload', { params }),
        ]);
      setSummary(summaryResponse.data.data);
      setSeries(seriesResponse.data.data);
      setDimension(dimensionResponse.data.data);
      setSla(slaResponse.data.data);
      setWorkload(workloadResponse.data.data);
      setError('');
    } catch (requestError) {
      setError(apiError(requestError, t('errors.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  const exportData = async (format) => {
    try {
      const params = { format, dimension: filters.dimension };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.type) params.type = filters.type;
      await downloadFile(`/analytics/export`, `statistiques.${format}`, params);
    } catch (requestError) {
      setError(apiError(requestError));
    }
  };

  const buckets = (() => {
    const map = new Map();
    for (const row of series) {
      const key = String(row.bucket).slice(0, filters.interval === 'day' ? 10 : 7);
      map.set(key, (map.get(key) || 0) + Number(row.count));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([label, count]) => ({ label, count }));
  })();
  const maxBucket = Math.max(...buckets.map((item) => item.count), 1);

  return (
    <Box>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => exportData('xlsx')}>
              {t('mail.exportXlsx')}
            </Button>
            <Button variant="outlined" onClick={() => exportData('csv')}>
              {t('mail.exportCsv')}
            </Button>
          </>
        }
      />

      <Paper sx={{ p: 2, mb: 2.5 }}>
        <Grid container spacing={2}>
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
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('mail.type')}</InputLabel>
              <Select label={t('mail.type')} value={filters.type} onChange={update('type')}>
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
              <InputLabel>{t('reports.interval')}</InputLabel>
              <Select label={t('reports.interval')} value={filters.interval} onChange={update('interval')}>
                {INTERVALS.map((interval) => (
                  <MenuItem key={interval} value={interval}>
                    {t(`reports.${interval}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('reports.dimension')}</InputLabel>
              <Select label={t('reports.dimension')} value={filters.dimension} onChange={update('dimension')}>
                {DIMENSIONS.map((dimension) => (
                  <MenuItem key={dimension} value={dimension}>
                    {t(`reports.${dimension}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('reports.volume')}
                </Typography>
                {buckets.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('common.noData')}
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 240 }}>
                    {buckets.map((item) => (
                      <Box key={item.label} sx={{ flex: 1, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          {item.count}
                        </Typography>
                        <Box
                          sx={{
                            height: Math.max((item.count / maxBucket) * 170, 4),
                            bgcolor: 'primary.main',
                            borderRadius: '6px 6px 0 0',
                            opacity: 0.85,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('reports.summary')}
                </Typography>
                <Stack spacing={1.5}>
                  {[
                    [t('dashboard.total'), summary?.total],
                    [t('dashboard.processed'), summary?.processed],
                    [t('dashboard.pendingVisa'), summary?.pending_visa],
                    [t('dashboard.overdue'), summary?.overdue],
                    [t('dashboard.thisMonth'), summary?.this_month],
                    [t('dashboard.avgProcessing'), summary?.avg_processing_hours != null ? `${summary.avg_processing_hours} h` : '—'],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {value ?? 0}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('reports.byDimension')} · {t(`reports.${filters.dimension}`)}
                </Typography>
                <BarList
                  items={dimension.map((item) => ({
                    label: ['status', 'type'].includes(filters.dimension) ? t(`${filters.dimension}.${item.label}`, item.label) : item.label,
                    count: item.count,
                  }))}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('reports.sla')}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('mail.priority')}</TableCell>
                      <TableCell align="right">{t('common.total')}</TableCell>
                      <TableCell align="right">{t('reports.overdue')}</TableCell>
                      <TableCell align="right">{t('reports.avgHours')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sla.map((row) => (
                      <TableRow key={row.priority}>
                        <TableCell>{t(`priority.${row.priority}`)}</TableCell>
                        <TableCell align="right">{row.total}</TableCell>
                        <TableCell align="right" sx={{ color: row.overdue ? 'error.main' : 'inherit', fontWeight: row.overdue ? 700 : 400 }}>
                          {row.overdue}
                        </TableCell>
                        <TableCell align="right">{row.avg_hours ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('reports.workload')}
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('users.fullName')}</TableCell>
                      <TableCell>{t('auth.matricule')}</TableCell>
                      <TableCell align="right">{t('common.total')}</TableCell>
                      <TableCell align="right">{t('dashboard.active')}</TableCell>
                      <TableCell align="right">{t('reports.overdue')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {workload.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell>{row.matricule}</TableCell>
                        <TableCell align="right">{row.total}</TableCell>
                        <TableCell align="right">{row.active}</TableCell>
                        <TableCell align="right" sx={{ color: row.overdue ? 'error.main' : 'inherit' }}>
                          {row.overdue}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
