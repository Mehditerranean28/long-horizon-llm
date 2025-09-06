"use client";

import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import type { AppTranslations } from "@/lib/translations";

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {label}
    </Button>
  );
}

interface Props {
  t: AppTranslations;
}

export default function ContactForm({ t }: Props) {
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(formRef.current!);
    const body = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      company: String(formData.get("company") || ""),
      message: String(formData.get("message") || ""),
    };
    setPending(true);
    const { promise } = api.post<{ success: boolean }>("/public-contact", body);
    const result = await promise;
    setPending(false);
    if (result.ok) {
      toast({ title: t.savedSuccessTitle, description: t.businessContactFormSuccess });
      formRef.current?.reset();
    } else {
      toast({ title: t.errorArchivingTitle, description: t.businessContactFormFailure, variant: "destructive" });
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t.businessContactNameLabel}</Label>
          <Input id="name" name="name" placeholder={t.businessContactNamePlaceholder} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t.businessContactEmailLabel}</Label>
          <Input id="email" name="email" type="email" placeholder={t.businessContactEmailPlaceholder} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">{t.businessContactCompanyLabel}</Label>
        <Input id="company" name="company" placeholder={t.businessContactCompanyPlaceholder} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">{t.businessContactMessageLabel}</Label>
        <Textarea id="message" name="message" placeholder={t.businessContactMessagePlaceholder} required rows={5} />
      </div>
      <SubmitButton pending={pending} label={t.businessContactSubmitButton} />
    </form>
  );
}
