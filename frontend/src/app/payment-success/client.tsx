"use client";

import { useEffect, useState } from "react";
// Corrected import paths to be relative for better compilation compatibility
import { toast } from "../../hooks/use-toast"; // Adjust path as per your project structure
import { getTranslations, getSavedLanguage, type LanguageCode, type AppTranslations, translations } from "../../lib/translations"; // Adjust path as per your project structure

/**
 * PaymentSuccessPage component.
 * This page is displayed after a successful payment transaction.
 * It manages language-specific translations for display texts and toast notifications.
 */
interface Props {
  initialLanguage?: LanguageCode;
}

export default function PaymentSuccessClient({ initialLanguage }: Props) {
  // Initialize translations based on the saved language from local storage.
  // The state `t` will hold the current application translations.
  const [t, setT] = useState<AppTranslations>(() => getTranslations(initialLanguage ?? getSavedLanguage()));

  /**
   * useEffect hook to dynamically set translations.
   * This ensures that translations are loaded and applied correctly when the component mounts
   * or if the window object becomes available (relevant for Next.js SSR hydration).
   */
  useEffect(() => {
    // Check if window is defined to ensure this runs client-side.
    if (typeof window !== "undefined") {
      const savedLanguage: LanguageCode = getSavedLanguage(); // Retrieve the user's saved language
      setT(getTranslations(savedLanguage)); // Update the translations state
    }
  }, []); // Empty dependency array means this effect runs once after initial render

  /**
   * useEffect hook to display a toast notification on successful payment.
   * This effect runs when `t.upgradeSuccessTitle` or `t.upgradeSuccessDescription` change,
   * ensuring the toast message is always in the correct language.
   */
  useEffect(() => {
    // Display a toast notification with a success message.
    // The message content is dynamically pulled from the `t` (translations) state.
    toast({
      title: t.upgradeSuccessTitle,       // Title for the toast notification
      description: t.upgradeSuccessDescription, // Description for the toast notification
      variant: "default",                  // Default styling variant for the toast
      className: "bg-green-500 text-white", // Custom Tailwind CSS classes for success styling
    });
  }, [t.upgradeSuccessTitle, t.upgradeSuccessDescription]); // Dependencies: Re-run when translation strings change

  /**
   * Renders the payment success page content.
   * Displays a confirmation message to the user.
   */
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-semibold mb-4">{t.paymentSuccessTitle}</h1>
      <p className="text-muted-foreground">{t.paymentSuccessDescription}</p>
      {/* Display translated confirmation message if provided */}
      <p className="text-muted-foreground">{t.paymentConfirmationMessage}</p>
    </div>
  );
}
