import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { TelegramLoginComponent } from '../../shared/telegram-login.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe, TelegramLoginComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  isSubmitting = false;
  errorMessage = '';
  readonly fieldErrors: FieldErrors = {};

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const { login, password } = this.form.getRawValue();
    try {
      await this.authService.login(login, password);
      void this.router.navigateByUrl('/');
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.login_failed';
      Object.assign(this.fieldErrors, parsed.fieldErrors);
      Object.keys(parsed.fieldErrors).forEach((field) => {
        this.form.get(field)?.setErrors({ server: true });
      });
      this.cdr.detectChanges();
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  onFieldInput(field: 'login' | 'password'): void {
    const control = this.form.get(field);
    if (!control) {
      return;
    }
    control.markAsTouched();
    delete this.fieldErrors[field];
    this.errorMessage = '';
  }

  getFieldErrorKey(field: 'login' | 'password'): string | null {
    const control = this.form.get(field);
    if (!control || !(control.touched || control.dirty)) {
      return null;
    }
    if (this.fieldErrors[field]) {
      return this.fieldErrors[field];
    }
    if (control.errors?.['required']) {
      return 'auth.errors.required';
    }
    return null;
  }
}
