import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Avatar,
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
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EmailIcon from '@mui/icons-material/Email';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SendIcon from '@mui/icons-material/Send';
import client, { apiError, downloadFile } from '../api/client';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { PriorityChip, StatusChip } from '../components/StatusChip';
import { formatBytes, formatDate, formatDateTime, humanizeAction } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const TRANSITION_PERMISSIONS = {
  approve_visa: 'mail.visa',
  reject_visa: 'mail.reject',
  archive: 'mail.archive',
  restore: 'mail.restore',
  assign: 'mail.assign',
};

const STATUS_ACTIONS = {
  draft: ['analyze', 'cancel'],
  registered: ['analyze', 'submit_visa', 'assign', 'archive', 'cancel'],
  analyzed: ['submit_visa', 'assign', 'archive', 'cancel'],
  pending_visa: ['approve_visa', 'reject_visa', 'cancel'],
  visa_approved: ['assign', 'process', 'archive'],
  visa_rejected: ['reopen', 'archive'],
  assigned: ['start', 'process', 'archive'],
  in_progress: ['process', 'archive'],
  processed: ['reopen', 'archive'],
  archived: ['restore'],
  cancelled: ['reopen'],
};

function actionLabel(t, action) {
  const labels = {
    analyze: 'mail.analyze',
    submit_visa: 'mail.submitVisa',
    approve_visa: 'mail.approveVisa',
    reject_visa: 'mail.rejectVisa',
    assign: 'mail.assign',
    start: 'mail.start',
    process: 'mail.process',
    archive: 'mail.archive',
    restore: 'mail.restore',
    cancel: 'mail.cancel',
    reopen: 'mail.reopen',
  };
  return t(labels[action] || action);
}

function DetailRow({ label, value }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value || '—'}
      </Typography>
    </Grid>
  );
}

