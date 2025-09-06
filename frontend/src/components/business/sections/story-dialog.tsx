"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Story } from "../../../app/customer-stories/stories";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  story: Story;
  children: ReactNode;
  t: AppTranslations;
}

export default function StoryDialog({ story, children, t }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{story.title}</DialogTitle>
          <DialogDescription>{story.service}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          {story.paragraphs.map((p, idx) => (
            <p key={idx}>{p}</p>
          ))}
        </div>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="mt-4">
            {t.closeButton}
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
