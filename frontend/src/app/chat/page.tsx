import { AppLayout } from "@/components/layout/app-layout";
import { getSavedLanguage } from "@/lib/translations";


export default function SovereignPage() {
  const initialLanguage = getSavedLanguage();
  return <AppLayout initialLanguage={initialLanguage} />;
}
