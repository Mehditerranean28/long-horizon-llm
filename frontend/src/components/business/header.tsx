"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { scrollToContact } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Image from "next/image";
import LanguageSelector from "@/components/ui/language-selector";
import ThemeSwitcher from "./theme-switcher";
import {
  type LanguageCode,
  type AppTranslations,
  getTranslations,
} from "@/lib/translations";

const WhySovereignDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <div className="submenu-column submenu-column__one">
      <div className="submenu-sub-column">
        <div className="submenu-level1">
          <div className="submenu-level1__item submenu-level1__item-why">
            <Link href="/why-sovereign" className="submenu-link w-inline-block">
              <div className="submenu-level1__item-title">
                {t.businessWhyDropdownMainTitle}
              </div>
              <p className="submenu-level1__item-desc submenu-level1__item-desc-why">
                {t.businessWhyDropdownMainDescription}
              </p>
              <div className="submenu-level1__item-cta">
                {t.businessWhyDropdownLearnMore}
              </div>
            </Link>
          </div>
        </div>
      </div>
      <div className="submenu-sub-column">
        <div className="submenu-level2">
          <div className="submenu-level2__item">
            <Link
              href="/our-talent-community"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level2__item-inner">
                <div className="submenu-level2__item-title">
                  {t.businessWhyDropdownTalentCommunityTitle}
                </div>
                <p className="submenu-level2__item-desc">
                  {t.businessWhyDropdownTalentCommunityDescription}
                </p>
              </div>
            </Link>
          </div>
          <div className="submenu-level2__item">
            <Link
              href="/untapped-talent-markets"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level2__item-inner">
                <div className="submenu-level2__item-title">
                  {t.businessWhyDropdownUntappedTitle}
                </div>
                <p className="submenu-level2__item-desc">
                  {t.businessWhyDropdownUntappedDescription}
                </p>
              </div>
            </Link>
          </div>
          <div className="submenu-level2__item">
            <Link
              href="/why-sovereign/mission-focused"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level2__item-inner">
                <div className="submenu-level2__item-title">
                  {t.businessWhyDropdownMissionTitle}
                </div>
                <p className="submenu-level2__item-desc">
                  {t.businessWhyDropdownMissionDescription}
                </p>
              </div>
            </Link>
          </div>
        </div>
        <div className="submenu-level3">
          <div className="submenu-level3__title">
            {t.businessWhyDropdownImpactTitle}
          </div>
          <div className="submenu-level3__item">
            <Link
              href="/customer-stories"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level3__item-title">
                {t.businessWhyDropdownCustomerStories}
              </div>
            </Link>
          </div>
          <div className="submenu-level3__item">
            <Link
              href="/forrester-tei-study"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level3__item-title">
                {t.businessWhyDropdownTEIStudy}
              </div>
            </Link>
          </div>
          <div className="submenu-level3__item">
            <Link
              href="/humans-of-sovereign"
              className="submenu-link w-inline-block"
            >
              <div className="submenu-level3__item-title">
                {t.businessWhyDropdownHumans}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
    <div className="submenu-column submenu-column__two">
      <div className="submenu-post">
        <Link
          href="/blog-posts/5-steps-to-building-a-successful-global-team"
          className="submenu-link w-inline-block"
        >
          <div className="submenu-post__inner">
            <div className="submenu-post__img-wrapper">

            </div>
            <div className="submenu-post__inner-content">
              <div className="submenu-post__category">
                {t.businessWhyDropdownInsights}
              </div>
              <div className="submenu-post__title">
                {t.businessWhyDropdownBlogTitle}
              </div>
              <div className="submenu-post__cta">
                {t.businessWhyDropdownLearnMore}
              </div>
            </div>
          </div>
        </Link>
      </div>

    </div>
  </div>
);

const ProductsDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <p className="p-4 text-sm text-muted-foreground">
      {t.businessProductsDropdownText}
    </p>
  </div>
);

const PricingDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <p className="p-4 text-sm text-muted-foreground">
      {t.businessPricingDropdownText}
    </p>
  </div>
);

const CompanyDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <p className="p-4 text-sm text-muted-foreground">
      {t.businessCompanyDropdownText}
    </p>
  </div>
);

const JobsDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <p className="p-4 text-sm text-muted-foreground">
      {t.businessJobsDropdownText}
    </p>
  </div>
);

const ContactDropdownContent = ({ t }: { t: AppTranslations }) => (
  <div className="submenu__wrapper">
    <p className="p-4 text-sm text-muted-foreground">
      {t.businessContactDropdownText}
    </p>
  </div>
);

interface Props {
  currentLanguage: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
}

