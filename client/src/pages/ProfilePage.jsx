import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime } from '../utils/format';

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordState, setPasswordState] = useState({ loading: false, message: '', severity: 'info' });
  const [sessions, setSessions] = useState([]);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaState, setMfaState] = useState({ loading: false, message: '', severity: 'info' });

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await client.get('/auth/sessions');
      setSessions(data.data);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordState({ loading: false, message: t('auth.passwordMismatch'), severity: 'error' });
      return;
    }
    setPasswordState({ loading: true, message: '', severity: 'info' });
    try {
      await client.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswordState({ loading: false, message: t('auth.passwordChanged'), severity: 'success' });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setPasswordState({ loading: false, message: apiError(requestError), severity: 'error' });
    }
  };

  const startMfa = async () => {
    setMfaState({ loading: true, message: '', severity: 'info' });
    try {
      const { data } = await client.post('/auth/mfa/setup');
      setMfaSetup(data);
      setMfaState({ loading: false, message: '', severity: 'info' });
    } catch (requestError) {
      setMfaState({ loading: false, message: apiError(requestError), severity: 'error' });
    }
  };

  const enableMfa = async () => {
    setMfaState({ loading: true, message: '', severity: 'info' });
    try {
      const { data } = await client.post('/auth/mfa/enable', { token: mfaCode });
      setRecoveryCodes(data.recoveryCodes);
      setMfaSetup(null);
      setMfaCode('');
      await refreshUser();
      setMfaState({ loading: false, message: t('auth.mfaEnabled'), severity: 'success' });
    } catch (requestError) {
      setMfaState({ loading: false, message: apiError(requestError), severity: 'error' });
    }
  };

  const disableMfa = async () => {
    setMfaState({ loading: true, message: '', severity: 'info' });
    try {
      await client.post('/auth/mfa/disable', { password: mfaPassword });
      setMfaPassword('');
      await refreshUser();
      setMfaState({ loading: false, message: t('auth.mfaDisabled'), severity: 'success' });
    } catch (requestError) {
      setMfaState({ loading: false, message: apiError(requestError), severity: 'error' });
    }
  };

  const revokeSession = async (session) => {
    try {
      await client.delete(`/auth/sessions/${session.id}`);
      await loadSessions();
    } catch {
      // Ignore.
    }
  };

  return (
    <Box>
      <PageHeader title={t('common.profile')} subtitle={t('auth.mfaDescription')} />

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 72,
                  height: 72,
                  mx: 'auto',
                  mb: 2,
                  bgcolor: 'primary.main',
                  fontSize: 28,
                }}
              >
                {(user?.full_name || '?')[0]}
              </Avatar>
              <Typography variant="h6">{user?.full_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.matricule} · {user?.username}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
                <Chip size="small" label={t(`roles.${user?.role}`, user?.role)} color="primary" />
                <Chip
                  size="small"
                  label={user?.mfa_enabled ? '2FA' : '—'}
                  color={user?.mfa_enabled ? 'success' : 'default'}
                  variant={user?.mfa_enabled ? 'filled' : 'outlined'}
                />
              </Stack>
              <Divider sx={{ my: 2.5 }} />
              <Stack spacing={1} sx={{ textAlign: 'left' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('users.email')}
                  </Typography>
                  <Typography variant="body2">{user?.email || '—'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('common.language')}
                  </Typography>
                  <Typography variant="body2">{i18n.language?.startsWith('fr') ? 'Français' : 'English'}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('auth.changePassword')}
                </Typography>
                {passwordState.message && (
                  <Alert severity={passwordState.severity} sx={{ mb: 2 }}>
                    {passwordState.message}
                  </Alert>
                )}
                <Box component="form" onSubmit={changePassword}>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        size="small"
                        type="password"
                        label={t('auth.currentPassword')}
                        value={passwords.currentPassword}
                        onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))}
                        required
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        type="password"
                        label={t('auth.newPassword')}
                        value={passwords.newPassword}
                        onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}
                        required
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        size="small"
                        type="password"
                        label={t('auth.confirmPassword')}
                        value={passwords.confirmPassword}
                        onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))}
                        required
                      />
                    </Grid>
                  </Grid>
                  <Button
                    type="submit"
                    variant="contained"
                    sx={{ mt: 2 }}
                    disabled={passwordState.loading || !passwords.currentPassword || passwords.newPassword.length < 10}
                  >
                    {t('common.save')}
                  </Button>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <SecurityIcon color="primary" />
                  <Typography variant="h6">{t('auth.mfa')}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('auth.mfaDescription')}
                </Typography>
                {mfaState.message && (
                  <Alert severity={mfaState.severity} sx={{ mb: 2 }}>
                    {mfaState.message}
                  </Alert>
                )}

                {!user?.mfa_enabled && !mfaSetup && (
                  <Button variant="contained" onClick={startMfa} disabled={mfaState.loading}>
                    {t('auth.enableMfa')}
                  </Button>
                )}

                {mfaSetup && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {t('auth.scanQr')}
                    </Typography>
                    <img src={mfaSetup.qr} alt="TOTP" style={{ width: 200, height: 200 }} />
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                      {mfaSetup.secret}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        label={t('auth.totp')}
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value)}
                        inputProps={{ maxLength: 6, inputMode: 'numeric' }}
                      />
                      <Button variant="contained" onClick={enableMfa} disabled={mfaCode.length !== 6 || mfaState.loading}>
                        {t('common.confirm')}
                      </Button>
                      <Button onClick={() => setMfaSetup(null)}>{t('common.cancel')}</Button>
                    </Stack>
                  </Box>
                )}

                {recoveryCodes && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">{t('auth.recoveryCodes')}</Typography>
                    <Typography variant="caption">{t('auth.recoveryHint')}</Typography>
                    <Box sx={{ mt: 1, fontFamily: 'monospace', fontSize: 13 }}>
                      {recoveryCodes.map((code) => (
                        <div key={code}>{code}</div>
                      ))}
                    </Box>
                  </Alert>
                )}

                {user?.mfa_enabled && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      type="password"
                      label={t('auth.password')}
                      value={mfaPassword}
                      onChange={(event) => setMfaPassword(event.target.value)}
                    />
                    <Button color="error" variant="outlined" onClick={disableMfa} disabled={!mfaPassword || mfaState.loading}>
                      {t('auth.disableMfa')}
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('auth.sessions')}
                </Typography>
                {sessions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t('auth.noSessions')}
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('audit.date')}</TableCell>
                        <TableCell>User-Agent</TableCell>
                        <TableCell>{t('audit.ip')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{formatDateTime(session.created_at)}</TableCell>
                          <TableCell sx={{ maxWidth: 260 }}>
                            <Typography variant="caption" noWrap display="block">
                              {session.user_agent || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>{session.ip || '—'}</TableCell>
                          <TableCell align="right">
                            {!session.revoked_at && (
                              <IconButton size="small" color="error" onClick={() => revokeSession(session)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
