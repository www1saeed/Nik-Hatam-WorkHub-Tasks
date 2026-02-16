import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { LanguageService } from '../../core/services/language.service';
import { TelegramLoginComponent } from '../../shared/telegram-login.component';
import { Validators as CustomValidators } from '../../core/utils/validators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe, TelegramLoginComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    username: [''],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(CustomValidators.passwordPattern)]]
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

    try {
      const { email } = this.form.getRawValue();
      const raw = this.form.getRawValue();
      await this.authService.register({
        locale: this.languageService.getLanguage(),
        ...raw,
        username: raw.username ? raw.username.toLowerCase() : raw.username,
      });
      void this.router.navigate(['/verify-email'], { queryParams: { email } });
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.register_failed';
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

  onFieldInput(field: keyof typeof this.form.controls): void {
    const control = this.form.get(field);
    if (!control) {
      return;
    }
    control.markAsTouched();
    delete this.fieldErrors[field];
    this.errorMessage = '';
  }

  getFieldErrorKey(field: keyof typeof this.form.controls): string | null {
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
    if (control.errors?.['email']) {
      return 'auth.errors.email_invalid';
    }
    if (control.errors?.['minlength'] || control.errors?.['pattern']) {
      return 'auth.errors.password_policy';
    }
    return null;
  }
}
