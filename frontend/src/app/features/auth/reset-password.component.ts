import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { Validators as CustomValidators } from '../../core/utils/validators';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required]],
    token: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(CustomValidators.passwordPattern)]],
    password_confirmation: ['', [Validators.required, Validators.minLength(8), Validators.pattern(CustomValidators.passwordPattern)]]
  });

  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  readonly fieldErrors: FieldErrors = {};

  constructor() {
    const login = this.route.snapshot.queryParamMap.get('login')
      ?? this.route.snapshot.queryParamMap.get('email')
      ?? this.route.snapshot.queryParamMap.get('username')
      ?? '';
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.form.patchValue({ login, token });
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
      const { login, token, password, password_confirmation } = this.form.getRawValue();
      await this.authService.resetPassword(login.trim(), token.trim(), password, password_confirmation);
      this.successMessage = 'auth.password_reset.success';
      setTimeout(() => void this.router.navigateByUrl('/login'), 700);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.password_reset.failed';
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
    if (control.errors?.['minlength']) {
      return 'auth.errors.password_policy';
    }
    if (control.errors?.['pattern']) {
      return 'auth.errors.password_policy';
    }
    return null;
  }
}
