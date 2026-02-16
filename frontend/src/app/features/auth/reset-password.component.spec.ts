import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  const authService = {
    resetPassword: vi.fn(),
  };
  const router = {
    navigateByUrl: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    authService.resetPassword.mockReset();
    router.navigateByUrl.mockReset();

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                login: 'saeed',
                token: 'token-1',
              }),
            },
          },
        },
      ],
    })
      .overrideComponent(ResetPasswordComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates login and token from query params', () => {
    expect(component.form.get('login')?.value).toBe('saeed');
    expect(component.form.get('token')?.value).toBe('token-1');
  });

  it('submits reset payload and navigates to login', async () => {
    authService.resetPassword.mockResolvedValue(undefined);
    component.form.patchValue({
      login: ' user@example.test ',
      token: ' token-1 ',
      password: 'Secret123',
      password_confirmation: 'Secret123',
    });

    await component.submit();

    expect(authService.resetPassword).toHaveBeenCalledWith(
      'user@example.test',
      'token-1',
      'Secret123',
      'Secret123'
    );
    vi.advanceTimersByTime(701);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