const Header = ({ currentLanguage, onChangeLanguage }: Props) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const t = getTranslations(currentLanguage);

  const navItems = [
    {
      label: t.businessProducts,
      items: [
        { href: "/products/decision-os", label: t.businessFooterDecisionOS },
        {
          href: "/products/reasoning-system",
          label: t.businessFooterReasoningSystem,
        },
      ],
      content: <ProductsDropdownContent t={t} />,
    },
    {
      label: t.businessWhySovereign,
      items: [
        { href: "/why-sovereign", label: t.businessWhyDropdownMainTitle },
        {
          href: "/our-talent-community",
          label: t.businessWhyDropdownTalentCommunityTitle,
        },
        {
          href: "/untapped-talent-markets",
          label: t.businessWhyDropdownUntappedTitle,
        },
        {
          href: "/why-sovereign/mission-focused",
          label: t.businessWhyDropdownMissionTitle,
        },
        {
          href: "/customer-stories",
          label: t.businessWhyDropdownCustomerStories,
        },
        {
          href: "/forrester-tei-study",
          label: t.businessWhyDropdownTEIStudy,
        },
        {
          href: "/humans-of-sovereign",
          label: t.businessWhyDropdownHumans,
        },
        {
          href: "/blog-posts/5-steps-to-building-a-successful-global-team",
          label: t.businessWhyDropdownBlogTitle,
        },
      ],
      content: <WhySovereignDropdownContent t={t} />,
    },
    {
      label: t.businessPricing,
      items: [{ href: "/pricing", label: t.businessPricing }],
      content: <PricingDropdownContent t={t} />,
    },
    {
      label: t.businessCompany,
      items: [
        { href: "/company/about", label: t.businessFooterAbout },
        { href: "/company/careers", label: t.businessFooterCareers },
        { href: "/company/contact", label: t.businessFooterContact },
      ],
      content: <CompanyDropdownContent t={t} />,
    },
    {
      label: t.businessJobs,
      items: [{ href: "/jobs", label: t.businessJobs }],
      content: <JobsDropdownContent t={t} />,
    },
    {
      label: t.businessContact,
      items: [{ href: "/company/contact", label: t.businessFooterContact }],
      content: <ContactDropdownContent t={t} />,
    },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-150 ${isScrolled ? "bg-card/80 backdrop-blur-md border-b" : "bg-transparent"}`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/theranthrope.png"
            alt={t.appTitle}
            width={28}
            height={28}
            priority
          />
          <span className="font-headline text-xl font-semibold text-foreground">
            {t.appTitle}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map(({ label, items, content }) => (
            <DropdownMenu key={label}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="p-0 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={scrollToContact}
                >
                  {label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {content
                  ? content
                  : items.map(({ href, label: itemLabel }) => (
                      <DropdownMenuItem key={href} asChild>
                        <a href="#contact" onClick={scrollToContact}>{itemLabel}</a>
                      </DropdownMenuItem>
                    ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <ThemeSwitcher label={t.themeSwitcherLabel} />
          <LanguageSelector
            currentLanguage={currentLanguage}
            onChange={onChangeLanguage}
            size="2em"
          />
        </div>
        <div className="md:hidden">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
            <SheetTitle asChild>
                <VisuallyHidden>{t.mobileNavigationLabel}</VisuallyHidden>
              </SheetTitle>
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center border-b pb-4">
                  <Link
                    href="/"
                    className="flex items-center gap-2"
                    onClick={closeMobileMenu}
                  >
                    <Image
                      src="/theranthrope.png"
                      alt={t.appTitle}
                      width={28}
                      height={28}
                      priority
                    />
                    <span className="font-headline text-xl font-semibold text-foreground">
                      {t.appTitle}
                    </span>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={closeMobileMenu}>
                    <X />
                  </Button>
                </div>
                <nav className="flex flex-col gap-6 mt-8">
                  {navItems.map(({ label, items }) => (
                    <div key={label} className="flex flex-col gap-2">
                      <span className="text-lg font-medium text-foreground">
                        {label}
                      </span>
                      <div className="ml-4 flex flex-col gap-2">
                        {items.map(({ href, label: itemLabel }) => (
                          <a
                            key={href}
                            href="#contact"
                            className="text-muted-foreground hover:text-primary"
                            onClick={() => {
                              closeMobileMenu();
                              scrollToContact();
                            }}
                          >
                            {itemLabel}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="mt-auto border-t pt-4 flex gap-2">
                  <ThemeSwitcher label={t.themeSwitcherLabel} />
                  <LanguageSelector
                    currentLanguage={currentLanguage}
                    onChange={onChangeLanguage}
                    size="2em"
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
