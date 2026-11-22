import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import BackupIcon from '@mui/icons-material/Backup';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import client, { apiError, downloadFile } from '../api/client';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateTime } from '../utils/format';

const EMPTY_ACCOUNT = {
  name: '',
  host: '',
  port: 993,
  secure: true,
  username: '',
  password: '',
  folder: 'INBOX',
  active: true,
};

export default function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [accountDialog, setAccountDialog] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [
        client.get('/admin/db/status'),
        client.get('/admin/settings'),
        client.get('/admin/email-accounts'),
        client.get('/admin/system'),
      ];
      const [statusResponse, settingsResponse, accountsResponse, systemResponse] =
        await Promise.all(requests);
      setStatus(statusResponse.data);
      setSettings(settingsResponse.data.data);
      setAccounts(accountsResponse.data.data);
      setSystem(systemResponse.data);
      setError('');
    } catch (requestError) {
      setError(apiError(requestError, t('errors.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const migrate = async () => {
    setBusy(true);
    try {
      const { data } = await client.post('/admin/db/migrate');
      setSnack(`${t('admin.migrated')} ${data.applied.join(', ') || ''}`);
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    try {
      await downloadFile(
        '/admin/db/backup',
        `mail-management-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
      setSnack(t('admin.backupStarted'));
    } catch (requestError) {
      setSnack(apiError(requestError));
    }
  };

  const importSqlite = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setBusy(true);
    try {
      await client.post('/admin/db/import-sqlite', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSnack(t('admin.imported'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const cleanup = async () => {
    setBusy(true);
    try {
      await client.post('/admin/maintenance/cleanup');
      setSnack(t('admin.cleanupDone'));
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const payload = settings.map((setting) => {
        let value = setting.value;
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep plain strings as strings.
          }
        }
        return { key: setting.key, value };
      });
      await client.put('/admin/settings', { settings: payload });
      setSnack(t('common.saved'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings((current) => current.map((setting) => (setting.key === key ? { ...setting, value } : setting)));
  };

  const saveAccount = async () => {
    setBusy(true);
    try {
      await client.post('/admin/email-accounts', accountForm);
      setAccountDialog(false);
      setAccountForm(EMPTY_ACCOUNT);
      setSnack(t('common.saved'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const syncAccount = async (account) => {
    setBusy(true);
    try {
      const { data } = await client.post(`/admin/email-accounts/${account.id}/sync`);
      setSnack(`${t('admin.sync')}: ${data.created}`);
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await client.delete(`/admin/email-accounts/${confirm.id}`);
      setConfirm(null);
      setSnack(t('common.deleted'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

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
        <Paper>
          <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ px: 2, borderBottom: '1px solid #e6ebf2' }}>
            <Tab label={t('admin.database')} />
            <Tab label={t('admin.settings')} />
            <Tab label={t('admin.emailAccounts')} />
            <Tab label={t('admin.system')} />
          </Tabs>

          {tab === 0 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={2.5}>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <StorageIcon color="primary" />
                        <Typography variant="h6">{t('admin.database')}</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {status?.database?.database}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: 'break-word' }}>
                        {status?.database?.version}
                      </Typography>
                      <Stack spacing={1} sx={{ mt: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">{t('admin.status')}</Typography>
                          <Chip size="small" color={status?.database?.ok ? 'success' : 'error'} label={status?.database?.ok ? 'OK' : 'KO'} />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">{t('admin.size')}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {status?.size}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">{t('admin.migrations')}</Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {status?.migrations?.applied?.length} / {status?.migrations?.pending?.length}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={8}>
                  <Stack spacing={2}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {t('admin.migrations')}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }} useFlexGap>
                          {(status?.migrations?.applied || []).map((migration) => (
                            <Chip key={migration.version} size="small" color="success" label={migration.version} />
                          ))}
                          {(status?.migrations?.pending || []).map((migration) => (
                            <Chip key={migration} size="small" color="warning" variant="outlined" label={migration} />
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                          <Button
                            variant="contained"
                            startIcon={<PlayArrowIcon />}
                            disabled={busy || !status?.migrations?.pending?.length}
                            onClick={() => setConfirm({ mode: 'migrate', title: t('admin.confirmMigrate'), message: t('admin.confirmMigrate') })}
                          >
                            {t('admin.migrate')}
                          </Button>
                          <Button variant="outlined" startIcon={<BackupIcon />} onClick={backup}>
                            {t('admin.backup')}
                          </Button>
                          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={busy}>
                            {t('admin.importSqlite')}
                            <input type="file" hidden accept=".db,.sqlite,.sqlite3" onChange={importSqlite} />
                          </Button>
                          <Button variant="outlined" color="warning" startIcon={<CleaningServicesIcon />} onClick={cleanup} disabled={busy}>
                            {t('admin.cleanup')}
                          </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                          {t('admin.importHint')}
                        </Typography>
                      </CardContent>
                    </Card>

                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {t('admin.tables')}
                        </Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>{t('admin.tables')}</TableCell>
                              <TableCell align="right">{t('common.total')}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(status?.tables || []).map((table) => (
                              <TableRow key={table.table}>
                                <TableCell>{table.table}</TableCell>
                                <TableCell align="right">{table.rows}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          )}

          {tab === 1 && (
            <Box sx={{ p: 3 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('admin.key')}</TableCell>
                      <TableCell>{t('admin.value')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {settings.map((setting) => (
                      <TableRow key={setting.key}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{setting.key}</TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            value={
                              typeof setting.value === 'string'
                                ? setting.value
                                : JSON.stringify(setting.value)
                            }
                            onChange={(event) => updateSetting(setting.key, event.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" onClick={saveSettings} disabled={busy}>
                  {t('common.save')}
                </Button>
              </Box>
            </Box>
          )}

          {tab === 2 && (
            <Box sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">{t('admin.emailAccounts')}</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAccountDialog(true)}>
                  {t('admin.addAccount')}
                </Button>
              </Stack>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('reference.name')}</TableCell>
                      <TableCell>{t('admin.host')}</TableCell>
                      <TableCell>{t('admin.username')}</TableCell>
                      <TableCell>{t('admin.lastSync')}</TableCell>
                      <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">{t('common.noData')}</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {accounts.map((account) => (
                      <TableRow key={account.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {account.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {account.folder}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {account.host}:{account.port}
                        </TableCell>
                        <TableCell>{account.username}</TableCell>
                        <TableCell>{account.last_sync_at ? formatDateTime(account.last_sync_at) : '—'}</TableCell>
                        <TableCell align="right">
                          <Tooltip title={t('admin.sync')}>
                            <IconButton size="small" onClick={() => syncAccount(account)} disabled={busy}>
                              <SyncIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('common.delete')}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() =>
                                setConfirm({
                                  mode: 'deleteAccount',
                                  title: t('common.delete'),
                                  message: `${t('common.delete')} « ${account.name} » ?`,
                                  id: account.id,
                                })
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {tab === 3 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={2}>
                {[
                  [t('admin.version'), system?.node],
                  [t('admin.environment'), system?.environment],
                  [t('admin.uptime'), `${system?.uptimeSeconds ?? 0} s`],
                  [t('admin.scheduler'), system?.scheduler ? t('common.yes') : t('common.no')],
                  [t('admin.status'), system?.platform],
                ].map(([label, value]) => (
                  <Grid item xs={12} sm={6} md={4} key={label}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">
                          {label}
                        </Typography>
                        <Typography variant="body1" fontWeight={700}>
                          {value || '—'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              <Card variant="outlined" sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {t('admin.maintenance')}
                  </Typography>
                  <Button variant="outlined" color="warning" startIcon={<CleaningServicesIcon />} onClick={cleanup} disabled={busy}>
                    {t('admin.cleanup')}
                  </Button>
                </CardContent>
              </Card>
            </Box>
          )}
        </Paper>
      )}

      <Dialog open={accountDialog} onClose={() => setAccountDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.addAccount')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label={t('reference.name')} value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} />
            </Grid>
            <Grid item xs={8} sm={6}>
              <TextField fullWidth size="small" label={t('admin.host')} value={accountForm.host} onChange={(event) => setAccountForm((current) => ({ ...current, host: event.target.value }))} />
            </Grid>
            <Grid item xs={4} sm={3}>
              <TextField fullWidth size="small" type="number" label={t('admin.port')} value={accountForm.port} onChange={(event) => setAccountForm((current) => ({ ...current, port: Number(event.target.value) }))} />
            </Grid>
            <Grid item xs={8} sm={3}>
              <FormControlLabel
                control={<Switch checked={accountForm.secure} onChange={(event) => setAccountForm((current) => ({ ...current, secure: event.target.checked }))} />}
                label={t('admin.secure')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label={t('admin.username')} value={accountForm.username} onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="password" label={t('admin.password')} value={accountForm.password} onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label={t('admin.folder')} value={accountForm.folder} onChange={(event) => setAccountForm((current) => ({ ...current, folder: event.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAccountDialog(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={saveAccount} disabled={busy || !accountForm.name || !accountForm.host || !accountForm.username || !accountForm.password}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        destructive={confirm?.mode === 'deleteAccount'}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.mode === 'migrate') {
            setConfirm(null);
            migrate();
          } else {
            deleteAccount();
          }
        }}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4500} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
