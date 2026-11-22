import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';
import BarList from '../components/BarList';
import { StatusChip } from '../components/StatusChip';
import { formatDate } from '../utils/format';

function KpiCard({ icon, label, value, color = 'primary.main', hint }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: 'rgba(11, 61, 107, 0.08)',
            color,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {value ?? '—'}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: '' });
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [natures, setNatures] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [summaryResponse, seriesResponse, statusResponse, natureResponse, workloadResponse, recentResponse] =
          await Promise.all([
            client.get('/analytics/summary'),
            client.get('/analytics/timeseries', { params: { interval: 'month' } }),
            client.get('/analytics/by-dimension', { params: { dimension: 'status' } }),
            client.get('/analytics/by-dimension', { params: { dimension: 'nature' } }),
            client.get('/analytics/workload'),
            client.get('/mail', { params: { pageSize: 8, sort: 'created_at', direction: 'desc' } }),
          ]);
        if (!active) return;
        setSummary(summaryResponse.data.data);
        setSeries(seriesResponse.data.data);
        setStatuses(statusResponse.data.data);
        setNatures(natureResponse.data.data);
        setWorkload(workloadResponse.data.data);
        setRecent(recentResponse.data.data);
        setState({ loading: false, error: '' });
      } catch (error) {
        if (active) setState({ loading: false, error: apiError(error, t('errors.loadFailed')) });
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  if (state.loading) {
    return (
      <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const monthBuckets = (() => {
    const map = new Map();
    for (const row of series) {
      const key = String(row.bucket).slice(0, 7);
      map.set(key, (map.get(key) || 0) + Number(row.count));
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([label, count]) => ({ label, count }));
  })();
  const maxMonth = Math.max(...monthBuckets.map((item) => item.count), 1);

  return (
    <Box>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      {state.error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {state.error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard icon={<MailOutlineIcon />} label={t('dashboard.total')} value={summary?.total} hint={`${summary?.today ?? 0} ${t('dashboard.today').toLowerCase()}`} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard icon={<PendingActionsIcon />} label={t('dashboard.pendingVisa')} value={summary?.pending_visa} color="warning.main" hint={`${summary?.registered ?? 0} ${t('dashboard.registered').toLowerCase()}`} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard icon={<WarningAmberIcon />} label={t('dashboard.overdue')} value={summary?.overdue} color="error.main" hint={t('dashboard.sla')} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <KpiCard
            icon={<ScheduleIcon />}
            label={t('dashboard.avgProcessing')}
            value={summary?.avg_processing_hours != null ? `${summary.avg_processing_hours} h` : '—'}
            color="success.main"
            hint={`${summary?.processed ?? 0} ${t('dashboard.processed').toLowerCase()}`}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">{t('dashboard.volume')}</Typography>
                <Chip size="small" label={`${summary?.this_year ?? 0} / ${t('reports.year').toLowerCase()}`} />
              </Box>
              {monthBuckets.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('common.noData')}
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 220, px: 1 }}>
                  {monthBuckets.map((item) => (
                    <Box key={item.label} sx={{ flex: 1, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        {item.count}
                      </Typography>
                      <Box
                        sx={{
                          height: Math.max((item.count / maxMonth) * 160, 4),
                          bgcolor: 'primary.main',
                          borderRadius: '6px 6px 0 0',
                          opacity: 0.85,
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        {item.label.slice(2)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('dashboard.byStatus')}
              </Typography>
              <BarList items={statuses.map((item) => ({ label: t(`status.${item.label}`, item.label), count: item.count }))} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('dashboard.byNature')}
              </Typography>
              <BarList items={natures} color="secondary" />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('dashboard.workload')}
              </Typography>
              <BarList
                items={workload.slice(0, 8).map((item) => ({
                  label: item.full_name,
                  count: item.active,
                }))}
                color="info"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('dashboard.sla')}
              </Typography>
              <Stack spacing={2}>
                {[
                  { label: t('dashboard.registered'), value: summary?.registered, color: 'info' },
                  { label: t('dashboard.processed'), value: summary?.processed, color: 'success' },
                  { label: t('dashboard.archived'), value: summary?.archived, color: 'default' },
                  { label: t('dashboard.overdue'), value: summary?.overdue, color: 'error' },
                ].map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Chip size="small" label={item.value ?? 0} color={item.color} variant={item.color === 'default' ? 'outlined' : 'filled'} />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">{t('dashboard.recent')}</Typography>
                <IconButton component={RouterLink} to="/mail" size="small">
                  <ArrowForwardIcon fontSize="small" />
                </IconButton>
              </Box>
              {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                  {t('dashboard.noRecent')}
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('mail.reference')}</TableCell>
                      <TableCell>{t('mail.subject')}</TableCell>
                      <TableCell>{t('mail.status')}</TableCell>
                      <TableCell>{t('mail.receivedAt')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recent.map((record) => (
                      <TableRow
                        key={record.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/mail/${record.id}`)}
                      >
                        <TableCell sx={{ fontWeight: 700 }}>{record.reference}</TableCell>
                        <TableCell sx={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {record.subject || record.analysis || '—'}
                        </TableCell>
                        <TableCell>
                          <StatusChip status={record.status} />
                        </TableCell>
                        <TableCell>{formatDate(record.received_at || record.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
