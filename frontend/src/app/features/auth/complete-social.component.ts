import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { FieldErrors, parseHttpError } from '../../core/utils/error-mapper';
import { LanguageService } from '../../core/services/language.service';
import { ProfileService } from '../../core/services/profile.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';

@Component({
  selector: 'app-complete-social',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './complete-social.component.html',
  styleUrl: './complete-social.component.scss'
})
export class CompleteSocialComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly profileService = inject(ProfileService);

  readonly form = this.fb.nonNullable.group({
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
    email: ['', [Validators.email]],
    username: ['', [Validators.required]],
    merge_login: [''],
    merge_password: ['']
  });

  mode: 'create' | 'merge' = 'create';
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  readonly fieldErrors: FieldErrors = {};
  private readonly completionToken = this.route.snapshot.queryParamMap.get('token') ?? '';
  private readonly telegramFirstName = this.route.snapshot.queryParamMap.get('first_name') ?? '';
  private readonly telegramLastName = this.route.snapshot.queryParamMap.get('last_name') ?? '';
  private readonly telegramUsername = this.route.snapshot.queryParamMap.get('username') ?? '';

  constructor() {
    this.form.patchValue({
      first_name: this.telegramFirstName,
      last_name: this.telegramLastName,
      username: this.telegramUsername,
    });

    const emailControl = this.form.get('email');
    emailControl?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cdr.detectChanges();
      });

    const usernameControl = this.form.get('username');
    usernameControl?.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((value) => this.profileService.checkAvailability(value ?? '', undefined)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        const control = this.form.get('username');
        if (!control) {
          return;
        }
        this.updateCustomError(control, 'usernameTaken', !result.username_available);
        this.cdr.detectChanges();
      });
  }

  setMode(mode: 'create' | 'merge'): void {
    this.mode = mode;
    this.errorMessage = '';
    this.successMessage = '';
  }

  async submit(): Promise<void> {
    if (!this.completionToken) {
      this.errorMessage = 'auth.social.missing_token';
      return;
    }

    if (this.mode === 'create' && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.mode === 'merge' && !this.form.get('merge_login')?.value) {
      this.form.get('merge_login')?.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const payload = this.form.getRawValue();
      const normalizedUsername = payload.username ? payload.username.toLowerCase() : payload.username;
      if (this.mode === 'merge') {
        await this.authService.linkSocialAccount({
          completion_token: this.completionToken,
          locale: this.languageService.getLanguage(),
          merge_login: payload.merge_login,
          merge_password: payload.merge_password,
        });
      } else {
        await this.authService.completeSocialProfile({
          completion_token: this.completionToken,
          locale: this.languageService.getLanguage(),
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email || undefined,
          username: normalizedUsername ?? '',
        });
      }
      this.successMessage = 'auth.social.completed';
      setTimeout(() => void this.router.navigateByUrl('/login'), 700);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.errors.unknown';
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
    if (control.errors?.['usernameTaken']) {
      return 'auth.errors.username_taken';
    }
    return null;
  }

  private updateCustomError(control: AbstractControl, key: string, hasError: boolean): void {
    const errors = control.errors ?? {};
    if (hasError) {
      control.setErrors({ ...errors, [key]: true });
      return;
    }
    if (!errors[key]) {
      return;
    }
    const rest = { ...errors };
    delete rest[key];
    control.setErrors(Object.keys(rest).length ? rest : null);
  }
}
