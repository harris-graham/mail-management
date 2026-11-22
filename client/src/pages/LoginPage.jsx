import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useAuth } from '../auth/AuthContext';
import client, { apiError } from '../api/client';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ matricule: '', password: '', totp: '' });
  const [showTotp, setShowTotp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotState, setForgotState] = useState({ loading: false, message: '' });

  if (!loading && user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({
        matricule: form.matricule.trim(),
        password: form.password,
        ...(form.totp ? { totp: form.totp.trim() } : {}),
      });
      navigate(location.state?.from || '/', { replace: true });
    } catch (requestError) {
      setError(apiError(requestError, t('auth.invalid')));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReset = async () => {
    setForgotState({ loading: true, message: '' });
    try {
      await client.post('/auth/forgot-password', { email: forgotEmail });
      setForgotState({ loading: false, message: t('auth.resetSent') });
    } catch (requestError) {
      setForgotState({ loading: false, message: apiError(requestError) });
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f4f6f9' }}>
      <Box
        sx={{
          flex: 1,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          color: '#fff',
          background:
            'linear-gradient(160deg, #082a4d 0%, #0b3d6b 45%, #1f5d91 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.12)',
            right: -140,
            top: -80,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.12)',
            left: -90,
            bottom: 80,
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative' }}>
          <Box
            sx={{
              width: 46,
              height: 46,
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.14)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            C
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {t('app.name')}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t('app.tagline')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 520 }}>
          <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.15, mb: 2 }}>
            {i18n.language?.startsWith('fr')
              ? 'Le courrier administratif, maîtrisé de bout en bout.'
              : 'Administrative mail, mastered end to end.'}
          </Typography>
          <Typography sx={{ opacity: 0.82, mb: 4 }}>
            {i18n.language?.startsWith('fr')
              ? 'Enregistrement, visa, affectation, traitement, archivage et traçabilité dans une plateforme unique et sécurisée.'
              : 'Registration, visa, assignment, processing, archiving and traceability in one secure platform.'}
          </Typography>
          <Stack spacing={2.5}>
            {[
              {
                icon: <VerifiedUserOutlinedIcon />,
                fr: 'Sécurité renforcée : rôles, 2FA et journal d’audit',
                en: 'Hardened security: roles, 2FA and audit trail',
              },
              {
                icon: <LockOutlinedIcon />,
                fr: 'Circuit de validation et respect des échéances',
                en: 'Approval workflow and deadline tracking',
              },
              {
                icon: <InsightsOutlinedIcon />,
                fr: 'Statistiques, exports et recherche plein texte',
                en: 'Analytics, exports and full-text search',
              },
            ].map((item) => (
              <Box key={item.en} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ opacity: 0.9 }}>{item.icon}</Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {i18n.language?.startsWith('fr') ? item.fr : item.en}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.6, position: 'relative' }}>
          © {new Date().getFullYear()} — {t('app.name')}
        </Typography>
      </Box>

      <Box
        sx={{
          flex: { xs: 1, md: '0 0 46%' },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: { xs: 2, sm: 4 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              size="small"
              startIcon={<LanguageIcon />}
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('fr') ? 'en' : 'fr')}
            >
              {i18n.language?.startsWith('fr') ? 'English' : 'Français'}
            </Button>
          </Box>

          <Card>
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              <Typography variant="h5" gutterBottom>
                {t('auth.welcome')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('auth.subtitle')}
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={submit}>
                <Stack spacing={2.25}>
                  <TextField
                    label={t('auth.matricule')}
                    value={form.matricule}
                    onChange={update('matricule')}
                    required
                    fullWidth
                    autoFocus
                    autoComplete="username"
                  />
                  <TextField
                    label={t('auth.password')}
                    type="password"
                    value={form.password}
                    onChange={update('password')}
                    required
                    fullWidth
                    autoComplete="current-password"
                  />
                  {!showTotp ? (
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      underline="hover"
                      onClick={() => setShowTotp(true)}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      {t('auth.totp')}
                    </Link>
                  ) : (
                    <Collapse in={showTotp}>
                      <TextField
                        label={t('auth.totp')}
                        value={form.totp}
                        onChange={update('totp')}
                        fullWidth
                        inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                        helperText={t('auth.totpHint')}
                      />
                    </Collapse>
                  )}
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
                  >
                    {t('auth.signIn')}
                  </Button>
                </Stack>
              </Box>

              <Divider sx={{ my: 3 }} />
              <Box sx={{ textAlign: 'center' }}>
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  underline="hover"
                  onClick={() => setForgotOpen(true)}
                >
                  {t('auth.forgotPassword')}
                </Link>
              </Box>
            </CardContent>
          </Card>

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: 'center' }}>
            {i18n.language?.startsWith('fr')
              ? 'Accès réservé au personnel autorisé. Toute connexion est journalisée.'
              : 'Restricted to authorized staff. Every sign-in is logged.'}
          </Typography>
        </Box>
      </Box>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('auth.forgotPassword')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('auth.email')}
          </Typography>
          <TextField
            fullWidth
            type="email"
            value={forgotEmail}
            onChange={(event) => setForgotEmail(event.target.value)}
            label={t('auth.email')}
          />
          {forgotState.message && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {forgotState.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setForgotOpen(false)}>{t('common.close')}</Button>
          <Button variant="contained" onClick={sendReset} disabled={!forgotEmail || forgotState.loading}>
            {t('auth.sendReset')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
