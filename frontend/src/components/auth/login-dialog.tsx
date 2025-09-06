
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

interface LoginDialogProps {
  children?: React.ReactNode; // For DialogTrigger
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoginSuccess: () => void;
  t: AppTranslations;
}

export function LoginDialog({ children, open, onOpenChange, onLoginSuccess, t }: LoginDialogProps) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await login(username, password);
      toast({ title: t.loginSuccessTitle });
      onLoginSuccess();
    } catch (err) {
      toast({ title: t.loginFailedTitle, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.loginDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.loginDialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            placeholder={t.usernamePlaceholder}
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleLogin}>{t.loginButton}</Button>
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
