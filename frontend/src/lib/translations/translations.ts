
import en, { lang as enLang } from './en'
import fr, { lang as frLang } from './fr'
import ru, { lang as ruLang } from './ru'
import ja, { lang as jaLang } from './ja'
import ko, { lang as koLang } from './ko'
import zh, { lang as zhLang } from './zh'
import ar, { lang as arLang } from './ar'
import es, { lang as esLang } from './es'
import de, { lang as deLang } from './de'
import pt, { lang as ptLang } from './pt'
import hi, { lang as hiLang } from './hi'
import it, { lang as itLang } from './it'
import pl, { lang as plLang } from './pl'
import tr, { lang as trLang } from './tr'
import nl, { lang as nlLang } from './nl'
import el, { lang as elLang } from './el'
import sv, { lang as svLang } from './sv'
import no, { lang as noLang } from './no'
import bn, { lang as bnLang } from './bn'
import fa, { lang as faLang } from './fa'
import he, { lang as heLang } from './he'
import la, { lang as laLang } from './la'
import amz, { lang as amzLang } from './amz'
import mn, { lang as mnLang } from './mn'
import ro, { lang as roLang } from './ro'
import fi, { lang as fiLang } from './fi'
import et, { lang as etLang } from './et'
import az, { lang as azLang } from './az'
import ka, { lang as kaLang } from './ka'
import ti, { lang as tiLang } from './ti'
import sw, { lang as swLang } from './sw'
import hu, { lang as huLang } from './hu'
import bg, { lang as bgLang } from './bg'
import hr, { lang as hrLang } from './hr'
import cs, { lang as csLang } from './cs'
import da, { lang as daLang } from './da'
import ga, { lang as gaLang } from './ga'
import lv, { lang as lvLang } from './lv'
import lt, { lang as ltLang } from './lt'
import sk, { lang as skLang } from './sk'
import ur, { lang as urLang } from './ur'
import pa, { lang as paLang } from './pa'
import mr, { lang as mrLang } from './mr'
import ta, { lang as taLang } from './ta'
import te, { lang as teLang } from './te'
import gu, { lang as guLang } from './gu'
import vi, { lang as viLang } from './vi'
import id, { lang as idLang } from './id'
import ms, { lang as msLang } from './ms'
import th, { lang as thLang } from './th'
import my, { lang as myLang } from './my'
import km, { lang as kmLang } from './km'
import yo, { lang as yoLang } from './yo'
import ha, { lang as haLang } from './ha'
import ig, { lang as igLang } from './ig'
import uk, { lang as ukLang } from './uk'
import sl, { lang as slLang } from './sl'
import hy, { lang as hyLang } from './hy'
import jv, { lang as jvLang } from './jv'
import tl, { lang as tlLang } from './tl'
import uz, { lang as uzLang } from './uz'
import kk, { lang as kkLang } from './kk'
import tg, { lang as tgLang } from './tg'
import cy, { lang as cyLang } from './cy'
import so, { lang as soLang } from './so'


export const langs = [
  enLang,
  frLang,
  ruLang,
  jaLang,
  koLang,
  zhLang,
  arLang,
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
  amzLang,
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


