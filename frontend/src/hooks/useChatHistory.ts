import { useCallback, useSyncExternalStore } from 'react';
import type { ChatSession } from '../types';
import { deleteCookie, getCookiesByPrefix, setCookie } from '../utils/cookies';

const COOKIE_PREFIX = 'cicp_chat_session_';
const MAX_SESSIONS = 10;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type Subscriber = () => void;

const listeners = new Set<Subscriber>();

const isBrowser = typeof document !== 'undefined';

const loadSessionsFromCookies = (): ChatSession[] => {
  if (!isBrowser) {
    return [];
  }

  const cookies = getCookiesByPrefix(COOKIE_PREFIX);

  const sessions: ChatSession[] = Object.entries(cookies)
    .map(([cookieName, value]) => {
      try {
        const session = JSON.parse(value) as ChatSession;
        return session;
      } catch (error) {
        console.error(`Failed to parse chat session cookie ${cookieName}:`, error);
        deleteCookie(cookieName);
        return null;
      }
    })
    .filter((session): session is ChatSession => session !== null);

  return sessions.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_SESSIONS);
};

let sessionsCache: ChatSession[] = loadSessionsFromCookies();

const persistSessionsToCookies = (sessions: ChatSession[]) => {
  if (!isBrowser) {
    return;
  }

  const limitedSessions = sessions
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SESSIONS);

  const allowedCookieNames = new Set(
    limitedSessions.map((session) => `${COOKIE_PREFIX}${session.id}`)
  );

  // Persist the sessions we want to keep
  for (const session of limitedSessions) {
    try {
      const payload = JSON.stringify(session);

      if (payload.length > 3800) {
        console.warn(
          `Chat session ${session.id} is approaching cookie size limits (${payload.length} bytes). Consider trimming the conversation.`
        );
      }

      setCookie(`${COOKIE_PREFIX}${session.id}`, payload, {
        maxAgeSeconds: COOKIE_MAX_AGE_SECONDS,
      });
    } catch (error) {
      console.error(`Failed to store chat session ${session.id}:`, error);
    }
  }

  // Remove any cookies that are no longer needed
  const existingCookies = getCookiesByPrefix(COOKIE_PREFIX);
  for (const cookieName of Object.keys(existingCookies)) {
    if (!allowedCookieNames.has(cookieName)) {
      deleteCookie(cookieName);
    }
  }
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

const updateSessions = (sessions: ChatSession[]) => {
  sessionsCache = sessions
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_SESSIONS);

  persistSessionsToCookies(sessionsCache);
  emit();
};

const addOrUpdateSessionInternal = (session: ChatSession) => {
  const existingIndex = sessionsCache.findIndex((s) => s.id === session.id);
  let nextSessions: ChatSession[];

  if (existingIndex >= 0) {
    nextSessions = [...sessionsCache];
    nextSessions[existingIndex] = session;
  } else {
    nextSessions = [session, ...sessionsCache];
  }

  updateSessions(nextSessions);
};

const getSessionInternal = (sessionId: string): ChatSession | undefined => {
  return sessionsCache.find((session) => session.id === sessionId);
};

const deleteSessionInternal = (sessionId: string) => {
  const nextSessions = sessionsCache.filter((session) => session.id !== sessionId);
  updateSessions(nextSessions);
  deleteCookie(`${COOKIE_PREFIX}${sessionId}`);
};

const clearHistoryInternal = () => {
  sessionsCache = [];
  const cookies = getCookiesByPrefix(COOKIE_PREFIX);
  Object.keys(cookies).forEach(deleteCookie);
  emit();
};

const subscribe = (listener: Subscriber) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => sessionsCache;
const getServerSnapshot = () => sessionsCache;

export const chatHistoryStore = {
  subscribe,
  getSnapshot,
  addOrUpdateSession: addOrUpdateSessionInternal,
  getSession: getSessionInternal,
  deleteSession: deleteSessionInternal,
  clearHistory: clearHistoryInternal,
};

export const useChatHistory = () => {
  const sessions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addOrUpdateSession = useCallback(
    (session: ChatSession) => {
      addOrUpdateSessionInternal(session);
    },
    []
  );

  const getSession = useCallback(
    (sessionId: string) => {
      return getSessionInternal(sessionId);
    },
    []
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      deleteSessionInternal(sessionId);
    },
    []
  );

  const clearHistory = useCallback(() => {
    clearHistoryInternal();
  }, []);

  return {
    sessions,
    addOrUpdateSession,
    getSession,
    deleteSession,
    clearHistory,
  };
};