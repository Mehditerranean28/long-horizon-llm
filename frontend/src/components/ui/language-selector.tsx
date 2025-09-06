"use client";

import { useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { LanguageMenuItem } from "@/components/ui/language-menu-item";
import {
  type LanguageCode,
  getTranslations,
} from "@/lib/translations";
import { Globe } from "lucide-react";
import ReactCountryFlag from "react-country-flag";

interface Props {
  currentLanguage: LanguageCode;
  onChange: (lang: LanguageCode) => void;
  /** Size for the flag/icon displayed in the trigger */
  size?: string;
}

interface LanguageOption {
  code: LanguageCode;
  label: string;
  countryCode?: string;
  icon?: string;
}

const RAW_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", label: "English",     countryCode: "US" },  // US: $27.36 T
  { code: "zh", label: "中文 (简体)", countryCode: "CN" },  // CN: $17.79 T
  { code: "de", label: "Deutsch",      countryCode: "DE" },  // DE:  $4.46 T
  { code: "ja", label: "日本語",        countryCode: "JP" },  // JP:  $4.21 T
  { code: "ar", label: "العربية",      countryCode: "TN" },  // TN:   $0.04 T
  { code: "hi", label: "हिंदी",        countryCode: "IN" },  // IN:  $3.55 T
  { code: "pa", label: "ਪੰਜਾਬੀ",      countryCode: "IN" },
  { code: "mr", label: "मराठी",       countryCode: "IN" },
  { code: "ta", label: "தமிழ்",       countryCode: "IN" },
  { code: "te", label: "తెలుగు",      countryCode: "IN" },
  { code: "gu", label: "ગુજરાતી",      countryCode: "IN" },
  { code: "cy", label: "Cymraeg",      countryCode: "GB" },  // GB:  $3.34 T
  { code: "fr", label: "Français",     countryCode: "FR" },  // FR:  $3.03 T
  { code: "it", label: "Italiano",     countryCode: "IT" },  // IT:  $2.25 T
  { code: "ru", label: "Русский",      countryCode: "RU" },  // RU:  $2.02 T
  { code: "ko", label: "한국어",        countryCode: "KR" },  // KR:  $1.58 T
  { code: "es", label: "Español",      countryCode: "ES" },  // ES:  $1.28 T
  { code: "id", label: "Bahasa Indonesia", countryCode: "ID" }, // ID: $1.03 T
  { code: "jv", label: "Basa Jawa",    countryCode: "ID" },
  { code: "tr", label: "Türkçe",       countryCode: "TR" },  // TR:   $0.91 T
  { code: "nl", label: "Nederlands",   countryCode: "NL" },  // NL:   $0.99 T
  { code: "pl", label: "Polski",       countryCode: "PL" },  // PL:   $0.88 T
  { code: "sv", label: "Svenska",      countryCode: "SE" },  // SE:   $0.62 T
  { code: "th", label: "ไทย",          countryCode: "TH" },  // TH:   $0.54 T
  { code: "ga", label: "Gaeilge",      countryCode: "IE" },  // IE:   $0.58 T
  { code: "no", label: "Norsk",        countryCode: "NO" },  // NO:   $0.54 T
  { code: "fa", label: "فارسی",        countryCode: "IR" },  // IR:   $0.43 T
  { code: "ms", label: "Bahasa Melayu", countryCode: "MY" }, // MY:   $0.44 T
  { code: "yo", label: "Yorùbá",       countryCode: "NG" },  // NG:   $0.48 T
  { code: "ha", label: "Hausa",        countryCode: "NG" },
  { code: "ig", label: "Igbo",         countryCode: "NG" },
  { code: "bn", label: "বাংলা",        countryCode: "BD" },  // BD:   $0.42 T
  { code: "vi", label: "Tiếng Việt",   countryCode: "VN" },  // VN:   $0.41 T
  { code: "tl", label: "Filipino",     countryCode: "PH" },  // PH:   $0.40 T
  { code: "ur", label: "اردو",         countryCode: "PK" },  // PK:   $0.38 T
  { code: "da", label: "Dansk",        countryCode: "DK" },  // DK:   $0.38 T
  { code: "cs", label: "Čeština",      countryCode: "CZ" },  // CZ:   $0.32 T
  { code: "ro", label: "Română",       countryCode: "RO" },  // RO:   $0.28 T
  { code: "fi", label: "Suomi",        countryCode: "FI" },  // FI:   $0.29 T
  { code: "pt", label: "Português",    countryCode: "PT" },  // PT:   $0.28 T
  { code: "el", label: "Ελληνικά",     countryCode: "GR" },  // GR:   $0.23 T
  { code: "hu", label: "Magyar",       countryCode: "HU" },  // HU:   $0.24 T
  { code: "uk", label: "Українська",   countryCode: "UA" },  // UA:   $0.20 T
  { code: "az", label: "Azərbaycan",  countryCode: "AZ" },  // AZ:   $0.09 T
  { code: "bg", label: "Български",    countryCode: "BG" },  // BG:   $0.08 T
  { code: "sk", label: "Slovenčina",   countryCode: "SK" },  // SK:   $0.11 T
  { code: "hr", label: "Hrvatski",     countryCode: "HR" },  // HR:   $0.07 T
  { code: "sl", label: "Slovenščina",  countryCode: "SI" },  // SI:   $0.07 T
  { code: "lt", label: "Lietuvių",     countryCode: "LT" },  // LT:   $0.07 T
  { code: "lv", label: "Latviešu",     countryCode: "LV" },  // LV:   $0.04 T
  { code: "et", label: "Eesti",        countryCode: "EE" },  // EE:   $0.04 T
  { code: "km", label: "ភាសាខ្មែរ",    countryCode: "KH" },  // KH:   $0.03 T
  { code: "ka", label: "ქართული",      countryCode: "GE" },  // GE:   $0.03 T
  { code: "hy", label: "Հայերեն",      countryCode: "AM" },  // AM:   $0.02 T
  { code: "mn", label: "Монгол",       countryCode: "MN" },  // MN:   $0.013 T
  { code: "ti", label: "ትግርኛ",      countryCode: "ER" },  // ER:   $0.002 T
  { code: "uz", label: "Oʻzbek",       countryCode: "UZ" },  // UZ:   $0.085 T
  { code: "kk", label: "Қазақ",        countryCode: "KZ" },  // KZ:   $0.29 T
  { code: "tg", label: "Тоҷикӣ",      countryCode: "TJ" },  // TJ:   $0.012 T
  { code: "my", label: "မြန်မာဘာသာ", countryCode: "MM" },  // MM:   $0.087 T
  { code: "la", label: "Latin",        icon: "🦅" },          // no GDP
  { code: "he", label: "עברית",       countryCode: "IL" },  // IL:   $0.52 T
];

