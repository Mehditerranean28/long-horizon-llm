import type { Metadata } from "next";
import ContactSection from "@/components/business/sections/contact";
import {
  getSavedLanguage,
  getTranslations,
  type LanguageCode,
} from "@/lib/translations";

export const metadata: Metadata = {
  title: "Careers - Sovereign",
  description: "Explore career opportunities with the Sovereign team.",
};

export default function CareersPage() {
  const lang = getSavedLanguage();
  const t = getTranslations(lang);
  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold mb-4">Careers at Sovereign</h1>
        <p className="mb-2">
          We are always looking for talented individuals to join our mission. If
          you don&apos;t see an open role that fits, contact us using the form
          below.
        </p>
      </div>
      <ContactSection t={t} />
    </div>
  );
}
