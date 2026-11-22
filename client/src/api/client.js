import axios from 'axios';

export const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

let accessToken = null;
let refreshPromise = null;

function readCookie(name) {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function getCsrfToken() {
  return readCookie('csrf_token');
}

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  const csrf = getCsrfToken();
  if (csrf) config.headers['X-CSRF-Token'] = csrf;
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  return config;
});

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': getCsrfToken() || '',
        },
      })
      .then((response) => {
        setAccessToken(response.data.accessToken);
        return response.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = config?.url?.includes('/auth/');
    if (response?.status === 401 && config && !config.__retried && !isAuthRoute) {
      config.__retried = true;
      try {
        await refreshSession();
        return client(config);
      } catch {
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(error, fallback = 'Une erreur est survenue.') {
  const payload = error?.response?.data?.error;
  if (!payload) return error?.message || fallback;
  if (Array.isArray(payload.details) && payload.details.length) {
    return `${payload.message} (${payload.details
      .map((detail) => detail.message)
      .join(', ')})`;
  }
  return payload.message || fallback;
}

export async function downloadFile(url, filename, params) {
  const response = await client.get(url, { params, responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export { refreshSession };
export default client;
