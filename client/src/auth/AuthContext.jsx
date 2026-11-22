import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import client, {
  API_BASE_URL,
  getAccessToken,
  setAccessToken,
  refreshSession,
} from '../api/client';

const AuthContext = createContext(null);

function socketOrigin() {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const socketRef = useRef(null);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await client.get('/notifications', {
        params: { limit: 20 },
      });
      setNotifications(data.data);
      setUnreadCount(data.unreadCount);
    } catch {
      // Notifications are non-critical; keep the shell usable.
    }
  }, [user]);

  const connectSocket = useCallback(() => {
    if (socketRef.current) return;
    const token = getAccessToken();
    if (!token) return;
    const socket = io(socketOrigin(), {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('notification:new', (notification) => {
      setNotifications((current) => [notification, ...current].slice(0, 30));
      setUnreadCount((count) => count + 1);
      setToast(notification);
    });
    socketRef.current = socket;
  }, []);

  const applySession = useCallback(
    (data) => {
      setAccessToken(data.accessToken);
      setUser(data.user);
      connectSocket();
    },
    [connectSocket]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await refreshSession();
        if (cancelled) return;
        applySession(data);
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setAccessToken(null);
      disconnectSocket();
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [disconnectSocket]);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user, loadNotifications]);

  useEffect(() => () => disconnectSocket(), [disconnectSocket]);

  const login = useCallback(
    async (credentials) => {
      const { data } = await client.post('/auth/login', credentials);
      applySession(data);
      return data.user;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout');
    } catch {
      // Ignore network errors during sign-out.
    }
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setAccessToken(null);
    disconnectSocket();
  }, [disconnectSocket]);

  const refreshUser = useCallback(async () => {
    const { data } = await client.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const markRead = useCallback(async (id) => {
    await client.patch(`/notifications/${id}/read`);
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await client.post('/notifications/read-all');
    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, []);

  const hasPermission = useCallback(
    (permission) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return (user.permissions || []).includes(permission);
    },
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      hasPermission,
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      toast,
      dismissToast: () => setToast(null),
      loadNotifications,
    }),
    [
      user,
      loading,
      login,
      logout,
      refreshUser,
      hasPermission,
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      toast,
      loadNotifications,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
