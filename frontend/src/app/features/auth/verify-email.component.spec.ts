import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { VerifyEmailComponent } from './verify-email.component';

describe('VerifyEmailComponent', () => {
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let component: VerifyEmailComponent;
  const authService = {
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
  };
  const languageService = {
    getLanguage: vi.fn(() => 'fa' as const),
  };
  const router = {
    navigateByUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    authService.verifyEmail.mockReset();
    authService.resendVerification.mockReset();
    router.navigateByUrl.mockReset();

    await TestBed.configureTestingModule({
      imports: [VerifyEmailComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                email: 'saeed@example.test',
                code: '1234',
              }),
            },
          },
        },
      ],
    })
      .overrideComponent(VerifyEmailComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates form from query params', () => {
    expect(component.form.get('email')?.value).toBe('saeed@example.test');
    expect(component.form.get('code')?.value).toBe('1234');
  });

  it('submits verification and redirects to login', async () => {
    authService.verifyEmail.mockResolvedValue(undefined);
    component.form.patchValue({ email: 'a@test.dev', code: ' 9999 ' });

    await component.submit();

    expect(authService.verifyEmail).toHaveBeenCalledWith('a@test.dev', '9999');
    expect(component.successMessage).toBe('auth.verify_email.success');
    vi.advanceTimersByTime(701);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('resends code using active locale', async () => {
    authService.resendVerification.mockResolvedValue(undefined);
    component.form.patchValue({ email: 'notify@test.dev' });

    await component.resend();

    expect(authService.resendVerification).toHaveBeenCalledWith('notify@test.dev', 'fa');
    expect(component.successMessage).toBe('auth.verify_email.resent');
  });
});
