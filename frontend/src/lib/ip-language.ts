export type CountryCode = string;

import type { LanguageCode } from './translations';
export type { LanguageCode } from './translations';

export interface IpInfo {
  ip?: string;
  country_name?: string;
  country_code?: string;
  city?: string;
  region?: string;
  timezone?: string;
  languages?: string;
  [key: string]: any;
}

export async function fetchIpInfo(): Promise<IpInfo | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as IpInfo;
  } catch (err) {
    console.error('Failed to fetch IP info', err);
    return null;
  }
}

const LANGUAGE_BY_COUNTRY: Record<string, LanguageCode> = {
  US: 'en',
  GB: 'en',
  CA: 'en',
  AU: 'en',
  IE: 'en',
  NZ: 'en',
  SG: 'en',
  PH: 'en',
  PK: 'en',
  FR: 'fr',
  BE: 'fr',
  RU: 'ru',
  JP: 'ja',
  KR: 'ko',
  KP: 'ko',
  CN: 'zh',
  TW: 'zh',
  HK: 'zh',
  NL: 'nl',
  DZ: 'fr',
  MA: 'fr',
  SN: 'fr',
  CI: 'fr',
  CM: 'fr',
  BF: 'fr',
  NE: 'fr',
  ML: 'fr',
  GN: 'fr',
  TG: 'fr',
  BJ: 'fr',
  CG: 'fr',
  CD: 'fr',
  CF: 'fr',
  TD: 'fr',
  GA: 'fr',
  DJ: 'fr',
  MG: 'fr',
  TN: 'ar',
  AE: 'ar',
  SA: 'ar',
  EG: 'ar',
  JO: 'ar',
  IQ: 'ar',
  KW: 'ar',
  QA: 'ar',
  BH: 'ar',
  OM: 'ar',
  ES: 'es',
  CL: 'es',
  PE: 'es',
  VE: 'es',
  EC: 'es',
  UY: 'es',
  PY: 'es',
  BO: 'es',
  GT: 'es',
  HN: 'es',
  NI: 'es',
  PA: 'es',
  CR: 'es',
  DO: 'es',
  CU: 'es',
  PR: 'es',
  SV: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  GQ: 'es',
  PT: 'pt',
  BR: 'pt',
  AO: 'pt',
  MZ: 'pt',
  CV: 'pt',
  GW: 'pt',
  ST: 'pt',
  TL: 'pt',
  DE: 'de',
  IN: 'hi',
  IT: 'it',
  PL: 'pl',
  TR: 'tr',
  GR: 'el',
  SE: 'sv',
  NO: 'no',
  BD: 'bn',
  IR: 'fa',
  IL: 'he',
};

export async function getLanguageFromIP(): Promise<LanguageCode | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string };
    const country = data.country_code as string | undefined;
    if (!country) return null;
    return LANGUAGE_BY_COUNTRY[country] ?? null;
  } catch {
    return null;
  }
}