export default function MailDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionForm, setActionForm] = useState({ comment: '', assignedTo: '', decidedAt: '', projetVise: '', observation: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [qr, setQr] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get(`/mail/${id}`);
      setRecord(data.data);
      setError('');
    } catch (requestError) {
      setError(apiError(requestError, t('errors.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    client
      .get('/users/assignable')
      .then(({ data }) => setAssignees(data.data))
      .catch(() => {});
  }, []);

  const actions = useMemo(() => {
    if (!record) return [];
    return (STATUS_ACTIONS[record.status] || []).filter((action) => {
      const permission = TRANSITION_PERMISSIONS[action] || 'mail.update';
      return hasPermission(permission);
    });
  }, [record, hasPermission]);

  const openAction = (action) => {
    setActionForm({
      comment: '',
      assignedTo: record.assigned_to || '',
      decidedAt: new Date().toISOString().slice(0, 10),
      projetVise: record.projet_vise || record.subject || '',
      observation: record.observation || '',
    });
    setActionDialog(action);
  };

  const submitAction = async () => {
    setBusy(true);
    try {
      const payload = { action: actionDialog, comment: actionForm.comment || undefined };
      if (actionDialog === 'assign') payload.assignedTo = actionForm.assignedTo;
      if (actionDialog === 'approve_visa') {
        payload.decidedAt = actionForm.decidedAt;
        payload.projetVise = actionForm.projetVise;
        payload.observation = actionForm.observation || undefined;
      }
      if (actionDialog === 'reject_visa') {
        payload.observation = actionForm.observation;
        payload.decidedAt = actionForm.decidedAt;
      }
      await client.post(`/mail/${id}/transition`, payload);
      setActionDialog(null);
      setSnack(t('mail.updated'));
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    setEditForm({
      subject: record.subject || '',
      analysis: record.analysis || '',
      observation: record.observation || '',
      bordereau: record.bordereau || '',
      projetVise: record.projet_vise || '',
      priority: record.priority,
      confidentiality: record.confidentiality,
      dueAt: record.due_at ? new Date(record.due_at).toISOString().slice(0, 16) : '',
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    setBusy(true);
    try {
      const payload = {
        subject: editForm.subject || null,
        analysis: editForm.analysis || null,
        observation: editForm.observation || null,
        bordereau: editForm.bordereau || null,
        projetVise: editForm.projetVise || null,
        priority: editForm.priority,
        confidentiality: editForm.confidentiality,
      };
      if (editForm.dueAt) payload.dueAt = new Date(editForm.dueAt).toISOString();
      await client.patch(`/mail/${id}`, payload);
      setEditOpen(false);
      setSnack(t('mail.updated'));
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
      await client.delete(`/mail/${id}`);
      navigate('/mail');
    } catch (requestError) {
      setSnack(apiError(requestError));
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await client.post(`/mail/${id}/comments`, { body: comment.trim() });
      setComment('');
      await load();
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    setUploading(true);
    try {
      await client.post(`/mail/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
      setSnack(t('common.saved'));
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const removeAttachment = (attachment) => {
    setConfirm({
      title: t('common.delete'),
      message: `${t('common.delete')} « ${attachment.original_name} » ?`,
      destructive: true,
      action: async () => {
        setBusy(true);
        try {
          await client.delete(`/attachments/${attachment.id}`);
          await load();
          setConfirm(null);
        } catch (requestError) {
          setSnack(apiError(requestError));
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const openQr = async () => {
    try {
      const { data } = await client.get(`/mail/${id}/qr`);
      setQr(data);
    } catch (requestError) {
      setSnack(apiError(requestError));
    }
  };

  const sendEmail = async () => {
    setBusy(true);
    try {
      await client.post(`/mail/${id}/send-email`, { to: emailTo });
      setEmailOpen(false);
      setEmailTo('');
      setSnack(t('common.success'));
    } catch (requestError) {
      setSnack(apiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const toggleWatch = async () => {
    try {
      if (watching) await client.delete(`/mail/${id}/watch`);
      else await client.post(`/mail/${id}/watch`);
      setWatching(!watching);
    } catch (requestError) {
      setSnack(apiError(requestError));
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !record) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || t('errors.notFound')}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/mail')}>
          {t('common.back')}
        </Button>
      </Box>
    );
  }

  const isSecret = record.confidentiality === 'secret';
  const canEdit = hasPermission('mail.update') && !['archived', 'cancelled'].includes(record.status);
  const canDelete = hasPermission('mail.delete');

  return (
    <Box>
      <PageHeader
        title={record.reference}
        subtitle={record.subject || record.analysis || t('mail.title')}
        actions={
          <>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
              {t('common.back')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={() =>
                downloadFile(`/mail/${id}/pdf`, `${record.reference.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`)
              }
            >
              {t('mail.pdf')}
            </Button>
            <Button variant="outlined" startIcon={<QrCode2Icon />} onClick={openQr}>
              {t('mail.qrCode')}
            </Button>
            <Button variant="outlined" startIcon={<EmailIcon />} onClick={() => setEmailOpen(true)}>
              {t('mail.sendEmail')}
            </Button>
            <Button
              variant="outlined"
              startIcon={watching ? <VisibilityOffIcon /> : <VisibilityIcon />}
              onClick={toggleWatch}
            >
              {watching ? t('mail.unwatch') : t('mail.watch')}
            </Button>
            {canEdit && (
              <Button variant="outlined" startIcon={<EditIcon />} onClick={openEdit}>
                {t('common.edit')}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() =>
                  setConfirm({
                    title: t('mail.deleteConfirm'),
                    message: t('mail.deleteConfirm'),
                    destructive: true,
                    action: remove,
                  })
                }
              >
                {t('common.delete')}
              </Button>
            )}
          </>
        }
      />

      {isSecret && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('mail.secretWarning')}
        </Alert>
      )}

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
                <StatusChip status={record.status} />
                <PriorityChip priority={record.priority} />
                <Chip size="small" variant="outlined" label={t(`type.${record.type}`)} />
                <Chip size="small" variant="outlined" label={t(`confidentiality.${record.confidentiality}`)} />
              </Stack>
              <Grid container spacing={2}>
                <DetailRow label={t('mail.nature')} value={record.nature_name} />
                <DetailRow label={t('mail.ministry')} value={record.ministry_name} />
                <DetailRow label={t('mail.service')} value={record.service_name} />
                <DetailRow label={t('mail.department')} value={record.department_name} />
                <DetailRow label={t('mail.assignedTo')} value={record.assigned_to_name} />
                <DetailRow label={t('mail.createdBy')} value={record.created_by_name} />
                <DetailRow label={t('mail.receivedAt')} value={formatDate(record.received_at)} />
                <DetailRow label={t('mail.depositedAt')} value={formatDate(record.deposited_at)} />
                <DetailRow label={t('mail.decidedAt')} value={formatDate(record.decided_at)} />
                <DetailRow label={t('mail.dueAt')} value={formatDateTime(record.due_at)} />
                <DetailRow label={t('mail.createdAt')} value={formatDateTime(record.created_at)} />
                <DetailRow label={t('mail.updatedAt')} value={formatDateTime(record.updated_at)} />
              </Grid>
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="subtitle2" gutterBottom>
                {t('mail.analysis')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                {record.analysis || record.subject || '—'}
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                {t('mail.observation')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                {record.observation || '—'}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('mail.bordereau')}
                  </Typography>
                  <Typography variant="body2">{record.bordereau || '—'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('mail.projetVise')}
                  </Typography>
                  <Typography variant="body2">{record.projet_vise || '—'}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">{t('mail.comments')}</Typography>
                <Chip size="small" label={record.comments?.length || 0} />
              </Box>
              {record.comments?.length ? (
                <List disablePadding>
                  {record.comments.map((item) => (
                    <ListItem key={item.id} alignItems="flex-start" disableGutters>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.light' }}>
                          {(item.author_name || '?')[0]}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Typography variant="subtitle2">{item.author_name || '—'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDateTime(item.created_at)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                            {item.body}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  {t('mail.noComments')}
                </Typography>
              )}
              {hasPermission('comment.create') && (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    placeholder={t('mail.commentPlaceholder')}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <Box sx={{ mt: 1, textAlign: 'right' }}>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<SendIcon />}
                      onClick={addComment}
                      disabled={!comment.trim() || busy}
                    >
                      {t('mail.addComment')}
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t('mail.history')}
              </Typography>
              <Stack spacing={2} sx={{ mt: 1 }}>
                {(record.events || []).map((event) => (
                  <Box key={event.id} sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ pt: 0.5 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main' }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {t(`mail.events.${event.event_type}`, humanizeAction(event.event_type))}
                        {event.from_status && event.to_status && event.from_status !== event.to_status
                          ? ` · ${t(`status.${event.from_status}`, event.from_status)} → ${t(
                              `status.${event.to_status}`,
                              event.to_status
                            )}`
                          : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(event.created_at)} · {event.actor_name || 'Système'}
                        {event.comment ? ` · ${event.comment}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          {actions.length > 0 && (
            <Card sx={{ mb: 2.5 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t('mail.actions')}
                </Typography>
                <Stack spacing={1}>
                  {actions.map((action) => (
                    <Button
                      key={action}
                      variant={['approve_visa', 'archive', 'process'].includes(action) ? 'contained' : 'outlined'}
                      color={
                        action === 'reject_visa' || action === 'cancel'
                          ? 'error'
                          : action === 'archive'
                          ? 'secondary'
                          : 'primary'
                      }
                      onClick={() => openAction(action)}
                    >
                      {actionLabel(t, action)}
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">{t('mail.attachments')}</Typography>
                {hasPermission('attachment.create') && (
                  <Button component="label" size="small" startIcon={<CloudUploadIcon />} disabled={uploading}>
                    {t('mail.uploadFiles')}
                    <input type="file" hidden multiple onChange={uploadFiles} />
                  </Button>
                )}
              </Box>
              {record.attachments?.length ? (
                <List disablePadding>
                  {record.attachments.map((attachment) => (
                    <ListItem
                      key={attachment.id}
                      disableGutters
                      secondaryAction={
                        <Stack direction="row">
                          <Tooltip title={t('common.download')}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                downloadFile(
                                  `/attachments/${attachment.id}/download`,
                                  attachment.original_name
                                )
                              }
                            >
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {hasPermission('attachment.delete') && (
                            <Tooltip title={t('common.delete')}>
                              <IconButton size="small" color="error" onClick={() => removeAttachment(attachment)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      }
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'grey.100', color: 'text.secondary' }}>
                          <AttachFileIcon fontSize="small" />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={attachment.original_name}
                        secondary={`${formatBytes(attachment.size_bytes)} · ${formatDate(attachment.created_at)}`}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  {t('mail.noAttachments')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={Boolean(actionDialog)} onClose={() => setActionDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{actionLabel(t, actionDialog)}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {actionDialog === 'assign' && (
              <FormControl fullWidth size="small">
                <InputLabel>{t('mail.assignTo')}</InputLabel>
                <Select
                  label={t('mail.assignTo')}
                  value={actionForm.assignedTo}
                  onChange={(event) => setActionForm((current) => ({ ...current, assignedTo: event.target.value }))}
                >
                  {assignees.map((assignee) => (
                    <MenuItem key={assignee.id} value={assignee.id}>
                      {assignee.full_name} · {assignee.matricule}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {actionDialog === 'approve_visa' && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label={t('mail.decidedAt')}
                  value={actionForm.decidedAt}
                  onChange={(event) => setActionForm((current) => ({ ...current, decidedAt: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label={t('mail.projetVise')}
                  value={actionForm.projetVise}
                  onChange={(event) => setActionForm((current) => ({ ...current, projetVise: event.target.value }))}
                />
                <TextField
                  fullWidth
                  size="small"
                  label={t('mail.observation')}
                  value={actionForm.observation}
                  onChange={(event) => setActionForm((current) => ({ ...current, observation: event.target.value }))}
                />
              </>
            )}
            {actionDialog === 'reject_visa' && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label={t('mail.decidedAt')}
                  value={actionForm.decidedAt}
                  onChange={(event) => setActionForm((current) => ({ ...current, decidedAt: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  required
                  size="small"
                  multiline
                  minRows={2}
                  label={t('mail.observation')}
                  value={actionForm.observation}
                  onChange={(event) => setActionForm((current) => ({ ...current, observation: event.target.value }))}
                />
              </>
            )}
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              label={t('mail.comment')}
              value={actionForm.comment}
              onChange={(event) => setActionForm((current) => ({ ...current, comment: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setActionDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={submitAction}
            disabled={
              busy ||
              (actionDialog === 'assign' && !actionForm.assignedTo) ||
              (actionDialog === 'reject_visa' && !actionForm.observation)
            }
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('mail.edit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              label={t('mail.subject')}
              value={editForm.subject}
              onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))}
            />
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={3}
              label={t('mail.analysis')}
              value={editForm.analysis}
              onChange={(event) => setEditForm((current) => ({ ...current, analysis: event.target.value }))}
            />
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              label={t('mail.observation')}
              value={editForm.observation}
              onChange={(event) => setEditForm((current) => ({ ...current, observation: event.target.value }))}
            />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('mail.bordereau')}
                  value={editForm.bordereau}
                  onChange={(event) => setEditForm((current) => ({ ...current, bordereau: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('mail.projetVise')}
                  value={editForm.projetVise}
                  onChange={(event) => setEditForm((current) => ({ ...current, projetVise: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('mail.priority')}</InputLabel>
                  <Select
                    label={t('mail.priority')}
                    value={editForm.priority}
                    onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value }))}
                  >
                    {['low', 'normal', 'high', 'urgent'].map((priority) => (
                      <MenuItem key={priority} value={priority}>
                        {t(`priority.${priority}`)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('mail.confidentiality')}</InputLabel>
                  <Select
                    label={t('mail.confidentiality')}
                    value={editForm.confidentiality}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, confidentiality: event.target.value }))
                    }
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
                  size="small"
                  type="datetime-local"
                  label={t('mail.dueAt')}
                  value={editForm.dueAt}
                  onChange={(event) => setEditForm((current) => ({ ...current, dueAt: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={submitEdit} disabled={busy}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(qr)} onClose={() => setQr(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('mail.qrCode')}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {qr && (
            <>
              <img src={qr.dataUrl} alt={qr.reference} style={{ width: '100%', maxWidth: 280 }} />
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                {qr.reference}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setQr(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('mail.sendEmail')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            type="email"
            label={t('auth.email')}
            value={emailTo}
            onChange={(event) => setEmailTo(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEmailOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={sendEmail} disabled={!emailTo || busy}>
            {t('mail.sendEmail')}
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

      <Snackbar open={Boolean(snack)} autoHideDuration={4500} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
