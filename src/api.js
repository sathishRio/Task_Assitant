// The API lives on its own origin in production (VITE_API_URL, e.g. https://api.devobj.com, baked in
// at build time). In development it is empty and Vite proxies /api to the local server.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// After Google sign-in the server issues a session token, kept in this browser.
const TOKEN_STORAGE = 'task-assistant/session';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE) || '';
  } catch {
    return '';
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE, token);
    else localStorage.removeItem(TOKEN_STORAGE);
  } catch {
    // Storage blocked (private mode): the session lasts until reload.
  }
};

// Thrown when the user must sign in (again): no session, expired, or account not allowed.
export class AuthError extends Error {}

// Other failures keep the HTTP status and body (e.g. vault: 423 locked, attemptsLeft, lockedUntil).
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function request(method, path, body, extraHeaders) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the server. Check that it is running.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw new AuthError(data?.error || 'Sign in required');
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

// Password vault (web only). `unlock` is the short-lived token from setup/unlock.
const withUnlock = (unlock) => ({ 'x-vault-unlock': unlock || '' });
export const vaultApi = {
  status: (unlock) => request('GET', '/vault/status', undefined, withUnlock(unlock)),
  setup: (pin) => request('POST', '/vault/setup', { pin }),
  unlock: (pin) => request('POST', '/vault/unlock', { pin }),
  lock: (unlock) => request('POST', '/vault/lock', {}, withUnlock(unlock)),
  changePin: (currentPin, newPin) => request('POST', '/vault/pin', { currentPin, newPin }),
  reset: () => request('DELETE', '/vault', { confirm: 'DELETE' }),
  list: ({ page, limit, q }) =>
    request('GET', `/vault/entries?${new URLSearchParams({ page, limit, q })}`),
  create: (unlock, data) => request('POST', '/vault/entries', data, withUnlock(unlock)),
  update: (unlock, id, data) => request('PUT', `/vault/entries/${id}`, data, withUnlock(unlock)),
  remove: (unlock, id) => request('DELETE', `/vault/entries/${id}`, undefined, withUnlock(unlock)),
  reveal: (unlock, id) => request('POST', `/vault/entries/${id}/reveal`, {}, withUnlock(unlock)),
};

export const api = {
  authConfig: () => request('GET', '/auth/config'),
  signIn: (idToken) => request('POST', '/auth/google', { idToken }),
  devSignIn: () => request('POST', '/auth/dev', {}),
  me: () => request('GET', '/auth/me'),

  bootstrap: () => request('GET', '/bootstrap'),

  createCategory: (data) => request('POST', '/categories', data),
  updateCategory: (id, data) => request('PUT', `/categories/${id}`, data),
  deleteCategory: (id) => request('DELETE', `/categories/${id}`),

  createTask: (data) => request('POST', '/tasks', data),
  updateTask: (id, data) => request('PUT', `/tasks/${id}`, data),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),

  updateProfile: (data) => request('PUT', '/profile', data),

  createPhase: (data) => request('POST', '/phases', data),
  updatePhase: (id, data) => request('PUT', `/phases/${id}`, data),
  deletePhase: (id) => request('DELETE', `/phases/${id}`),
  addTopic: (phaseId, data) => request('POST', `/phases/${phaseId}/topics`, data),
  updateTopic: (phaseId, topicId, data) => request('PUT', `/phases/${phaseId}/topics/${topicId}`, data),
  deleteTopic: (phaseId, topicId) => request('DELETE', `/phases/${phaseId}/topics/${topicId}`),

  createNote: (data) => request('POST', '/notes', data),
  updateNote: (id, data) => request('PUT', `/notes/${id}`, data),
  deleteNote: (id) => request('DELETE', `/notes/${id}`),

  createCertification: (data) => request('POST', '/certifications', data),
  updateCertification: (id, data) => request('PUT', `/certifications/${id}`, data),
  deleteCertification: (id) => request('DELETE', `/certifications/${id}`),
};
