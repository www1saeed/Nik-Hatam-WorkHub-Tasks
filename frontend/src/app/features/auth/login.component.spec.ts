import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  const authService = {
    login: vi.fn(),
  };
  const router = {
    navigateByUrl: vi.fn(),
  };

  beforeEach(async () => {
    authService.login.mockReset();
    router.navigateByUrl.mockReset();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(LoginComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  it('submits valid credentials and redirects home', async () => {
    authService.login.mockResolvedValue(undefined);
    component.form.patchValue({ login: 'admin', password: 'Secret123' });

    await component.submit();

    expect(authService.login).toHaveBeenCalledWith('admin', 'Secret123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('does not submit when form is invalid', async () => {
    component.form.patchValue({ login: '', password: '' });

    await component.submit();

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('maps api error to component error state', async () => {
    authService.login.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: {
          message: 'The provided credentials are incorrect.',
          errors: { login: ['The login field is required.'] },
        },
      })
    );
    component.form.patchValue({ login: 'admin', password: 'bad' });

    await component.submit();

    expect(component.errorMessage).toBe('auth.errors.invalid_credentials');
    expect(component.fieldErrors['login']).toBe('auth.errors.required');
    expect(component.form.get('login')?.errors?.['server']).toBe(true);
  });
});
