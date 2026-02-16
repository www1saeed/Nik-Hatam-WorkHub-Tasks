import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  const authService = {
    register: vi.fn(),
  };
  const languageService = {
    getLanguage: vi.fn(() => 'fa' as const),
  };
  const router = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    authService.register.mockReset();
    router.navigate.mockReset();

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(RegisterComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
  });

  it('submits valid payload and normalizes username to lowercase', async () => {
    authService.register.mockResolvedValue(undefined);
    component.form.patchValue({
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      username: 'SaeedUser',
      password: 'Secret123',
    });

    await component.submit();

    expect(authService.register).toHaveBeenCalledWith({
      locale: 'fa',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      username: 'saeeduser',
      password: 'Secret123',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/verify-email'], { queryParams: { email: 'saeed@test.dev' } });
  });

  it('rejects invalid form before api call', async () => {
    component.form.patchValue({
      first_name: '',
      last_name: '',
      email: 'bad-email',
      password: 'short',
    });

    await component.submit();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('maps duplicate email error to field state', async () => {
    authService.register.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: {
          message: 'The email has already been taken.',
          errors: { email: ['The email has already been taken.'] },
        },
      })
    );
    component.form.patchValue({
      first_name: 'S',
      last_name: 'H',
      email: 'dup@test.dev',
      username: '',
      password: 'Secret123',
    });

    await component.submit();
    expect(component.errorMessage).toBe('auth.errors.email_taken');
    expect(component.fieldErrors['email']).toBe('auth.errors.email_taken');
    expect(component.form.get('email')?.errors?.['server']).toBe(true);
  });
});
