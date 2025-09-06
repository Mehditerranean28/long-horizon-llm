"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/types";
import type { AppTranslations } from "@/lib/translations";
import { FileIcon, Image as ImageIcon } from "lucide-react";

interface LibraryDialogProps {
  children: ReactNode;
  messages: ChatMessage[];
  onOpen?: () => void;
  t: AppTranslations;
}

export function LibraryDialog({ children, messages, onOpen, t }: LibraryDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const attachments = messages
    .filter(m => m.attachmentName || m.attachmentPreviewUrl)
    .map(m => ({
      id: m.id,
      name: m.attachmentName,
      previewUrl: m.attachmentPreviewUrl,
    }));

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && onOpen) onOpen();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{t.libraryDialogTitle}</DialogTitle>
          <DialogDescription>{t.libraryDialogDescription}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow pr-6">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noFilesFound}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {attachments.map(att => (
                <Card key={att.id} className="overflow-hidden">
                  <CardHeader className="p-2 pb-0">
                    <CardTitle className="text-sm truncate">{att.name || t.attachmentLabel}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 flex justify-center items-center">
                    {att.previewUrl ? (
                      <Image src={att.previewUrl} alt={att.name || t.attachmentLabel} width={150} height={150} className="object-cover rounded-md" />
                    ) : (
                      <FileIcon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogClose asChild>
          <Button type="button" variant="outline">{t.closeButton}</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
