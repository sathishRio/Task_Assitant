import { vaultApi } from './api';

// The vault unlock token lives in page memory only: never in localStorage, so a reload or a
// closed tab always locks. It survives switching views, and expires with the server session.
let session = null; // { token, expiresAt: number }
const listeners = new Set();
let timer;

const notify = () => listeners.forEach((fn) => fn(session));

export const getVaultSession = () => (session && session.expiresAt > Date.now() ? session : null);

export function setVaultSession(token, expiresAt) {
  session = { token, expiresAt: new Date(expiresAt).getTime() };
  clearTimeout(timer);
  timer = setTimeout(clearVaultSession, session.expiresAt - Date.now());
  notify();
}

export function clearVaultSession() {
  session = null;
  clearTimeout(timer);
  notify();
}

// Locks on the server too (used by "Lock now" and sign-out).
export async function lockVault() {
  const current = session;
  clearVaultSession();
  if (current) await vaultApi.lock(current.token).catch(() => {});
}

export function subscribeVault(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
