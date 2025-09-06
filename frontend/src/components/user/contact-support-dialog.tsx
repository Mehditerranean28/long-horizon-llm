"use client";

import { useState } from 'react';
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';
import { api } from '@/api/client';
import type { AppTranslations } from '@/lib/translations';

interface ContactSupportDialogProps {
  children: React.ReactNode;
  t: AppTranslations;
}

export function ContactSupportDialog({ children, t }: ContactSupportDialogProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const { toast } = useToast();

  const handleSend = async () => {
    const body = { message };
    const { promise } = api.post<{ success: boolean }>('/contact', body);
    const result = await promise;
    if (result.ok) {
      toast({ title: t.contactSupportSuccessTitle, description: t.contactSupportSuccessDescription });
      setMessage('');
      setOpen(false);
    } else {
      toast({ title: t.errorBannerMessage, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.contactSupportTitle}</DialogTitle>
          <DialogDescription>{t.contactSupportDescription}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.contactSupportPlaceholder}
        />
        <DialogFooter>
          <Button onClick={handleSend}>{t.contactSupportSend}</Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost">{t.deleteConfirmCancel}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
