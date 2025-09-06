import BusinessClient from "./client";
import {
  getSavedLanguage,
  getTranslations,
  type LanguageCode,
} from "@/lib/translations";

export function generateMetadata() {
  const lang = getSavedLanguage();
  const t = getTranslations(lang);
  return {
    title: t.businessMetaTitle,
    description:
      "Sovereign Consulting partners with mid-to-large enterprises to design, build, and deploy AI-powered solutions that streamline operations, elevate decision-making, and drive sustainable growth.",
    keywords: [
      "AI-powered automation",
      "deterministic reasoning",
      "decision making",
      "sovereign",
    ],
  };
}

export default function BusinessPage() {
  const lang = getSavedLanguage();
  return <BusinessClient initialLanguage={lang} />;
}
