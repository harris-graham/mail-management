import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Alert,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ArchiveIcon from '@mui/icons-material/Archive';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleIcon from '@mui/icons-material/People';
import CategoryIcon from '@mui/icons-material/Category';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import LanguageIcon from '@mui/icons-material/Language';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useAuth } from '../auth/AuthContext';

const DRAWER_WIDTH = 264;

const NAV_ITEMS = [
  { key: 'dashboard', path: '/', icon: DashboardIcon, permission: 'mail.read' },
  { key: 'mail', path: '/mail', icon: MailOutlineIcon, permission: 'mail.read' },
  { key: 'archive', path: '/archive', icon: ArchiveIcon, permission: 'mail.read' },
  { key: 'reports', path: '/reports', icon: BarChartIcon, permission: 'analytics.read' },
  { key: 'users', path: '/users', icon: PeopleIcon, permission: 'user.read' },
  { key: 'reference', path: '/reference', icon: CategoryIcon, permission: 'reference.manage' },
  { key: 'audit', path: '/audit', icon: HistoryIcon, permission: 'audit.read' },
  { key: 'admin', path: '/admin', icon: SettingsIcon, permission: 'db.manage' },
];

function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function BrandMark() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #0b3d6b 0%, #2f6698 100%)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        C
      </Box>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
          Gestion de Courrier
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Administration publique
        </Typography>
      </Box>
    </Box>
  );
}

export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [userAnchor, setUserAnchor] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    logout,
    hasPermission,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    toast,
    dismissToast,
  } = useAuth();

  const items = useMemo(
    () => NAV_ITEMS.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  );

  const activeItem = items
    .filter((item) => (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <BrandMark />
      </Box>
      <Divider />
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {items.map((item) => {
          const Icon = item.icon;
          const selected =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.key}
              selected={selected}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(11, 61, 107, 0.08)',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={t(`nav.${item.key}`)}
                primaryTypographyProps={{ fontWeight: selected ? 700 : 500, fontSize: 14 }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          v1.0.0 · PostgreSQL
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isDesktop ? (
          <Drawer
            variant="permanent"
            open
            sx={{
              '& .MuiDrawer-paper': {
                width: DRAWER_WIDTH,
                boxSizing: 'border-box',
                borderRight: '1px solid #e3e8ef',
                bgcolor: '#fff',
              },
            }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
          >
            {drawer}
          </Drawer>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="inherit" sx={{ bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)' }}>
          <Toolbar sx={{ gap: 1 }}>
            {!isDesktop && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="menu">
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {activeItem ? t(`nav.${activeItem.key}`) : t('app.name')}
              </Typography>
            </Box>

            <Tooltip title={t('common.language')}>
              <IconButton
                onClick={() => i18n.changeLanguage(i18n.language?.startsWith('fr') ? 'en' : 'fr')}
                size="small"
              >
                <LanguageIcon />
                <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 700 }}>
                  {i18n.language?.startsWith('fr') ? 'FR' : 'EN'}
                </Typography>
              </IconButton>
            </Tooltip>

            <Tooltip title={t('common.notifications')}>
              <IconButton onClick={(event) => setNotifAnchor(event.currentTarget)} size="small">
                <Badge color="error" badgeContent={unreadCount > 99 ? '99+' : unreadCount}>
                  <NotificationsNoneIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title={t('common.profile')}>
              <IconButton onClick={(event) => setUserAnchor(event.currentTarget)} size="small">
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13 }}>
                  {initials(user?.full_name)}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2, md: 3 } }}>
          <Box sx={{ maxWidth: 1500, mx: 'auto' }}>
            <Outlet />
          </Box>
        </Box>

        <Box sx={{ px: 3, py: 2, borderTop: '1px solid #e3e8ef' }}>
          <Typography variant="caption" color="text.secondary">
            {t('app.name')} · {new Date().getFullYear()} · {t('app.tagline')}
          </Typography>
        </Box>
      </Box>

      <Menu
        anchorEl={notifAnchor}
        open={Boolean(notifAnchor)}
        onClose={() => setNotifAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxHeight: 480 } }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">{t('common.notifications')}</Typography>
          {unreadCount > 0 && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={() => markAllRead()}
            >
              {t('common.markAllRead')}
            </Typography>
          )}
        </Box>
        <Divider />
        {notifications.length === 0 && (
          <MenuItem disabled>{t('common.noNotifications')}</MenuItem>
        )}
        {notifications.map((notification) => (
          <MenuItem
            key={notification.id}
            onClick={() => {
              markRead(notification.id).catch(() => {});
              setNotifAnchor(null);
              if (notification.record_id) navigate(`/mail/${notification.record_id}`);
            }}
            sx={{ alignItems: 'flex-start', py: 1.25, whiteSpace: 'normal' }}
          >
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {!notification.read_at && (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: notification.read_at ? 500 : 700 }}>
                  {notification.title}
                </Typography>
              </Box>
              {notification.body && (
                <Typography variant="caption" color="text.secondary">
                  {notification.body}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block">
                {new Date(notification.created_at).toLocaleString()}
              </Typography>
            </Box>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setNotifAnchor(null);
            navigate('/profile');
          }}
        >
          <MenuBookIcon fontSize="small" sx={{ mr: 1 }} />
          {t('common.viewAll')}
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user?.full_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.matricule} · {t(`roles.${user?.role}`, user?.role)}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setUserAnchor(null);
            navigate('/profile');
          }}
        >
          <PersonIcon fontSize="small" sx={{ mr: 1 }} />
          {t('common.profile')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUserAnchor(null);
            logout();
          }}
        >
          <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
          {t('common.logout')}
        </MenuItem>
      </Menu>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={dismissToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={dismissToast} severity="info" variant="filled" sx={{ width: '100%' }}>
          {toast?.title}
        </Alert>
      </Snackbar>
    </Box>
  );
}
