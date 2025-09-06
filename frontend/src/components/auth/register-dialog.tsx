"use client";

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
import { Input } from "@/components/ui/input";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import type { AppTranslations } from '@/lib/translations';
import { registerUser, type RegisterResponse } from '@/api/client';

interface RegisterDialogProps {
  children?: React.ReactNode; // For DialogTrigger
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegisterSuccess: () => void;
  t: AppTranslations;
}

export function RegisterDialog({ children, open, onOpenChange, onRegisterSuccess, t }: RegisterDialogProps) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async () => {
    try {
      const res: RegisterResponse = await registerUser({ username, password, email });
      await login(username, password);
      toast({ title: res.message ?? t.registerSuccessTitle });
      onRegisterSuccess();
    } catch (err) {
      toast({ title: t.registerFailedTitle, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.registerDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.registerDialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            placeholder={t.usernamePlaceholder}
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <Input
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleRegister}>{t.registerButton}</Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t.deleteConfirmCancel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
