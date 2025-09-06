import en, { lang as enLang } from './translations/en'
import fr, { lang as frLang } from './translations/fr'
import ru, { lang as ruLang } from './translations/ru'
import ja, { lang as jaLang } from './translations/ja'
import ko, { lang as koLang } from './translations/ko'
import zh, { lang as zhLang } from './translations/zh'
import ar, { lang as arLang } from './translations/ar'
import es, { lang as esLang } from './translations/es'
import de, { lang as deLang } from './translations/de'
import pt, { lang as ptLang } from './translations/pt'
import hi, { lang as hiLang } from './translations/hi'
import it, { lang as itLang } from './translations/it'
import pl, { lang as plLang } from './translations/pl'
import tr, { lang as trLang } from './translations/tr'
import nl, { lang as nlLang } from './translations/nl'
import el, { lang as elLang } from './translations/el'
import sv, { lang as svLang } from './translations/sv'
import no, { lang as noLang } from './translations/no'
import bn, { lang as bnLang } from './translations/bn'
import fa, { lang as faLang } from './translations/fa'
import he, { lang as heLang } from './translations/he'
import la, { lang as laLang } from './translations/la'
import amz, { lang as amzLang } from './translations/amz'
import mn, { lang as mnLang } from './translations/mn'
import ro, { lang as roLang } from './translations/ro'
import fi, { lang as fiLang } from './translations/fi'
import et, { lang as etLang } from './translations/et'
import az, { lang as azLang } from './translations/az'
import ka, { lang as kaLang } from './translations/ka'
import ti, { lang as tiLang } from './translations/ti'
import sw, { lang as swLang } from './translations/sw'
import hu, { lang as huLang } from './translations/hu'
import bg, { lang as bgLang } from './translations/bg'
import hr, { lang as hrLang } from './translations/hr'
import cs, { lang as csLang } from './translations/cs'
import da, { lang as daLang } from './translations/da'
import ga, { lang as gaLang } from './translations/ga'
import lv, { lang as lvLang } from './translations/lv'
import lt, { lang as ltLang } from './translations/lt'
import sk, { lang as skLang } from './translations/sk'
import ur, { lang as urLang } from './translations/ur'
import pa, { lang as paLang } from './translations/pa'
import mr, { lang as mrLang } from './translations/mr'
import ta, { lang as taLang } from './translations/ta'
import te, { lang as teLang } from './translations/te'
import gu, { lang as guLang } from './translations/gu'
import vi, { lang as viLang } from './translations/vi'
import id, { lang as idLang } from './translations/id'
import ms, { lang as msLang } from './translations/ms'
import th, { lang as thLang } from './translations/th'
import my, { lang as myLang } from './translations/my'
import km, { lang as kmLang } from './translations/km'
import yo, { lang as yoLang } from './translations/yo'
import ha, { lang as haLang } from './translations/ha'
import ig, { lang as igLang } from './translations/ig'
import uk, { lang as ukLang } from './translations/uk'
import sl, { lang as slLang } from './translations/sl'
import hy, { lang as hyLang } from './translations/hy'
import jv, { lang as jvLang } from './translations/jv'
import tl, { lang as tlLang } from './translations/tl'
import uz, { lang as uzLang } from './translations/uz'
import kk, { lang as kkLang } from './translations/kk'
import tg, { lang as tgLang } from './translations/tg'
import cy, { lang as cyLang } from './translations/cy'
import so, { lang as soLang } from './translations/so'


export const langs = [
  enLang,
  frLang,
  ruLang,
  jaLang,
  koLang,
  zhLang,
  arLang,
  amzLang,
  esLang,
  deLang,
  ptLang,
  hiLang,
  itLang,
  plLang,
  trLang,
  nlLang,
  elLang,
  svLang,
  noLang,
  bnLang,
  faLang,
  heLang,
  laLang,
  mnLang,
  roLang,
  fiLang,
  etLang,
  azLang,
  kaLang,
  tiLang,
  swLang,
  huLang,
  bgLang,
  hrLang,
  csLang,
  daLang,
  gaLang,
  lvLang,
  ltLang,
  skLang,
  urLang,
  paLang,
  mrLang,
  taLang,
  teLang,
  guLang,
  viLang,
  idLang,
  msLang,
  thLang,
  myLang,
  kmLang,
  yoLang,
  haLang,
  igLang,
  ukLang,
  slLang,
  hyLang,
  jvLang,
  tlLang,
  uzLang,
  kkLang,
  tgLang,
  cyLang,
  soLang,
] as const

export const translations = {
  en,
  fr,
  ru,
  ja,
  ko,
  zh,
  ar,
  es,
  de,
  pt,
  hi,
  it,
  pl,
  tr,
  nl,
  el,
  sv,
  no,
  bn,
  fa,
  he,
  la,
  amz,
  mn,
  ro,
  fi,
  et,
  az,
  ka,
  ti,
  sw,
  hu,
  bg,
  hr,
  cs,
  da,
  ga,
  lv,
  lt,
  sk,
  ur,
  pa,
  mr,
  ta,
  te,
  gu,
  vi,
  id,
  ms,
  th,
  my,
  km,
  yo,
  ha,
  ig,
  uk,
  sl,
  hy,
  jv,
  tl,
  uz,
  kk,
  tg,
  cy,
  so,
};

export type LanguageCode = keyof typeof translations;
export type AppTranslations = typeof translations.en; // Or any language as the base structure

export const getSavedLanguage = (): LanguageCode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('app-language') as LanguageCode | null;
    if (saved && saved in translations) {
      return saved;
    }
  }
  return 'en';
};


export const getTranslations = (lang: LanguageCode): AppTranslations => {
  return { ...translations.en, ...(translations[lang] || {}) } as AppTranslations;
};
