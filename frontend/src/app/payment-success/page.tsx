import PaymentSuccessClient from "./client";
import { getSavedLanguage } from "@/lib/translations";


export default function PaymentSuccessPage() {
  const initialLanguage = getSavedLanguage();
  return <PaymentSuccessClient initialLanguage={initialLanguage} />;
}
