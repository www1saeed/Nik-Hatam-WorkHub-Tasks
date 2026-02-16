import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from './language.service';

class TranslocoServiceStub {
  active = 'fa';
  defaultLang: string | null = null;

  setActiveLang(lang: string): void {
    this.active = lang;
  }

  setDefaultLang(lang: string): void {
    this.defaultLang = lang;
  }

  getDefaultLang(): string | null {
    return this.defaultLang;
  }
}

describe('LanguageService', () => {
  let service: LanguageService;
  let doc: Document;
  let transloco: TranslocoServiceStub;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslocoService, useClass: TranslocoServiceStub },
      ]
    });
    service = TestBed.inject(LanguageService);
    doc = TestBed.inject(DOCUMENT);
    transloco = TestBed.inject(TranslocoService) as unknown as TranslocoServiceStub;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes from storage', () => {
    service.setLanguage('en');
    expect(service.getLanguage()).toBe('en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.documentElement.dir).toBe('ltr');
    expect(transloco.active).toBe('en');
  });

  it('defaults to fa and sets title', () => {
    localStorage.removeItem('nh_admin_locale');
    service.setLanguage('fa');
    expect(doc.documentElement.lang).toBe('fa');
    expect(doc.documentElement.dir).toBe('rtl');
    expect(doc.title.length).toBeGreaterThan(0);
  });
});
