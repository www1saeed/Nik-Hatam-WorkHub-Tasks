import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { ProfileService } from '../../core/services/profile.service';
import { CompleteSocialComponent } from './complete-social.component';

describe('CompleteSocialComponent', () => {
  let fixture: ComponentFixture<CompleteSocialComponent>;
  let component: CompleteSocialComponent;
  const authService = {
    completeSocialProfile: vi.fn(),
    linkSocialAccount: vi.fn(),
  };
  const languageService = {
    getLanguage: vi.fn(() => 'en' as const),
  };
  const profileService = {
    checkAvailability: vi.fn(() => of({ username_available: true, email_available: true })),
  };
  const router = {
    navigateByUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    authService.completeSocialProfile.mockReset();
    authService.linkSocialAccount.mockReset();
    router.navigateByUrl.mockReset();

    await TestBed.configureTestingModule({
      imports: [CompleteSocialComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
        { provide: ProfileService, useValue: profileService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                token: 'completion-token',
                first_name: 'Saeed',
                last_name: 'Hatami',
                username: 'TlgUser',
              }),
            },
          },
        },
      ],
    })
      .overrideComponent(CompleteSocialComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(CompleteSocialComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefills social user identity from query params', () => {
    expect(component.form.get('first_name')?.value).toBe('Saeed');
    expect(component.form.get('last_name')?.value).toBe('Hatami');
    expect(component.form.get('username')?.value).toBe('TlgUser');
  });

  it('submits create mode payload with lowercase username', async () => {
    authService.completeSocialProfile.mockResolvedValue(undefined);
    component.form.patchValue({
      first_name: 'Saeed',
      last_name: 'Hatami',
      username: 'UPPERUSER',
      email: 's@test.dev',
    });

    await component.submit();

    expect(authService.completeSocialProfile).toHaveBeenCalledWith({
      completion_token: 'completion-token',
      locale: 'en',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 's@test.dev',
      username: 'upperuser',
    });
    vi.advanceTimersByTime(701);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('submits merge mode payload', async () => {
    authService.linkSocialAccount.mockResolvedValue(undefined);
    component.setMode('merge');
    component.form.patchValue({
      merge_login: 'admin',
      merge_password: 'Secret123',
    });

    await component.submit();

    expect(authService.linkSocialAccount).toHaveBeenCalledWith({
      completion_token: 'completion-token',
      locale: 'en',
      merge_login: 'admin',
      merge_password: 'Secret123',
    });
  });
});
