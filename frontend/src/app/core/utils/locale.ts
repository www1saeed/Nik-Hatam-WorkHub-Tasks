export type UiLocale = 'fa' | 'en' | 'de';
export type ApiLocale = 'fa' | 'en';

export const normalizeApiLocale = (locale: UiLocale): ApiLocale => (locale === 'fa' ? 'fa' : 'en');

