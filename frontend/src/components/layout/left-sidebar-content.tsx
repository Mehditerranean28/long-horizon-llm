
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/utils';
import { loadSessions, clearSessions } from '@/lib/session-storage';
import type { ChatSession } from '@/types/chat-session';
import { clearAllChats } from '@/lib/chat-storage';
import { clearHistory } from '@/api/client';

interface SidebarChatSession extends ChatSession {
  lastActivity: string;
}

const mockChatSessions: SidebarChatSession[] = [
  // { id: '1', title: 'Wildcard Pattern Matching Deep Dive', lastActivity: '2h ago' },
  // { id: '2', title: 'Market Analysis Q3', lastActivity: 'Yesterday' },
  // { id: '3', title: 'Quantum Entanglement Explained', lastActivity: '3d ago' },
]; // Start with no sessions for testing empty state

interface LeftSidebarContentProps {
  onClearMessages?: () => void;
}

export function LeftSidebarContent({ onClearMessages }: LeftSidebarContentProps) {
  const [chatSessions, setChatSessions] = useState<SidebarChatSession[]>(mockChatSessions);
  const { state: sidebarState } = useSidebar();

  useEffect(() => {
    loadSessions().then(setChatSessions).catch(() => {});
  }, []);

  const handleClearHistory = async () => {
    setChatSessions([]);
    if (onClearMessages) {
      onClearMessages();
    }
    try {
      await Promise.all([clearSessions(), clearAllChats(), clearHistory()]);
    } catch (err) {
      console.error('Failed to clear history', err);
    }
  };

  return (
    <div className="flex flex-col h-full p-0">
      <div className={cn("p-3 border-b", sidebarState === 'collapsed' && "p-1 flex justify-center")}>
        <h2 className={cn("text-lg font-semibold text-primary", sidebarState === 'collapsed' && "hidden")}>{t.chatSessionsTitle}</h2>
        {sidebarState === 'collapsed' && (
          <span title={t.chatSessionsTitle}>
            <MessageSquareText className="h-5 w-5 text-primary" />
          </span>
        )}
      </div>

      <ScrollArea className="flex-grow">
        <div className={cn("p-3 space-y-2", sidebarState === 'collapsed' && "p-1")}>
          {chatSessions.length === 0 ? (
            <p className={cn("text-sm text-muted-foreground text-center py-4", sidebarState === 'collapsed' && "hidden")}>No active sessions.</p>
          ) : (
            chatSessions.map((session) => (
              <Button
                key={session.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start text-left h-auto py-2 px-2",
                  sidebarState === 'collapsed' && "justify-center px-0 h-10 w-10"
                )}
                title={session.title}
              >
                {sidebarState === 'collapsed' ? (
                  <MessageSquareText className="h-4 w-4" />
                ) : (
                  <div className="flex flex-col w-full overflow-hidden">
                    <span className="text-sm font-medium truncate block">{session.title}</span>
                    <span className="text-xs text-muted-foreground">{session.lastActivity}</span>
                  </div>
                )}
              </Button>
            ))
          )}
        </div>
      </ScrollArea>

      {chatSessions.length > 0 && sidebarState === 'expanded' && (
        <div className="p-3 border-t">
          <Button variant="outline" size="sm" className="w-full" onClick={handleClearHistory}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t.clearHistoryButton}
          </Button>
        </div>
      )}
      {/* Admin Settings Accordion Removed */}
    </div>
  );
}
