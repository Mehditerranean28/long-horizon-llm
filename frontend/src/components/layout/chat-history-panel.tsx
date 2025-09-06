
"use client";

import { useState, type MouseEvent, useEffect, type ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input"; // Added Input
import { LogOut, PenLine, Trash2, Share2, Archive as ArchiveIconLucide, MoreHorizontal, XIcon } from "lucide-react"; // Added XIcon
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/utils";
import { useArchive } from '@/contexts/ArchiveContext';
import type { ChatSession } from '@/types/chat-session';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/contexts/AuthContext';
import {
  loadSessions as loadStoredSessions,
  addSession,
  renameSession as renameStoredSession,
  deleteSession as deleteStoredSession,
  archiveSession as archiveStoredSession,
} from '@/lib/session-storage';
import type { AppTranslations } from '@/lib/translations';
import type { ChatMessage } from '@/types';
import { LibraryDialog } from '@/components/library/library-dialog';


// Inline SVGs for header buttons
const NewChatIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M15.6729 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z" fill="currentColor" />
    </svg>
);
const SearchChatsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M10.75 4.25C7.16015 4.25 4.25 7.16015 4.25 10.75C4.25 14.3399 7.16015 17.25 10.75 17.25C14.3399 17.25 17.25 14.3399 17.25 10.75C17.25 7.16015 14.3399 4.25 10.75 4.25ZM2.25 10.75C2.25 6.05558 6.05558 2.25 10.75 2.25C15.4444 2.25 19.25 6.05558 19.25 10.75C19.25 12.7369 18.5683 14.5645 17.426 16.0118L21.4571 20.0429C21.8476 20.4334 21.8476 21.0666 21.4571 21.4571C21.0666 21.8476 20.4334 21.8476 20.0429 21.4571L16.0118 17.426C14.5645 18.5683 12.7369 19.25 10.75 19.25C6.05558 19.25 2.25 15.4444 2.25 10.75Z" fill="currentColor" />
    </svg>
);
const LibraryIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M20 15a1 1 0 1 0-2 0v2h-2a1 1 0 1 0 0 2h2v2a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-2z"></path>
      <path fill="currentColor" d="M21.956 8.748C22 9.29 22 9.954 22 10.758V11a1 1 0 0 1-1 1H4v3.2c0 .857 0 1.439.038 1.889.035.438.1.663.18.819a2 2 0 0 0 .874.874c.156.08.38.145.819.18C6.361 19 6.943 19 7.8 19H12a1 1 0 1 1 0 2H7.759c-.805 0-1.47 0-2.01-.044-.563-.046-1.08-.145-1.565-.392a4 4 0 0 1-1.748-1.748c-.247-.485-.346-1.002-.392-1.564C2 16.71 2 16.046 2 15.242V8.758c0-.805 0-1.47.044-2.01.046-.563.145-1.08.392-1.565a4 4 0 0 1 1.748-1.748c.485-.247 1.002-.346 1.564-.392C6.29 3 6.954 3 7.758 3h.851c.146 0 .256 0 .365.006a4 4 0 0 1 2.454 1.016c.081.073.16.151.262.254l.017.017c.127.127.164.164.2.196a2 2 0 0 0 1.227.508c.048.003.1.003.28.003h2.827c.805 0 1.47 0 2.01.044.563.046 1.08.145 1.565.392a4 4 0 0 1 1.748 1.748c.247.485.346 1.002.392 1.564M10.093 5.511a2 2 0 0 0-1.227-.508A6 6 0 0 0 8.586 5H7.8c-.857 0-1.439 0-1.889.038-.438.035-.663.1-.819.18a2 2 0 0 0-.874.874c-.08.156-.145.38-.18.819C4 7.361 4 7.943 4 8.8V10h15.998a15 15 0 0 0-.036-1.089c-.035-.438-.1-.663-.18-.819a2 2 0 0 0-.874-.874c-.156-.08-.38-.145-.819-.18C17.639 7 17.057 7 16.2 7h-2.81c-.145 0-.255 0-.364-.006a4 4 0 0 1-2.454-1.016 7 7 0 0 1-.262-.254l-.017-.017a6 6 0 0 0-.2-.196"></path>
    </svg>
);
const EllipsisIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon-md" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path>
  </svg>
);


