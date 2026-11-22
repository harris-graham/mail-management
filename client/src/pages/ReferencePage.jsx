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
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

const TABS = ['natures', 'ministries', 'services', 'departments'];

const ADD_LABELS = {
  natures: 'reference.addNature',
  ministries: 'reference.addMinistry',
  services: 'reference.addService',
  departments: 'reference.addDepartment',
};

export default function ReferencePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [data, setData] = useState({ natures: [], ministries: [], services: [], departments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [natures, ministries, services, departments] = await Promise.all([
        client.get('/natures'),
        client.get('/ministries'),
        client.get('/services'),
        client.get('/departments'),
      ]);
      setData({
        natures: natures.data.data,
        ministries: ministries.data.data,
        services: services.data.data,
        departments: departments.data.data,
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

  const kind = TABS[tab];

  const openCreate = () => {
    const initial =
      kind === 'natures'
        ? { code: '', name: '', description: '', active: true }
        : kind === 'ministries'
        ? { code: '', name: '' }
        : kind === 'services'
        ? { ministryId: data.ministries[0]?.id || '', code: '', name: '' }
        : { code: '', name: '', parentId: '' };
    setForm(initial);
    setDialog({ mode: 'create' });
  };

  const openEdit = (item) => {
    if (kind === 'natures') {
      setForm({ code: item.code, name: item.name, description: item.description || '', active: item.active });
    } else if (kind === 'ministries') {
      setForm({ code: item.code, name: item.name });
    } else if (kind === 'services') {
      setForm({ ministryId: item.ministry_id, code: item.code, name: item.name });
    } else {
      setForm({ code: item.code, name: item.name, parentId: item.parent_id || '' });
    }
    setDialog({ mode: 'edit', item });
  };

  const update = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const save = async () => {
    setBusy(true);
    try {
      if (dialog.mode === 'create') {
        if (kind === 'natures') {
          await client.post('/natures', form);
        } else if (kind === 'ministries') {
          await client.post('/ministries', form);
        } else if (kind === 'services') {
          await client.post('/services', form);
        } else {
          await client.post('/departments', form);
        }
      } else if (kind === 'natures') {
        await client.patch(`/natures/${dialog.item.id}`, form);
      } else if (kind === 'ministries') {
        await client.patch(`/ministries/${dialog.item.id}`, form);
      } else if (kind === 'departments') {
        await client.patch(`/departments/${dialog.item.id}`, form);
      } else {
        await client.patch(`/services/${dialog.item.id}`, form);
      }
      setDialog(null);
      setSnack(t('common.saved'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await client.delete(`/${kind}/${confirm.id}`);
      setConfirm(null);
      setSnack(t('common.deleted'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const rows = data[kind] || [];

  const columns = {
    natures: [
      { key: 'code', label: t('reference.code') },
      { key: 'name', label: t('reference.name') },
      { key: 'description', label: t('reference.description') },
      { key: 'usage_count', label: t('reference.usage') },
      { key: 'active', label: t('reference.active') },
    ],
    ministries: [
      { key: 'code', label: t('reference.code') },
      { key: 'name', label: t('reference.name') },
    ],
    services: [
      { key: 'code', label: t('reference.code') },
      { key: 'name', label: t('reference.name') },
      { key: 'ministry_name', label: t('reference.ministry') },
    ],
    departments: [
      { key: 'code', label: t('reference.code') },
      { key: 'name', label: t('reference.name') },
      { key: 'parent_name', label: t('reference.parent') },
      { key: 'user_count', label: t('users.title') },
    ],
  }[kind];

  return (
    <Box>
      <PageHeader
        title={t('reference.title')}
        subtitle={t('reference.subtitle')}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            {t(ADD_LABELS[kind])}
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ px: 2, borderBottom: '1px solid #e6ebf2' }}>
          {TABS.map((key) => (
            <Tab key={key} label={t(`reference.${key}`)} />
          ))}
        </Tabs>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column.key}>{column.label}</TableCell>
                ))}
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">{t('common.noData')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.key === 'active' ? (
                        <Chip
                          size="small"
                          label={item.active ? t('common.yes') : t('common.no')}
                          color={item.active ? 'success' : 'default'}
                          variant={item.active ? 'filled' : 'outlined'}
                        />
                      ) : column.key === 'usage_count' || column.key === 'user_count' ? (
                        <Chip size="small" label={item[column.key] ?? 0} />
                      ) : (
                        item[column.key] || '—'
                      )}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    <Tooltip title={t('common.edit')}>
                      <IconButton size="small" onClick={() => openEdit(item)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common.delete')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          setConfirm({
                            title: t('reference.deleteConfirm'),
                            message: `${t('reference.deleteConfirm')} (${item.name})`,
                            id: item.id,
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
      </Paper>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog?.mode === 'create' ? t(ADD_LABELS[kind]) : t('common.edit')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" required label={t('reference.code')} value={form.code || ''} onChange={update('code')} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" required label={t('reference.name')} value={form.name || ''} onChange={update('name')} />
            </Grid>
            {kind === 'natures' && (
              <>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label={t('reference.description')} value={form.description || ''} onChange={update('description')} />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={Boolean(form.active)} onChange={update('active')} />}
                    label={t('reference.active')}
                  />
                </Grid>
              </>
            )}
            {kind === 'services' && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('reference.ministry')}</InputLabel>
                  <Select label={t('reference.ministry')} value={form.ministryId || ''} onChange={update('ministryId')}>
                    {data.ministries.map((ministry) => (
                      <MenuItem key={ministry.id} value={ministry.id}>
                        {ministry.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            {kind === 'departments' && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('reference.parent')}</InputLabel>
                  <Select label={t('reference.parent')} value={form.parentId || ''} onChange={update('parentId')}>
                    <MenuItem value="">{t('common.none')}</MenuItem>
                    {data.departments
                      .filter((department) => department.id !== dialog?.item?.id)
                      .map((department) => (
                        <MenuItem key={department.id} value={department.id}>
                          {department.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={save} disabled={busy || !form.code || !form.name}>
            {t('common.save')}
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
        onConfirm={remove}
      />

      <Snackbar open={Boolean(snack)} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
