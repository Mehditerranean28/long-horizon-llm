"use client";
// Consolidated business styles
import "@/styles/business.css";
import dynamic from "next/dynamic";
import Header from "../../components/business/header";
import {
  type LanguageCode,
  getSavedLanguage,
  getTranslations,
} from "@/lib/translations";
import { useState, useEffect } from "react";
import { scrollToContact } from "@/utils";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Dynamically import heavy sections for better code-splitting
const ProductsSection = dynamic(
  () => import("../../components/business/sections/products"),
  { ssr: false },
);
const FeaturesSection = dynamic(
  () => import("../../components/business/sections/features"),
  { ssr: false },
);
const OrchestratorSection = dynamic(
  () => import("../../components/business/sections/orchestrator"),
  { ssr: false },
);
const WhatWeDoSection = dynamic(
  () => import("../../components/business/sections/whatwedo"),
  { ssr: false },
);
const ServicesSection = dynamic(
  () => import("../../components/business/sections/services"),
);
const ProcessSection = dynamic(
  () => import("../../components/business/sections/process"),
  { ssr: false },
);
const ContactSection = dynamic(
  () => import("../../components/business/sections/contact"),
  { ssr: false },
);
const CustomerCarousel = dynamic(
  () => import("../../components/business/sections/customer-carousel"),
  { ssr: false },
);
const ExpertiseSection = dynamic(
  () => import("../../components/business/sections/expertise"),
  { ssr: false },
);
const HeroCounters = dynamic(
  () => import("../../components/business/sections/hero-counters"),
  { ssr: false },
);

const Footer = dynamic(() => import("../../components/business/footer"), {
  ssr: false,
});
import Image from "next/image";
import CookieBanner from "../../components/settings/cookie-banner";

interface Props {
  initialLanguage?: LanguageCode;
}

export default function BusinessClient({ initialLanguage }: Props) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch("/chat");
  }, [router]);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>(
    () => initialLanguage ?? getSavedLanguage(),
  );
  const t = getTranslations(currentLanguage);
  const [isNavigating, setIsNavigating] = useState(false);
  const handleStart = () => {
    setIsNavigating(true);
    router.push("/chat");
  };
  return (
    <>
      {isNavigating && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-100/70 z-50 animate-in fade-in-0">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <Header
        currentLanguage={currentLanguage}
        onChangeLanguage={setCurrentLanguage}
      />
      <section className="hero-section">
        <div className="tmpCenter">
          <div className="row">
            <Button variant="outline" onClick={handleStart}>
              <span>
                {t.businessGetStarted}
                <span>→</span>
              </span>
            </Button>
            <Button variant="outline" onClick={scrollToContact}>
              <span>{t.businessTalkToSales}</span>
            </Button>
          </div>
        </div>
        <div className="hero-row">
          <div className="text-content">
            <h1>{t.businessHeroTitle}</h1>
            <br />
            <p className="lead">{t.businessHeroDescription}</p>
          </div>
          <div className="particles-wrapper">
            <video
              className="particles-video"
              src="/netsphere.mp4"
              muted
              autoPlay
              preload="none"
              playsInline
              loop
            />
          </div>
        </div>
        <div className="hero-flag">
          <Image src="/FLAGS.PNG" alt="Flags" width={100} height={0} />
        </div>
      <HeroCounters t={t} />
      </section>
      <WhatWeDoSection t={t} />
      <ProductsSection t={t} />
      <ServicesSection t={t} />
      <FeaturesSection t={t} />
      <OrchestratorSection t={t} />
      <ExpertiseSection t={t} />
      <ProcessSection t={t} />
      <CustomerCarousel t={t} />
      <ContactSection t={t} />
      <Footer t={t} />
      <CookieBanner t={t} />
    </>
  );
}
