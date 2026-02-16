import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { LanguageService } from '../../core/services/language.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss'
})
export class VerifyEmailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.minLength(4)]]
  });

  isSubmitting = false;
  isResending = false;
  errorMessage = '';
  successMessage = '';
  readonly fieldErrors: FieldErrors = {};

  constructor() {
    const email = this.route.snapshot.queryParamMap.get('email') ?? '';
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    this.form.patchValue({ email, code });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const { email, code } = this.form.getRawValue();
      await this.authService.verifyEmail(email.trim(), code.trim());
      this.successMessage = 'auth.verify_email.success';
      setTimeout(() => void this.router.navigateByUrl('/login'), 700);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.verify_email.failed';
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

  async resend(): Promise<void> {
    const email = this.form.getRawValue().email.trim();
    if (!email) {
      this.form.get('email')?.markAsTouched();
      return;
    }

    this.isResending = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.authService.resendVerification(email, this.languageService.getLanguage());
      this.successMessage = 'auth.verify_email.resent';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.verify_email.failed';
      this.cdr.detectChanges();
    } finally {
      this.isResending = false;
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
    return null;
  }
}
