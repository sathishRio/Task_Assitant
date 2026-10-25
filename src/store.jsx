import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { AuthError, api, getToken, setToken } from './api';
import { lockVault } from './vaultSession';

// The Office / Personal workspace shown in Tasks and Notes, remembered in this browser.
const MODE_STORAGE = 'task-assistant/mode';
const readMode = () => {
  try {
    return localStorage.getItem(MODE_STORAGE) === 'office' ? 'office' : 'personal';
  } catch {
    return 'personal';
  }
};

// Mirrors mobile/src/store.js, minus device reminders: errors surface as a toast instead of an alert.
const initialState = {
  status: 'loading', // loading | ready | error | auth (signed out)
  error: null,
  toast: null,
  user: null,
  categories: [],
  tasks: [],
  phases: [],
  certifications: [],
  profile: null,
  notes: [],
  mode: readMode(), // office | personal
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOADING':
      return { ...state, status: 'loading', error: null };
    case 'LOADED':
      return { ...state, ...action.data, status: 'ready', error: null };
    case 'FAILED':
      return { ...state, status: action.auth ? 'auth' : 'error', error: action.error };
    case 'SIGNED_OUT':
      // Drop all data so nothing from the previous session stays on screen.
      return { ...initialState, mode: state.mode, status: 'auth', error: action.error || null };
    case 'TOAST':
      return { ...state, toast: action.message };
    case 'UPSERT': {
      const list = state[action.key];
      const exists = list.some((x) => x.id === action.item.id);
      return {
        ...state,
        [action.key]: exists ? list.map((x) => (x.id === action.item.id ? action.item : x)) : [...list, action.item],
      };
    }
    case 'REMOVE':
      return { ...state, [action.key]: state[action.key].filter((x) => x.id !== action.id) };
    case 'REMOVE_TASKS':
      return { ...state, tasks: state.tasks.filter((t) => !action.ids.has(t.id)) };
    case 'PATCH_TASKS':
      // Mirror server-side cascades (e.g. deleting a category un-links its tasks).
      return { ...state, tasks: state.tasks.map((t) => (action.match(t) ? { ...t, ...action.patch } : t)) };
    case 'SET_NOTES':
      return { ...state, notes: state.notes.map((n) => (action.match(n) ? { ...n, ...action.patch } : n)) };
    case 'SET':
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const load = useCallback(async () => {
    if (!getToken()) return dispatch({ type: 'SIGNED_OUT' });
    dispatch({ type: 'LOADING' });
    try {
      const [data, user] = await Promise.all([api.bootstrap(), api.me()]);
      dispatch({ type: 'LOADED', data: { ...data, user } });
    } catch (e) {
      if (e instanceof AuthError) {
        setToken(null);
        dispatch({ type: 'SIGNED_OUT', error: e.message });
      } else {
        dispatch({ type: 'FAILED', error: e.message });
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actions = useMemo(() => {
    // Runs an API call; on failure shows a toast and returns null instead of throwing.
    // A session that expired mid-use sends the user back to the sign-in screen.
    const attempt = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof AuthError) {
          setToken(null);
          dispatch({ type: 'SIGNED_OUT', error: e.message });
        } else {
          dispatch({ type: 'TOAST', message: e.message });
        }
        return null;
      }
    };
    const upsert = (key) => (item) => {
      if (item) dispatch({ type: 'UPSERT', key, item });
      return item;
    };
    // Task responses also carry any objectives whose status the server changed as a result.
    const upsertTask = (res) => {
      if (!res) return res;
      const { objectives = [], ...task } = res;
      [task, ...objectives].forEach(upsert('tasks'));
      return task;
    };
    const remove = (key, call, cascade) => async (id) => {
      const ok = await attempt(() => call(id).then(() => true));
      if (!ok) return false;
      dispatch({ type: 'REMOVE', key, id });
      if (cascade) dispatch({ type: 'PATCH_TASKS', ...cascade(id) });
      return true;
    };

    const self = {
      reload: load,
      // For views that keep their own data (Wealth): same error toast and sign-out handling.
      run: attempt,
      dismissToast: () => dispatch({ type: 'TOAST', message: null }),
      setMode: (mode) => {
        try {
          localStorage.setItem(MODE_STORAGE, mode);
        } catch {
          // Storage blocked: the choice lasts until reload.
        }
        dispatch({ type: 'SET', key: 'mode', value: mode });
      },

      // Exchanges a Google ID token for a session (or, with no token, uses the dev-mode
      // Admin login); returns an error message or null.
      signIn: async (idToken) => {
        try {
          const { token } = await (idToken ? api.signIn(idToken) : api.devSignIn());
          setToken(token);
          await load();
          return null;
        } catch (e) {
          return e.message;
        }
      },
      signOut: () => {
        lockVault(); // before the session token is dropped, so the server-side lock is authorized
        setToken(null);
        window.google?.accounts?.id?.disableAutoSelect();
        dispatch({ type: 'SIGNED_OUT' });
      },

      createTask: (data) => attempt(() => api.createTask(data)).then(upsertTask),
      updateTask: (id, data) => attempt(() => api.updateTask(id, data)).then(upsertTask),
      toggleTask: (task) => self.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
      // Deleting an objective deletes its actions too; the server returns every removed id.
      deleteTask: async (id) => {
        const result = await attempt(() => api.deleteTask(id));
        if (!result) return false;
        const removed = new Set(result.removedIds);
        dispatch({ type: 'REMOVE_TASKS', ids: removed });
        result.objectives.forEach(upsert('tasks'));
        // The server un-links sticky notes from deleted tasks; mirror that here.
        dispatch({ type: 'SET_NOTES', match: (n) => removed.has(n.taskId), patch: { taskId: null } });
        return true;
      },

      createCategory: (data) => attempt(() => api.createCategory(data)).then(upsert('categories')),
      updateCategory: (id, data) => attempt(() => api.updateCategory(id, data)).then(upsert('categories')),
      deleteCategory: remove('categories', api.deleteCategory, (id) => ({
        match: (t) => t.categoryId === id, patch: { categoryId: null },
      })),

      updateProfile: (data) =>
        attempt(() => api.updateProfile(data)).then((profile) => {
          if (profile) dispatch({ type: 'SET', key: 'profile', value: profile });
          return profile;
        }),

      createPhase: (data) => attempt(() => api.createPhase(data)).then(upsert('phases')),
      updatePhase: (id, data) => attempt(() => api.updatePhase(id, data)).then(upsert('phases')),
      deletePhase: remove('phases', api.deletePhase, (id) => ({
        match: (t) => t.phaseId === id, patch: { phaseId: null, topicId: null },
      })),
      addTopic: (phaseId, title) => attempt(() => api.addTopic(phaseId, { title })).then(upsert('phases')),
      updateTopic: (phaseId, topicId, data) => attempt(() => api.updateTopic(phaseId, topicId, data)).then(upsert('phases')),
      deleteTopic: async (phaseId, topicId) => {
        const phase = await attempt(() => api.deleteTopic(phaseId, topicId));
        if (!phase) return;
        dispatch({ type: 'UPSERT', key: 'phases', item: phase });
        dispatch({ type: 'PATCH_TASKS', match: (t) => t.topicId === topicId, patch: { topicId: null } });
      },

      createNote: (data) => attempt(() => api.createNote(data)).then(upsert('notes')),
      updateNote: (id, data) => attempt(() => api.updateNote(id, data)).then(upsert('notes')),
      deleteNote: remove('notes', api.deleteNote),

      createCertification: (data) => attempt(() => api.createCertification(data)).then(upsert('certifications')),
      updateCertification: (id, data) => attempt(() => api.updateCertification(id, data)).then(upsert('certifications')),
      deleteCertification: remove('certifications', api.deleteCertification),
    };
    return self;
  }, [load]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

/* ---------- Derived values (same rules as the mobile app) ---------- */

// A phase's progress counts its topics, its deliverable, and every task linked to it.
export function phaseProgress(phase, tasks) {
  const linked = tasks.filter((t) => t.phaseId === phase.id);
  const total = phase.topics.length + 1 + linked.length;
  const done =
    phase.topics.filter((t) => t.done).length +
    (phase.deliverableDone ? 1 : 0) +
    linked.filter((t) => t.status === 'done').length;
  return { done, total, percent: Math.round((done / total) * 100), linkedCount: linked.length };
}

export function overallProgress(phases, tasks) {
  if (!phases.length) return 0;
  const sum = phases.reduce((acc, p) => acc + phaseProgress(p, tasks).percent, 0);
  return Math.round(sum / phases.length);
}

// First phase that is not fully complete — "where I am now" in the plan.
export const currentPhase = (phases, tasks) => phases.find((p) => phaseProgress(p, tasks).percent < 100) || null;
