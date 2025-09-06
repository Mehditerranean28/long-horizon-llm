import type { Metadata } from "next";
import DataRequestForm from "@/components/business/data-request-form";
import { getSavedLanguage, getTranslations, type LanguageCode } from "@/lib/translations";


export const metadata: Metadata = {
  title: "Data Request - Sovereign",
  description: "Request access to or deletion of your personal data.",
};

export default function DataRequestPage() {
  const lang = getSavedLanguage();
  const t = getTranslations(lang);
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-semibold mb-4">{t.dataRequestTitle}</h1>
      <p className="mb-4">{t.dataRequestIntro}</p>
      <DataRequestForm t={t} />
    </div>
  );
}
