"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, MessageCircle } from "lucide-react";
import Logo from "./logo";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}
const Footer = ({ t }: Props) => {
  return (
    <footer className="bg-card text-card-foreground border-t">
      <div className="container mx-auto px-4 py-8 md:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/empire.png" alt="Empire" width={50} height={50} />
              <span className="font-headline text-xl font-semibold">Sovereign</span>
            </Link>
            <p className="text-sm text-muted-foreground">{t.businessFooterTagline}</p>
            <div className="text-sm text-muted-foreground">
                <p>Tunis</p>
                <p>hmidimahdi279@gmail.com</p>
                <p>+33 6 59 19 76 44</p>
            </div>
          </div>
          {/* use responsive grid with reasonable column count */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8">
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterProducts}</h4>
              <ul className="space-y-2">
                <li><Link href="/products/reasoning-system" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterReasoningSystem}</Link></li>
                <li><Link href="/products/decision-os" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterDecisionOS}</Link></li>
                <li><Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterPricing}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterCompany}</h4>
              <ul className="space-y-2">
                <li><Link href="/company/about" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterAbout}</Link></li>
                <li><Link href="/company/careers" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterCareers}</Link></li>
                <li><Link href="/company/contact" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterContact}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterResources}</h4>
              <ul className="space-y-2">
                <li><Link href="/resources/blog" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterBlog}</Link></li>
                <li><Link href="/resources/documentation" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterDocumentation}</Link></li>
                <li><Link href="/resources/whitepapers" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterWhitepapers}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterSolutions}</h4>
              <ul className="space-y-2">
                <li><Link href="/solutions/custom-software" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterSolutionCustom}</Link></li>
                <li><Link href="/solutions/legacy-modernization" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterSolutionModernization}</Link></li>
                <li><Link href="/solutions/web-app-development" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterSolutionWeb}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterPlatform}</h4>
              <ul className="space-y-2">
                <li><Link href="/platform/overview" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterPlatformOverview}</Link></li>
                <li><Link href="/platform/integrations" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterPlatformIntegrations}</Link></li>
                <li><Link href="/platform/pay" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterPlatformPay}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterTalent}</h4>
              <ul className="space-y-2">
                <li><Link href="/careers" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterTalentJoin}</Link></li>
                <li><Link href="/community" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterTalentCommunity}</Link></li>
                <li><Link href="/help" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterTalentHelp}</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterLegal}</h4>
              <ul className="space-y-2">
                <li><Link href="/legal/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterPrivacyPolicy}</Link></li>
                <li><Link href="/legal/terms-of-use" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterTerms}</Link></li>
                <li><Link href="/legal/data-request" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterDataRequest}</Link></li>
              </ul>
            </div>
          <div className="space-y-4">
              <h4 className="font-headline font-semibold">{t.businessFooterSocial}</h4>
              <ul className="space-y-2">
                <li><Link href="https://www.linkedin.com" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterLinkedIn}</Link></li>
                <li><Link href="https://twitter.com" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterTwitter}</Link></li>
                <li><Link href="https://www.instagram.com" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterInstagram}</Link></li>
                <li><Link href="https://www.facebook.com" className="text-sm text-muted-foreground hover:text-foreground">{t.businessFooterFacebook}</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="flex items-start gap-4">
            <Mail className="h-8 w-8" />
            <div className="flex flex-col text-sm">
              <span className="font-medium">{t.businessFooterEmailTitle}</span>
              <a href="mailto:hmidimahdi279@gmail.com" className="hover:underline">hmidimahdi279@gmail.com</a>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Image src="/whatsapp.svg" alt="WhatsApp" width={32} height={32} />
            <div className="flex flex-col text-sm">
              <span className="font-medium">{t.businessFooterWhatsAppTitle}</span>
              <a
                href="https://api.whatsapp.com/send?phone=33659197644&text=Hi%20Sovereign%20I%20have%20a%20question"
                target="_blank"
                rel="noopener"
                className="hover:underline"
              >
                +33 6 59 19 76 44
              </a>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <MessageCircle className="h-8 w-8" />
            <div className="flex flex-col text-sm">
              <span className="font-medium">{t.businessFooterMessageTitle}</span>
              <Link href="/company/contact" className="hover:underline">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t pt-8 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex gap-4">
            <a
              href="https://www.facebook.com/sovereign"
              className="block hover:opacity-75"
            >

            </a>
            <a
              href="https://twitter.com/sovereign"
              className="block hover:opacity-75"
            >

            </a>
            <a
              href="https://www.linkedin.com/company/sovereign/"
              className="block hover:opacity-75"
            >

            </a>
            <a
              href="https://github.com/sovereign"
              className="block hover:opacity-75"
            >

            </a>
            <a
              href="https://www.instagram.com/sovereign/"
              className="block hover:opacity-75"
            >

            </a>
            <a
              href="https://www.youtube.com/@SovereignVideos"
              className="block hover:opacity-75"
            >

            </a>
          </div>
          <div className="text-sm text-muted-foreground">
            © <span id="current-year">{new Date().getFullYear()}</span> Sovereign,
            All Rights Reserved.
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link href="/legal/privacy-policy" className="hover:underline">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/legal/terms-of-use" className="hover:underline">
              Terms
            </Link>
            <span>•</span>
            <Link href="/legal/code-of-conduct" className="hover:underline">
              Code of Conduct
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
