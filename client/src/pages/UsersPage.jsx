import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Switch,
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
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import DeleteIcon from '@mui/icons-material/Delete';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateTime } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const ROLES = ['admin', 'supervisor', 'agent', 'consultation', 'archivist'];

const EMPTY_FORM = {
  matricule: '',
  username: '',
  fullName: '',
  email: '',
  password: '',
  role: 'agent',
  departmentId: '',
  ministryId: '',
  isActive: true,
};

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [reference, setReference] = useState({ departments: [], ministries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResponse, referenceResponse] = await Promise.all([
        client.get('/users'),
        client.get('/reference-data'),
      ]);
      setUsers(usersResponse.data.data);
      setReference({
        departments: referenceResponse.data.departments,
        ministries: referenceResponse.data.ministries,
      });
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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialog({ mode: 'create' });
  };

  const openEdit = (user) => {
    setForm({
      matricule: user.matricule,
      username: user.username,
      fullName: user.full_name,
      email: user.email || '',
      password: '',
      role: user.role,
      departmentId: user.department_id || '',
      ministryId: user.ministry_id || '',
      isActive: user.is_active,
    });
    setDialog({ mode: 'edit', user });
  };

  const update = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        matricule: form.matricule.trim(),
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        email: form.email || null,
        role: form.role,
        departmentId: form.departmentId || null,
        ministryId: form.ministryId || null,
        isActive: form.isActive,
      };
      if (form.password) payload.password = form.password;
      if (dialog.mode === 'create') {
        await client.post('/users', payload);
        setSnack(t('users.created'));
      } else {
        await client.patch(`/users/${dialog.user.id}`, payload);
        setSnack(t('users.updated'));
      }
      setDialog(null);
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError, t('errors.validation')));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    setBusy(true);
    try {
      await client.delete(`/users/${confirm.user.id}`);
      setConfirm(null);
      setSnack(t('common.deleted'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await client.post(`/users/${resetTarget.id}/reset-password`, { temporaryPassword });
      setResetTarget(null);
      setTemporaryPassword('');
      setSnack(t('users.passwordReset'));
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            {t('users.new')}
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('users.fullName')}</TableCell>
                <TableCell>{t('users.username')}</TableCell>
                <TableCell>{t('users.role')}</TableCell>
                <TableCell>{t('users.department')}</TableCell>
                <TableCell>{t('users.email')}</TableCell>
                <TableCell>{t('users.active')}</TableCell>
                <TableCell>{t('users.lastLogin')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {user.full_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.matricule}
                      </Typography>
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <Chip size="small" label={t(`roles.${user.role}`, user.role)} />
                    </TableCell>
                    <TableCell>{user.department_name || '—'}</TableCell>
                    <TableCell>{user.email || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant={user.is_active ? 'filled' : 'outlined'}
                        color={user.is_active ? 'success' : 'default'}
                        label={user.is_active ? t('common.yes') : t('common.no')}
                      />
                    </TableCell>
                    <TableCell>
                      {user.last_login_at ? formatDateTime(user.last_login_at) : t('users.never')}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small" onClick={() => openEdit(user)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('users.resetPassword')}>
                        <IconButton size="small" onClick={() => setResetTarget(user)}>
                          <KeyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {user.id !== currentUser?.id && (
                        <Tooltip title={t('common.delete')}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                              setConfirm({
                                title: t('users.deleteConfirm'),
                                message: `${t('users.deleteConfirm')} (${user.full_name})`,
                                destructive: true,
                                user,
                              })
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog?.mode === 'create' ? t('users.new') : t('users.title')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" required label={t('users.fullName')} value={form.fullName} onChange={update('fullName')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" required label={t('auth.matricule')} value={form.matricule} onChange={update('matricule')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" required label={t('users.username')} value={form.username} onChange={update('username')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="email" label={t('users.email')} value={form.email} onChange={update('email')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('users.role')}</InputLabel>
                <Select label={t('users.role')} value={form.role} onChange={update('role')}>
                  {ROLES.map((role) => (
                    <MenuItem key={role} value={role}>
                      {t(`roles.${role}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="password"
                label={t('auth.password')}
                value={form.password}
                onChange={update('password')}
                required={dialog?.mode === 'create'}
                helperText={t('users.passwordHint')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('users.department')}</InputLabel>
                <Select label={t('users.department')} value={form.departmentId} onChange={update('departmentId')}>
                  <MenuItem value="">{t('common.none')}</MenuItem>
                  {reference.departments.map((department) => (
                    <MenuItem key={department.id} value={department.id}>
                      {department.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('users.ministry')}</InputLabel>
                <Select label={t('users.ministry')} value={form.ministryId} onChange={update('ministryId')}>
                  <MenuItem value="">{t('common.none')}</MenuItem>
                  {reference.ministries.map((ministry) => (
                    <MenuItem key={ministry.id} value={ministry.id}>
                      {ministry.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={form.isActive} onChange={update('isActive')} />}
                label={t('users.active')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={busy || !form.fullName || !form.matricule || !form.username || (dialog?.mode === 'create' && !form.password)}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(resetTarget)} onClose={() => setResetTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('users.resetPassword')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {resetTarget?.full_name}
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="password"
            label={t('users.temporaryPassword')}
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            helperText={t('users.passwordHint')}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={resetPassword} disabled={temporaryPassword.length < 10 || busy}>
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        destructive
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={removeUser}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
