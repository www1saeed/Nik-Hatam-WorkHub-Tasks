import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { UiLocale } from '../utils/locale';

/**
 * LanguageService manages runtime language switching and persistence.
 *
 * This service owns:
 * - HTML `dir` + `lang` attributes (RTL/LTR control).
 * - Transloco active language.
 * - Document title that mirrors the selected locale.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly storageKey = 'nh_admin_locale';
  private readonly currentSubject: BehaviorSubject<UiLocale>;
  readonly current$;

  constructor() {
    const initial = this.readStoredLocale();
    this.currentSubject = new BehaviorSubject<UiLocale>(initial);
    this.current$ = this.currentSubject.asObservable();
    this.applyLanguage(initial);
  }

  /**
   * Set the active language and persist the choice locally.
   */
  setLanguage(locale: UiLocale): void {
    this.currentSubject.next(locale);
    localStorage.setItem(this.storageKey, locale);
    this.applyLanguage(locale);
  }

  /**
   * Get current language.
   */
  getLanguage(): UiLocale {
    return this.currentSubject.value;
  }

  private applyLanguage(locale: UiLocale): void {
    const root = this.documentRef.documentElement;
    root.lang = locale;
    root.dir = locale === 'fa' ? 'rtl' : 'ltr';
    this.transloco.setActiveLang(locale);
    if (!this.transloco.getDefaultLang()) {
      this.transloco.setDefaultLang('fa');
    }
    this.updateDocumentTitle(locale);
  }

  private updateDocumentTitle(locale: UiLocale): void {
    const title =
      locale === 'fa' ? 'نیک‌حاتم کار‌مدار' : 'Nik Hatam WorkHub';
    this.documentRef.title = title;
  }

  private readStoredLocale(): UiLocale {
    const stored = localStorage.getItem(this.storageKey);
    if (stored === 'en' || stored === 'de' || stored === 'fa') {
      return stored;
    }
    return 'fa';
  }
}

