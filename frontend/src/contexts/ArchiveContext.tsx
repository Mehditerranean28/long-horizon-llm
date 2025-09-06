
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ChatSession } from '@/types/chat-session';

interface ArchiveContextType {
  archivedSessions: ChatSession[];
  archiveSession: (session: ChatSession) => Promise<void>;
  deleteArchivedSession: (sessionId: string) => Promise<void>;
}

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

const ARCHIVED_SESSIONS_KEY = 'sovereign_archived_sessions';

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [archivedSessions, setArchivedSessions] = useState<ChatSession[]>([]);
  const isBrowser = typeof window !== 'undefined';

  useEffect(() => {
    if (!isBrowser) return;
    const storedSessions = localStorage.getItem(ARCHIVED_SESSIONS_KEY);
    if (storedSessions) {
      try {
        const parsedSessions = JSON.parse(storedSessions) as ChatSession[];
        const uniqueSessionsMap = new Map<string, ChatSession>();
        parsedSessions.forEach(session => {
          if (!uniqueSessionsMap.has(session.id)) {
            uniqueSessionsMap.set(session.id, session);
          }
        });
        setArchivedSessions(Array.from(uniqueSessionsMap.values()));
      } catch (e) {
        console.error('Failed to parse or de-duplicate archived sessions from localStorage', e);
        setArchivedSessions([]);
      }
    } else {
      setArchivedSessions([]);
    }
  }, [isBrowser]);

  const updateLocalStorage = useCallback((sessions: ChatSession[]) => {
    if (isBrowser) {
      localStorage.setItem(ARCHIVED_SESSIONS_KEY, JSON.stringify(sessions));
    }
  }, [isBrowser]);

  const archiveSession = useCallback(async (session: ChatSession) => {
    setArchivedSessions(prevSessions => {
      if (prevSessions.find(s => s.id === session.id)) {
        console.warn(`Session with ID ${session.id} already archived. Skipping.`);
        return prevSessions;
      }
      const newSessions = [...prevSessions, session];
      updateLocalStorage(newSessions);
      return newSessions;
    });
    console.log('Mock session archived:', session.title);
  }, [updateLocalStorage]);

  const deleteArchivedSession = useCallback(async (sessionId: string) => {
    setArchivedSessions(prevSessions => {
      const newSessions = prevSessions.filter(s => s.id !== sessionId);
      updateLocalStorage(newSessions);
      return newSessions;
    });
    console.log('Mock archived session deleted:', sessionId);
  }, [updateLocalStorage]);

  return (
    <ArchiveContext.Provider value={{ archivedSessions, archiveSession, deleteArchivedSession }}>
      {children}
    </ArchiveContext.Provider>
  );
}

export function useArchive() {
  const context = useContext(ArchiveContext);
  if (context === undefined) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
}
