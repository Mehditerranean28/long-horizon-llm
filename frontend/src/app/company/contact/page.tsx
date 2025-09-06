import type { Metadata } from "next";
import ContactSection from "@/components/business/sections/contact";
import { getSavedLanguage, getTranslations, type LanguageCode } from "@/lib/translations";

export const metadata: Metadata = {
  title: "Contact - Sovereign",
  description: "Get in touch with the Sovereign team for collaborations and support.",
};

export default function ContactPage() {
  const lang = getSavedLanguage();
  const t = getTranslations(lang);
  return (
    <div className="container mx-auto p-8">
      <ContactSection t={t} />
    </div>
  );
}
