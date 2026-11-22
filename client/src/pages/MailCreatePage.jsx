import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import client, { apiError } from '../api/client';
import PageHeader from '../components/PageHeader';

const today = new Date().toISOString().slice(0, 10);

const INITIAL = {
  type: 'correspondance',
  priority: 'normal',
  confidentiality: 'internal',
  subject: '',
  analysis: '',
  observation: '',
  bordereau: '',
  projetVise: '',
  receivedAt: today,
  depositedAt: today,
  natureId: '',
  ministryId: '',
  serviceId: '',
  departmentId: '',
  assignedTo: '',
  comment: '',
};

export default function MailCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [reference, setReference] = useState({ natures: [], ministries: [], services: [], departments: [] });
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      client.get('/reference-data'),
      client.get('/users/assignable').catch(() => ({ data: { data: [] } })),
    ])
      .then(([referenceResponse, usersResponse]) => {
        if (!active) return;
        setReference(referenceResponse.data);
        setAssignees(usersResponse.data.data);
      })
      .catch((requestError) => active && setError(apiError(requestError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      for (const key of ['natureId', 'ministryId', 'serviceId', 'departmentId', 'assignedTo']) {
        if (!payload[key]) delete payload[key];
      }
      const { data } = await client.post('/mail', payload);
      navigate(`/mail/${data.data.id}`);
    } catch (requestError) {
      setError(apiError(requestError, t('errors.validation')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={t('mail.new')}
        subtitle={t('app.tagline')}
        actions={
          <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={submit}>
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('common.details')}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.type')}</InputLabel>
                      <Select label={t('mail.type')} value={form.type} onChange={update('type')}>
                        {['correspondance', 'consultation', 'def'].map((type) => (
                          <MenuItem key={type} value={type}>
                            {t(`type.${type}`)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.priority')}</InputLabel>
                      <Select label={t('mail.priority')} value={form.priority} onChange={update('priority')}>
                        {['low', 'normal', 'high', 'urgent'].map((priority) => (
                          <MenuItem key={priority} value={priority}>
                            {t(`priority.${priority}`)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.confidentiality')}</InputLabel>
                      <Select
                        label={t('mail.confidentiality')}
                        value={form.confidentiality}
                        onChange={update('confidentiality')}
                      >
                        {['public', 'internal', 'confidential', 'secret'].map((level) => (
                          <MenuItem key={level} value={level}>
                            {t(`confidentiality.${level}`)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      required
                      label={t('mail.subject')}
                      value={form.subject}
                      onChange={update('subject')}
                      placeholder={t('mail.subjectPlaceholder')}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      label={t('mail.analysis')}
                      value={form.analysis}
                      onChange={update('analysis')}
                      placeholder={t('mail.analysisPlaceholder')}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      label={t('mail.observation')}
                      value={form.observation}
                      onChange={update('observation')}
                      placeholder={t('mail.observationPlaceholder')}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={t('mail.bordereau')}
                      value={form.bordereau}
                      onChange={update('bordereau')}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={t('mail.projetVise')}
                      value={form.projetVise}
                      onChange={update('projetVise')}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={2.5}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('common.filters')}
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.nature')}</InputLabel>
                      <Select label={t('mail.nature')} value={form.natureId} onChange={update('natureId')}>
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {reference.natures.map((nature) => (
                          <MenuItem key={nature.id} value={nature.id}>
                            {nature.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.ministry')}</InputLabel>
                      <Select
                        label={t('mail.ministry')}
                        value={form.ministryId}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            ministryId: event.target.value,
                            serviceId: '',
                          }));
                        }}
                      >
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {reference.ministries.map((ministry) => (
                          <MenuItem key={ministry.id} value={ministry.id}>
                            {ministry.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small" disabled={!form.ministryId}>
                      <InputLabel>{t('mail.service')}</InputLabel>
                      <Select label={t('mail.service')} value={form.serviceId} onChange={update('serviceId')}>
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {reference.services
                          .filter((service) => service.ministry_id === form.ministryId)
                          .map((service) => (
                            <MenuItem key={service.id} value={service.id}>
                              {service.name}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.department')}</InputLabel>
                      <Select
                        label={t('mail.department')}
                        value={form.departmentId}
                        onChange={update('departmentId')}
                      >
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {reference.departments.map((department) => (
                          <MenuItem key={department.id} value={department.id}>
                            {department.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('mail.assignTo')}</InputLabel>
                      <Select label={t('mail.assignTo')} value={form.assignedTo} onChange={update('assignedTo')}>
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {assignees.map((user) => (
                          <MenuItem key={user.id} value={user.id}>
                            {user.full_name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('mail.receivedAt')}
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label={t('mail.receivedAt')}
                      value={form.receivedAt}
                      onChange={update('receivedAt')}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label={t('mail.depositedAt')}
                      value={form.depositedAt}
                      onChange={update('depositedAt')}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Stack>
                </CardContent>
              </Card>

              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                disabled={saving || !form.subject}
              >
                {t('common.save')}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
