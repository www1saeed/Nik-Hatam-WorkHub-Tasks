import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { LanguageService } from '../../core/services/language.service';

@Component({
  selector: 'app-request-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './request-password.component.html',
  styleUrl: './request-password.component.scss'
})
export class RequestPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required]]
  });

  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  readonly fieldErrors: FieldErrors = {};

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const login = this.form.getRawValue().login.trim();
      await this.authService.requestPasswordReset(login, this.languageService.getLanguage());
      this.successMessage = 'auth.password_request.sent';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.password_request.failed';
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
    return null;
  }
}
