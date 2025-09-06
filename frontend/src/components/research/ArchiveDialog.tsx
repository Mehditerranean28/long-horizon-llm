
"use client";

import { useState, type ReactNode, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import type { AppTranslations } from '@/lib/translations';
import { ArchiveIcon as ArchiveIconMain, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/utils';
import { useArchive } from '@/contexts/ArchiveContext';
import type { ChatSession } from '@/types/chat-session';

interface ArchiveDialogProps {
  children: React.ReactNode; // To use as DialogTrigger
  onLoad: (session: ChatSession) => void;
  t: AppTranslations;
}

// MockArchivedItem is essentially ChatSession for this context
// const initialMockArchivedItems: ChatSession[] = [
//   { id: 'arch1', title: 'Old Project Alpha Notes', dateCategory: 'May 2024' },
//   { id: 'arch2', title: 'Q1 Marketing Campaign Results', dateCategory: 'April 2024' },
// ];

export function ArchiveDialog({ children, onLoad, t }: ArchiveDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Use archivedSessions from context instead of local state for items
  const { archivedSessions, deleteArchivedSession: deleteSessionFromArchive } = useArchive();
  const [itemToDelete, setItemToDelete] = useState<ChatSession | null>(null);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const { toast } = useToast();

  const handleLoadArchivedItem = (item: ChatSession) => {
    onLoad(item);
    setIsOpen(false);
  };

  const handleDeleteInitiate = (item: ChatSession, e: Event) => {
    e.stopPropagation(); 
    setItemToDelete(item);
    setShowDeleteConfirmDialog(true);
  };

  const handleConfirmDeleteItem = async () => {
    if (itemToDelete) {
      try {
        await deleteSessionFromArchive(itemToDelete.id);
        toast({
          title: t.itemDeletedTitle,
          description: t.itemDeletedDescription.replace('{title}', itemToDelete.title),
        });
      } catch (err) {
        toast({ title: t.errorDeletingTitle, description: t.errorDeletingDescription, variant: "destructive" });
      }
    }
    setShowDeleteConfirmDialog(false);
    setItemToDelete(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-lg h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ArchiveIconMain className="mr-2 h-5 w-5" /> {t.archiveTitle}
            </DialogTitle>
            <DialogDescription>
              {t.archiveDialogDescription}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-grow my-4 pr-6">
            <div className="space-y-2">
              {archivedSessions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t.noArchivedConversations}</p>
              )}
              {archivedSessions.map((item) => (
                <div
                  key={item.id}
                  className="w-full group relative flex justify-between items-center text-left p-3 rounded-md border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <button 
                    className="flex-grow text-left focus:outline-none"
                    onClick={() => handleLoadArchivedItem(item)}
                  >
                    <p className="font-medium text-primary truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.archivedLabel} {item.dateCategory}</p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-1 text-muted-foreground opacity-50 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t.archivedItemOptions}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onSelect={(e) => handleDeleteInitiate(item, e)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.deleteConfirmAction}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t.closeButton}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteArchivedChatTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteArchivedChatDescription.replace('{title}', itemToDelete?.title || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteConfirmDialog(false); setItemToDelete(null); }}>{t.deleteConfirmCancel}</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleConfirmDeleteItem}
                className={cn(
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
            >
              {t.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

