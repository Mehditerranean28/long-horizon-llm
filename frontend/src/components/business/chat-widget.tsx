"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle } from "lucide-react";
import { api } from "@/api/client";
import type { AppTranslations } from "@/lib/translations";

interface ChatWidgetProps {
  t: AppTranslations;
}

interface ChatMessage {
  from: "user" | "bot";
  text: string;
}

export default function ChatWidget({ t }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ from: "bot", text: t.chatWidgetWelcome }]);
    }
  }, [open, messages.length, t.chatWidgetWelcome]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question) return;
    setMessages((prev) => [...prev, { from: "user", text: question }]);
    setInput("");
    const { promise } = api.post<{ answer: string }>("/public-chat", { question });
    const result = await promise;
    if (result.ok) {
      setMessages((prev) => [...prev, { from: "bot", text: result.value.answer }]);
    } else {
      setMessages((prev) => [...prev, { from: "bot", text: t.errorBannerMessage }]);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="fixed bottom-4 right-4 rounded-full p-3" size="icon">
          <MessageCircle className="h-6 w-6" />
          <span className="sr-only">Chat</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 flex flex-col">
        <SheetHeader>
          <SheetTitle>Chat</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-2 mt-4 text-sm">
          {messages.map((m, i) => (
            <div key={i} className={m.from === "user" ? "text-right" : "text-left"}>
              <div className="inline-block rounded-lg px-3 py-2 bg-muted">
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.contactSupportPlaceholder}
          />
          <Button onClick={handleSend}>{t.contactSupportSend}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
