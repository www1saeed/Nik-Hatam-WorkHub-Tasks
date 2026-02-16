import { HttpRequest, HttpHandlerFn, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { lastValueFrom, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { authTokenInterceptor } from './auth-token.interceptor';
import { UiLocale } from '../utils/locale';

class AuthServiceStub {
  token: string | null = null;
  getToken(): string | null {
    return this.token;
  }
}

class LanguageServiceStub {
  lang: UiLocale = 'fa';
  getLanguage(): UiLocale {
    return this.lang;
  }
}

describe('authTokenInterceptor', () => {
  let auth: AuthServiceStub;
  let language: LanguageServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: LanguageService, useClass: LanguageServiceStub },
      ]
    });

    auth = TestBed.inject(AuthService) as unknown as AuthServiceStub;
    language = TestBed.inject(LanguageService) as unknown as LanguageServiceStub;
  });

  it('adds only Accept-Language without token', async () => {
    const req = new HttpRequest('GET', '/api/test');
    const next: HttpHandlerFn = (cloned) => {
      expect(cloned.headers.get('Accept-Language')).toBe('fa');
      expect(cloned.headers.has('Authorization')).toBe(false);
      return of(new HttpResponse({ status: 200 }));
    };

    await lastValueFrom(TestBed.runInInjectionContext(() => authTokenInterceptor(req, next)));
  });

  it('adds bearer token and language header', async () => {
    auth.token = 'abc123';
    language.lang = 'en';
    const req = new HttpRequest('POST', '/api/test', null);
    const next: HttpHandlerFn = (cloned) => {
      expect(cloned.headers.get('Accept-Language')).toBe('en');
      expect(cloned.headers.get('Authorization')).toBe('Bearer abc123');
      return of(new HttpResponse({ status: 200 }));
    };

    await lastValueFrom(TestBed.runInInjectionContext(() => authTokenInterceptor(req, next)));
  });
});
