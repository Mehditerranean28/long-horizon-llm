"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppTranslations } from "@/lib/translations";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { api } from "@/api/client";

interface Props {
  t: AppTranslations;
}

interface CookiePreferences {
  functional: boolean;
  performance: boolean;
  targeting: boolean;
}

export default function CookieBanner({ t }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<CookiePreferences>({
    functional: true,
    performance: true,
    targeting: true,
  });

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cookie-preferences") : null;
    if (saved) {
      try {
        setPrefs(JSON.parse(saved) as CookiePreferences);
      } catch {
        // ignore parsing error
      }
    } else {
      setOpen(true);
    }
  }, []);

  const isMobile = useIsMobile();
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setOpen(false);
    setClosing(true);
  };

  useEffect(() => {
    if (closing && typeof window !== "undefined") {
      localStorage.setItem("cookie-preferences", JSON.stringify(prefs));
      api.post("/cookie-preferences", prefs);
    }
  }, [closing, prefs]);

  useEffect(() => {
    if (closing) {
      const t = setTimeout(() => setClosing(false), 200);
      return () => clearTimeout(t);
    }
  }, [closing]);

  if (!open && !closing) return null;

  const body = (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h4 className="font-semibold mr-4">{t.cookieBannerTitle}</h4>
        <button
          type="button"
          onClick={handleClose}
          className="text-sm underline"
        >
          {t.closeSettings}
        </button>
      </div>
      <p>{t.cookieBannerDescription}</p>
      <div className="space-y-2">
        <h5 className="font-medium">{t.cookieBannerConsentSelection}</h5>
        <CookieRow label={t.cookieBannerStrictlyNecessary} disabled t={t} />
        <CookieRow
          label={t.cookieBannerFunctional}
          name="functional"
          value={prefs.functional}
          onChange={(v) => setPrefs({ ...prefs, functional: v })}
          t={t}
        />
        <CookieRow
          label={t.cookieBannerPerformance}
          name="performance"
          value={prefs.performance}
          onChange={(v) => setPrefs({ ...prefs, performance: v })}
          t={t}
        />
        <CookieRow
          label={t.cookieBannerTargeting}
          name="targeting"
          value={prefs.targeting}
          onChange={(v) => setPrefs({ ...prefs, targeting: v })}
          t={t}
        />
      </div>
      <Link href="/legal/cookie-preferences" className="underline">
        {t.cookieBannerPolicy}
      </Link>
      <Link href="/legal/data-request" className="underline">
        {t.businessFooterDataRequest}
      </Link>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="p-4 text-sm space-y-4">
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 max-h-[30vh] overflow-y-auto bg-primary text-primary-foreground border-t border-primary/40 backdrop-blur-md p-4 sm:p-6 shadow-xl rounded-t-md",
        closing ? "animate-out slide-out-to-bottom" : "animate-in slide-in-from-bottom-2"
      )}
    >
      <div className="max-w-4xl mx-auto">{body}</div>
    </div>
  );
}

function CookieRow({
  label,
  name,
  value = true,
  onChange,
  disabled,
  t,
}: {
  label: string;
  name?: keyof CookiePreferences;
  value?: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
  t: AppTranslations;
}) {
  const inputName = name ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b last:border-b-0">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-4 mt-2 sm:mt-0">
        <label className="inline-flex items-center gap-1 text-green-600">
          <input
            type="radio"
            name={inputName}
            checked={value}
            onChange={() => onChange?.(true)}
            disabled={disabled}
          />
          {t.cookieBannerEnable}
        </label>
        <label className="inline-flex items-center gap-1 text-red-600">
          <input
            type="radio"
            name={inputName}
            checked={!value}
            onChange={() => onChange?.(false)}
            disabled={disabled}
          />
          {t.cookieBannerDisable}
        </label>
      </div>
    </div>
  );
}
