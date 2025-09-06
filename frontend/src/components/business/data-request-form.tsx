"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/api/client";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}

export default function DataRequestForm({ t }: Props) {
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(formRef.current!);
    const body = {
      email: String(fd.get("email") || ""),
      requestType: String(fd.get("requestType") || ""),
      message: String(fd.get("message") || ""),
    };
    setPending(true);
    const { promise } = api.post<{ success: boolean }>("/data-request", body);
    const res = await promise;
    setPending(false);
    if (res.ok) {
      toast({ title: t.savedSuccessTitle, description: t.dataRequestSuccess });
      formRef.current?.reset();
    } else {
      toast({ title: t.errorArchivingTitle, description: t.dataRequestFailure, variant: "destructive" });
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t.dataRequestEmailLabel}</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requestType">{t.dataRequestTypeLabel}</Label>
        <select id="requestType" name="requestType" className="w-full border rounded p-2" required>
          <option value="access">{t.dataRequestTypeAccess}</option>
          <option value="deletion">{t.dataRequestTypeDeletion}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">{t.dataRequestMessageLabel}</Label>
        <Textarea id="message" name="message" rows={4} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {t.dataRequestSubmitButton}
      </Button>
    </form>
  );
}