interface ChatHistoryPanelProps {
  onLogout: () => void;
  onClose: () => void;
  onNewChat: (correlationId?: string) => void;
  onLoadSession: (session: ChatSession) => void;
  t: AppTranslations;
  messages: ChatMessage[];
}


function categoryRank(category: string): number {
  if (category === 'Today') return 0;
  if (category === 'Yesterday') return 1;
  if (category === 'Previous 7 Days') return 2;
  const parsed = Date.parse(category);
  if (!Number.isNaN(parsed)) {
    // Negative timestamp so recent months come first
    return -parsed;
  }
  return Infinity;
}


export function ChatHistoryPanel({ onLogout, onClose, onNewChat, onLoadSession, t, messages }: ChatHistoryPanelProps) {

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const { archiveSession } = useArchive();
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadStoredSessions()
      .then(setSessions)
      .catch(err => console.error('Failed to load sessions', err));
  }, []);

  const handleNewChat = async () => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title: 'New Chat',
      dateCategory: 'Today',
      correlationId: uuidv4(),
    };
    await addSession(newSession);
    setSessions(prev => [newSession, ...prev]);
    onNewChat(newSession.correlationId);
    onClose();
  };

  const handleSearchFocus = () => {
    setIsSearching(true);
  };

  const handleSearchCancel = () => {
    setIsSearching(false);
    setSearchTerm("");
  };
  
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };


  const handleSessionClick = (session: ChatSession) => {
    onLoadSession(session);
    onClose();
  };

  const handleItemAction = async (action: string, session: ChatSession, e?: MouseEvent<HTMLDivElement> | Event) => {
    if (e) e.stopPropagation(); 

    switch (action) {
      case 'rename':
        {
          const newTitle = window.prompt(t.renameOption, session.title);
          if (newTitle) {
            await renameStoredSession(session.id, newTitle);
            setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: newTitle } : s));
            toast({ title: t.renameSuccessTitle, description: t.renameSuccessDescription.replace('{title}', newTitle) });
          }
        }
        break;
      case 'share':
        {
          const shareUrl = `${window.location.origin}/share/${session.id}`;
          navigator.clipboard.writeText(shareUrl).then(() => {
            toast({ title: t.shareLinkCopiedTitle, description: shareUrl });
          });
        }
        break;
      case 'archive':
        if (isAuthenticated) {
          try {
            await archiveSession(session);
            await archiveStoredSession(session.id);
            setSessions(prevSessions => prevSessions.filter(s => s.id !== session.id));
            toast({ title: t.conversationArchivedTitle, description: t.conversationArchivedDescription.replace('{title}', session.title) });
          } catch (err) {
            toast({ title: t.errorArchivingTitle, description: t.errorArchivingDescription, variant: "destructive" });
          }
        } else {
          toast({ title: t.loginRequiredTitle, description: t.loginRequiredDescription, variant: "destructive" });
        }
        break;
      case 'delete':
        setChatToDelete(session);
        setShowDeleteConfirmDialog(true);
        break;
      default:
        break;
    }
  };
  
  const handleConfirmDelete = async () => {
      if (chatToDelete) {
        await deleteStoredSession(chatToDelete.id);
        setSessions(prevSessions => prevSessions.filter(s => s.id !== chatToDelete.id));
        toast({ title: t.chatDeletedTitle, description: t.chatDeletedDescription.replace('{title}', chatToDelete.title) });
      }
      setShowDeleteConfirmDialog(false);
      setChatToDelete(null);
  };

  const filteredSessions = sessions
    .filter(session => session.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const categories = Array.from(new Set(filteredSessions.map(s => s.dateCategory)))
    .sort((a, b) => categoryRank(a) - categoryRank(b));

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border">
      {/* Top action buttons */}
      <div className="p-2 space-y-1 border-b border-border">
         <Button variant="ghost" className="w-full justify-start text-sm h-9 px-2 hover:bg-accent/80" onClick={handleNewChat}>
            <NewChatIcon />
            <span className="ml-2 truncate">{t.newChatButton}</span>
        </Button>
        
        {isSearching ? (
          <div className="flex items-center space-x-2 px-2">
            <SearchChatsIcon />
            <Input
              type="text"
              placeholder={t.searchChatsPlaceholder + "..."}
              value={searchTerm}
              onChange={handleSearchChange}
              className="h-9 text-sm flex-grow focus-visible:ring-0 border-0 shadow-none px-1"
              autoFocus
            />
            <Button variant="ghost" size="icon" onClick={handleSearchCancel} className="h-7 w-7 shrink-0">
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="w-full justify-start text-sm h-9 px-2 text-muted-foreground hover:bg-accent/80 hover:text-foreground" onClick={handleSearchFocus}>
              <SearchChatsIcon />
              <span className="ml-2 truncate">{t.searchChatsPlaceholder}</span>
              <span className="ml-auto text-xs opacity-70 hidden sm:inline">Ctrl K</span>
          </Button>
        )}

        <LibraryDialog messages={messages} onOpen={onClose} t={t}>
          <Button variant="ghost" className="w-full justify-start text-sm h-9 px-2 hover:bg-accent/80">
            <LibraryIcon />
            <span className="ml-2 truncate">{t.libraryButton}</span>
          </Button>
        </LibraryDialog>
      </div>

      <ScrollArea className="flex-grow">
        <div className="p-2">
          {filteredSessions.length === 0 && searchTerm ? (
             <p className="text-xs text-muted-foreground text-center py-4">{t.noChatsFound.replace('{searchTerm}', searchTerm)}</p>
          ) : filteredSessions.length === 0 && !searchTerm ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t.noActiveSessions}</p>
          ) : (
            categories.map(category => {
              const categorySessions = filteredSessions
                .filter(s => s.dateCategory === category)
                .sort((a, b) => (a.id < b.id ? 1 : -1));
              if (!categorySessions || categorySessions.length === 0) {
                return null;
              }
              return (
                <aside key={category} className="mx-[3px] last:mb-5 mt-3 first:mt-1 mb-3">
                  <h2 className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {category}
                  </h2>
                  {categorySessions.map((session) => (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "w-full flex justify-between items-center text-left h-auto py-1.5 px-2 group rounded-md",
                        "hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:bg-accent/80"
                      )}
                      onClick={() => handleSessionClick(session)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSessionClick(session);}}
                      title={session.title}
                    >
                      <div className="flex-grow min-w-0 truncate">
                        <span className="text-sm font-normal text-foreground truncate">{session.title}</span>
                      </div>
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground shrink-0"
                            onClick={(e) => e.stopPropagation()} 
                            aria-label={t.openConversationOptionsAria}
                          >
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onSelect={(e) => handleItemAction('rename', session, e)}>
                            <PenLine className="mr-2 h-4 w-4" />
                            {t.renameOption}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={(e) => handleItemAction('share', session, e)}>
                            <Share2 className="mr-2 h-4 w-4" />
                            {t.shareConversationOption}
                          </DropdownMenuItem>
                           <DropdownMenuItem onSelect={(e) => handleItemAction('archive', session, e)}>
                            <ArchiveIconLucide className="mr-2 h-4 w-4" />
                            {t.archiveConversationOption}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              handleItemAction('delete', session, e);
                            }}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t.deleteConversationOption}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </aside>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border mt-auto">
        <Button variant="outline" size="sm" className="w-full" onClick={() => {onLogout(); onClose();}}>
          <LogOut className="mr-2 h-4 w-4" />
          {t.logoutButton}
        </Button>
      </div>

      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t.deleteChatTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteChatDescription.replace('{title}', chatToDelete?.title || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-muted-foreground mt-2 text-sm">{t.settingsDeletionTip}</p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteConfirmDialog(false); setChatToDelete(null); }}>{t.deleteConfirmCancel}</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleConfirmDelete}
                className={cn(
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
            >
              {t.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