// Move languages from countries that appear multiple times to the
// bottom of the list (e.g. many languages from India or Nigeria).
const LANGUAGE_OPTIONS: LanguageOption[] = (() => {
  const counts: Record<string, number> = {};
  for (const opt of RAW_LANGUAGE_OPTIONS) {
    if (opt.countryCode) {
      counts[opt.countryCode] = (counts[opt.countryCode] || 0) + 1;
    }
  }
  const uniques = RAW_LANGUAGE_OPTIONS.filter(
    (o) => !o.countryCode || counts[o.countryCode] === 1,
  );
  const duplicates = RAW_LANGUAGE_OPTIONS.filter(
    (o) => o.countryCode && counts[o.countryCode] > 1,
  );
  return [...uniques, ...duplicates];
})();

export function LanguageSelector({ currentLanguage, onChange, size = "1.4em" }: Props) {
  const handleSelect = useCallback(
    (lang: LanguageCode) => {
      onChange(lang);
      if (typeof window !== "undefined") {
        localStorage.setItem("app-language", lang);
      }
    },
    [onChange],
  );

  const t = getTranslations(currentLanguage);

  const selectedOption = LANGUAGE_OPTIONS.find(
    (opt) => opt.code === currentLanguage,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="p-0"
          aria-label={t.languageSwitcherLabel}
          data-testid="language-selector-trigger"
        >
          {selectedOption?.countryCode ? (
            <ReactCountryFlag
              svg
              countryCode={selectedOption.countryCode}
              style={{ width: size, height: size }}
            />
          ) : selectedOption?.icon ? (
            <span
              style={{ width: size, height: size, display: 'inline-block' }}
            >
              {selectedOption.icon}
            </span>
          ) : (
            <Globe style={{ width: size, height: size }} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="p-0">
        <ScrollArea className="h-60 p-1 scrollbar-none">
          <DropdownMenuLabel>{t.languageSwitcherLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LANGUAGE_OPTIONS.map((opt) => (
            <LanguageMenuItem
              key={opt.code}
              onSelect={() => handleSelect(opt.code)}
              countryCode={opt.countryCode}
              icon={opt.icon}
              label={opt.label}
              languageCode={opt.code}
            />
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSelector;

