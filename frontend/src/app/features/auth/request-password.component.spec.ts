import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { RequestPasswordComponent } from './request-password.component';

describe('RequestPasswordComponent', () => {
  let fixture: ComponentFixture<RequestPasswordComponent>;
  let component: RequestPasswordComponent;
  const authService = {
    requestPasswordReset: vi.fn(),
  };
  const languageService = {
    getLanguage: vi.fn(() => 'en' as const),
  };

  beforeEach(async () => {
    authService.requestPasswordReset.mockReset();

    await TestBed.configureTestingModule({
      imports: [RequestPasswordComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
      ],
    })
      .overrideComponent(RequestPasswordComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(RequestPasswordComponent);
    component = fixture.componentInstance;
  });

  it('submits trimmed login and sets success message', async () => {
    authService.requestPasswordReset.mockResolvedValue(undefined);
    component.form.patchValue({ login: '  user@example.test  ' });

    await component.submit();

    expect(authService.requestPasswordReset).toHaveBeenCalledWith('user@example.test', 'en');
    expect(component.successMessage).toBe('auth.password_request.sent');
  });

  it('does not submit invalid form', async () => {
    component.form.patchValue({ login: '' });
    await component.submit();
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('maps forbidden api error', async () => {
    authService.requestPasswordReset.mockRejectedValue(
      new HttpErrorResponse({
        status: 403,
        error: { message: 'Forbidden' },
      })
    );
    component.form.patchValue({ login: 'user@test.dev' });

    await component.submit();
    expect(component.errorMessage).toBe('admin.errors.forbidden');
  });
});
