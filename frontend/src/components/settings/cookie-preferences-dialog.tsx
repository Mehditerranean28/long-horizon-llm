"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import type { AppTranslations } from "@/lib/translations";

interface CookiePreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AppTranslations;
}

export function CookiePreferencesDialog({ open, onOpenChange, t }: CookiePreferencesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.cookieDialogTitle}</DialogTitle>
          <DialogDescription>{t.cookieDialogIntro}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4 text-sm">
          <div>
            <h4 className="font-semibold">{t.cookieDialogStrictlyNecessary}</h4>
            <p className="text-muted-foreground">{t.cookieDialogStrictlyNecessaryDesc}</p>
          </div>
          <div>
            <h4 className="font-semibold">{t.cookieDialogAnalytics}</h4>
            <p className="text-muted-foreground">{t.cookieDialogAnalyticsDesc}</p>
          </div>
          <div>
            <h4 className="font-semibold">{t.cookieDialogMarketing}</h4>
            <p className="text-muted-foreground">{t.cookieDialogMarketingDesc}</p>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">{t.closeSettings}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
