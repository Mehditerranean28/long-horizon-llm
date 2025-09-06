import { createStore, get, set, clear } from 'idb-keyval';
import type { ChatSession } from '@/types/chat-session';

const store = createStore('sovereign', 'sessions');
const SESSIONS_KEY = 'session_list';

export async function loadSessions(): Promise<ChatSession[]> {
  return (await get(SESSIONS_KEY, store)) || [];
}

async function saveSessions(sessions: ChatSession[]): Promise<void> {
  await set(SESSIONS_KEY, sessions, store);
}

export async function addSession(session: ChatSession): Promise<void> {
  const sessions = await loadSessions();
  sessions.push(session);
  await saveSessions(sessions);
}

export async function renameSession(id: string, title: string): Promise<void> {
  const sessions = await loadSessions();
  const index = sessions.findIndex(s => s.id === id);
  if (index !== -1) {
    sessions[index].title = title;
    await saveSessions(sessions);
  }
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await loadSessions();
  const filtered = sessions.filter(s => s.id !== id);
  await saveSessions(filtered);
}

export async function archiveSession(id: string): Promise<ChatSession | null> {
  const sessions = await loadSessions();
  const index = sessions.findIndex(s => s.id === id);
  if (index !== -1) {
    const [session] = sessions.splice(index, 1);
    await saveSessions(sessions);
    return session;
  }
  return null;
}

export async function clearSessions(): Promise<void> {
  await clear(store);
}
