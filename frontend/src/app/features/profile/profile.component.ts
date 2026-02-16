import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, skip, switchMap } from 'rxjs';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, Validators as NgValidators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DatePickerModule } from 'primeng/datepicker';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { ProfileData, ProfileService } from '../../core/services/profile.service';
import { DateUtils } from '../../core/utils/date-utils';
import { Validators } from '../../core/utils/validators';
import { JalaliDatepickerComponent } from '../../shared/jalali-datepicker.component';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe, DatePickerModule, JalaliDatepickerComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  isLoading = true;
  isEditing = false;
  readonly isAdminView = this.route.snapshot.paramMap.has('id');
  readonly targetUserId = Number(this.route.snapshot.paramMap.get('id') ?? 0);
  errorMessage = '';
  passwordErrorMessage = '';
  passwordSuccessMessage = '';
  isPasswordSubmitting = false;
  showPasswordModal = false;
  avatarPreview: string | null = null;
  avatarRemove = false;
  isDraggingAvatar = false;
  private avatarFile: File | null = null;
  private avatarPreviewIsObjectUrl = false;
  readonly currentLang$ = this.languageService.current$;
  readonly defaultBirthDate = new Date(Date.UTC(
    new Date().getUTCFullYear() - 18,
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  ));
  profile: ProfileData | null = null;
  isEmailRequired = true;
  birthDateGregorian = '';
  private readonly usernameChanges$ = new Subject<string>();
  private readonly emailChanges$ = new Subject<string>();

  // Main profile form (edit mode).
  readonly form = this.fb.nonNullable.group({
    username: [''],
    first_name: ['', [NgValidators.required]],
    last_name: ['', [NgValidators.required]],
    email: ['', [NgValidators.email]],
    birth_date: [''],
    id_number: [''],
    iban: [''],
    phone_numbers: this.fb.array([]),
    addresses: this.fb.array([]),
  });

  // Password change form (modal).
  readonly passwordForm = this.fb.nonNullable.group({
    current_password: ['', [NgValidators.required]],
    new_password: ['', [NgValidators.required, NgValidators.minLength(8), NgValidators.pattern(Validators.passwordPattern)]],
    new_password_confirmation: ['', [NgValidators.required, NgValidators.minLength(8), NgValidators.pattern(Validators.passwordPattern)]]
  });

  async ngOnInit(): Promise<void> {
    // Initial load + keep edit form display in sync with language changes.
    await this.loadProfile();
    const birthControl = this.form.get('birth_date');
    birthControl?.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.onFieldInput('birth_date');
      });
    this.languageService.current$
      .pipe(distinctUntilChanged(), skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncBirthDateWithLocale();
        this.cdr.detectChanges();
      });

    this.usernameChanges$
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((value) => this.isAdminView
          ? this.profileService.checkUserAvailability(this.targetUserId, value, undefined)
          : this.profileService.checkAvailability(value, undefined)
        ),
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

    this.emailChanges$
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((value) => this.isAdminView
          ? this.profileService.checkUserAvailability(this.targetUserId, undefined, value)
          : this.profileService.checkAvailability(undefined, value)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        const control = this.form.get('email');
        if (!control) {
          return;
        }
        this.updateCustomError(control, 'emailTaken', !result.email_available);
        this.cdr.detectChanges();
      });
  }

  get phoneNumbers(): FormArray {
    return this.form.get('phone_numbers') as FormArray;
  }

  get addresses(): FormArray {
    return this.form.get('addresses') as FormArray;
  }

  async loadProfile(): Promise<void> {
    // Fetch profile from API and map to UI state (including display date).
    this.isLoading = true;
    try {
      const locale = this.languageService.getLanguage();
      const data = this.isAdminView
        ? await this.profileService.fetchUserProfile(this.targetUserId, locale)
        : await this.profileService.fetchProfile(locale);
      this.profile = data;
      this.isEmailRequired = data.email_required ?? true;
      this.avatarPreview = data.avatar_url ?? null;
      this.avatarRemove = false;
      this.avatarFile = null;
      this.avatarPreviewIsObjectUrl = false;
      this.birthDateGregorian = DateUtils.normalizeGregorian(data.birth_date ?? '');
      this.patchForm(data);
    } catch {
      this.errorMessage = 'profile.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  startEdit(): void {
    // Switch to edit mode.
    this.isEditing = true;
  }

  cancelEdit(): void {
    // Reset edits to last loaded profile.
    this.isEditing = false;
    if (this.profile) {
      this.patchForm(this.profile);
    }
    this.avatarFile = null;
    this.avatarRemove = false;
    this.setAvatarPreview(this.profile?.avatar_url ?? null, false);
  }

  openPasswordModal(): void {
    this.passwordErrorMessage = '';
    this.passwordSuccessMessage = '';
    this.passwordForm.reset({
      current_password: '',
      new_password: '',
      new_password_confirmation: ''
    });
    this.showPasswordModal = true;
  }

  closePasswordModal(): void {
    this.showPasswordModal = false;
    this.passwordErrorMessage = '';
    this.passwordSuccessMessage = '';
  }

  backToUsers(): void {
    this.router.navigate(['/dashboard/users']);
  }

  addPhone(): void {
    // Append a new phone row.
    this.phoneNumbers.push(
      this.fb.nonNullable.group({
        number: ['', [NgValidators.required]],
        type: ['mobile', [NgValidators.required]]
      })
    );
  }

  removePhone(index: number): void {
    // Remove a phone row by index.
    this.phoneNumbers.removeAt(index);
  }

  addAddress(): void {
    // Append a new address row.
    this.addresses.push(
      this.fb.nonNullable.group({
        address: ['', [NgValidators.required]],
        type: ['private', [NgValidators.required]]
      })
    );
  }

  removeAddress(index: number): void {
    // Remove an address row by index.
    this.addresses.removeAt(index);
  }

  onAvatarSelected(event: Event): void {
    // Keep a local file handle for upload + preview.
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    this.applyAvatarFile(file);
  }

  onAvatarDragOver(event: DragEvent): void {
    // Allow dropping an avatar file onto the dropzone.
    event.preventDefault();
    this.isDraggingAvatar = true;
  }

  onAvatarDragLeave(event: DragEvent): void {
    // Remove drag highlight when leaving the dropzone.
    event.preventDefault();
    this.isDraggingAvatar = false;
  }

  onAvatarDrop(event: DragEvent): void {
    // Accept a single dropped image file as the new avatar.
    event.preventDefault();
    this.isDraggingAvatar = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    this.applyAvatarFile(file);
  }

  clearAvatar(): void {
    // Mark avatar for removal and clear any local preview/file.
    this.avatarRemove = true;
    this.avatarFile = null;
    this.setAvatarPreview(null, false);
  }

  async save(): Promise<void> {
    // Validate, normalize, and submit profile updates to API.
    if (!this.isValidForm()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    try {
      const locale = this.languageService.getLanguage();
      const usernameRaw = (this.form.getRawValue().username ?? '').trim().toLowerCase();
      const emailRaw = (this.form.getRawValue().email ?? '').trim();
      const firstNameRaw = (this.form.getRawValue().first_name ?? '').trim();
      const lastNameRaw = (this.form.getRawValue().last_name ?? '').trim();
      const birthDateRaw = DateUtils.toLatinDigits(this.form.getRawValue().birth_date ?? '');
      const birthDateNormalized =
        locale === 'fa' ? DateUtils.normalizeJalaliInput(birthDateRaw) : DateUtils.normalizeGregorian(birthDateRaw);
      if (locale === 'fa' && Validators.isValidBirthDateFormat(birthDateNormalized, locale)) {
        this.birthDateGregorian = DateUtils.toGregorian(birthDateNormalized);
      } else if (locale !== 'fa' && Validators.isValidBirthDateFormat(birthDateNormalized, locale)) {
        this.birthDateGregorian = DateUtils.normalizeGregorian(birthDateNormalized);
      }
      const birthDatePayload = this.birthDateGregorian || '';

      const idNumber = DateUtils.toLatinDigits(this.form.getRawValue().id_number ?? '');
      const iban = DateUtils.toLatinDigits(this.form.getRawValue().iban ?? '');
      const payload: ProfileData = {
        ...this.form.getRawValue(),
        username: usernameRaw || undefined,
        email: emailRaw || undefined,
        first_name: firstNameRaw,
        last_name: lastNameRaw,
        birth_date: birthDatePayload || undefined,
        id_number: idNumber || undefined,
        iban: iban || undefined,
        phone_numbers: this.phoneNumbers.value.map((item: { number: string; type?: string }) => ({
          ...item,
          number: DateUtils.toLatinDigits(item.number ?? '')
        })),
        addresses: this.addresses.value,
        locale
      };

      const updated = this.isAdminView
        ? await this.profileService.updateUserProfile(this.targetUserId, payload, this.avatarFile, this.avatarRemove)
        : await this.profileService.updateProfile(payload, this.avatarFile, undefined, this.avatarRemove);
      this.profile = updated;
      this.isEditing = false;
      this.avatarRemove = false;
      this.avatarFile = null;
      this.setAvatarPreview(updated.avatar_url ?? null, false);
      if (!this.isAdminView) {
        await this.authService.refreshUser();
      }
    } catch {
      this.errorMessage = 'profile.save_failed';
    }
  }

  async submitPasswordChange(): Promise<void> {
    if (this.isAdminView) {
      return;
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const payload = this.buildPasswordPayload();
    if (!payload) {
      this.passwordErrorMessage = 'profile.save_failed';
      return;
    }

    this.passwordErrorMessage = '';
    this.passwordSuccessMessage = '';
    this.isPasswordSubmitting = true;

    try {
      const { current_password, new_password, new_password_confirmation } = this.passwordForm.getRawValue();
      await this.profileService.updateProfile(payload, undefined, {
        current_password,
        new_password,
        new_password_confirmation
      }, false);
      this.passwordSuccessMessage = 'profile.password_changed';
      this.showPasswordModal = false;
    } catch {
      this.passwordErrorMessage = 'profile.password_change_failed';
    } finally {
      this.isPasswordSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  onFieldInput(field: string): void {
    // Live validation on key input with locale-aware rules.
    const control = this.getControl(field);
    if (!control) {
      return;
    }
    control.markAsTouched();
    const locale = this.languageService.getLanguage();
    const rawValue = DateUtils.toLatinDigits(String(control.value ?? ''));

    if (field === 'birth_date') {
      const normalized = locale === 'fa'
        ? DateUtils.normalizeJalaliInput(rawValue)
        : DateUtils.normalizeGregorian(rawValue);
      const hasError = !Validators.isValidBirthDateFormat(normalized, locale);
      this.updateCustomError(control, 'birthDate', hasError);
      if (!hasError) {
        this.birthDateGregorian = locale === 'fa'
          ? DateUtils.toGregorian(normalized)
          : DateUtils.normalizeGregorian(normalized);
      }
    }

    if (field === 'id_number') {
      const hasError = rawValue ? !Validators.isValidIranianIdNumber(rawValue) : false;
      this.updateCustomError(control, 'idNumber', hasError);
    }

    if (field === 'iban') {
      const hasError = rawValue ? !Validators.isValidIban(rawValue) : false;
      this.updateCustomError(control, 'iban', hasError);
    }

    if (field === 'username') {
    const normalized = rawValue.trim().toLowerCase();
      if (!normalized || normalized === (this.profile?.username ?? '').trim()) {
        this.updateCustomError(control, 'usernameTaken', false);
        return;
      }
      if (control.errors?.['required']) {
        return;
      }
      this.usernameChanges$.next(normalized);
    }

    if (field === 'email') {
      const normalized = rawValue.trim();
      if (!normalized || normalized === (this.profile?.email ?? '').trim()) {
        this.updateCustomError(control, 'emailTaken', false);
        return;
      }
      if (control.errors?.['email']) {
        return;
      }
      this.emailChanges$.next(normalized);
    }
  }

  getErrorKey(field: string): string | null {
    // Map control errors to i18n keys.
    const control = this.getControl(field);
    if (!control || !(control.dirty || control.touched) || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return 'profile.required';
    }
    if (control.errors['email']) {
      return 'profile.email_invalid';
    }
    if (control.errors['usernameTaken']) {
      return 'profile.username_taken';
    }
    if (control.errors['emailTaken']) {
      return 'profile.email_taken';
    }
    if (control.errors['birthDate']) {
      return 'profile.birth_date_invalid';
    }
    if (control.errors['idNumber']) {
      return 'profile.id_number_invalid';
    }
    if (control.errors['iban']) {
      return 'profile.iban_invalid';
    }
    return null;
  }

  getPasswordErrorKey(field: string): string | null {
    const control = this.passwordForm.get(field);
    if (!control || !(control.dirty || control.touched) || !control.errors) {
      return null;
    }
    if (control.errors['required']) {
      return 'profile.required';
    }
    if (control.errors['minlength'] || control.errors['pattern']) {
      return 'auth.errors.password_policy';
    }
    return null;
  }

  isInvalid(field: string): boolean {
    // Used for red border states.
    const control = this.getControl(field);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  private patchForm(data: ProfileData): void {
    // Apply server data to form and rebuild dynamic arrays.
    this.applyEmailRequirement(data.email_required ?? true);
    const locale = this.languageService.getLanguage();
    const birthDateRaw = this.birthDateGregorian || DateUtils.normalizeGregorian(data.birth_date ?? '');
    const birthDateValue =
      locale === 'fa'
        ? DateUtils.toJalali(birthDateRaw)
        : DateUtils.normalizeGregorian(birthDateRaw);

    this.form.patchValue({
      username: (data.username ?? '').toLowerCase(),
      first_name: data.first_name ?? '',
      last_name: data.last_name ?? '',
      email: data.email ?? '',
      birth_date: birthDateValue ?? '',
      id_number: data.id_number ?? '',
      iban: data.iban ?? ''
    });

    this.setAvatarPreview(data.avatar_url ?? null, false);
    this.avatarRemove = false;
    this.avatarFile = null;

    this.phoneNumbers.clear();
    (data.phone_numbers ?? []).forEach((item) => {
      this.phoneNumbers.push(
        this.fb.nonNullable.group({
          number: [item.number ?? '', [NgValidators.required]],
          type: [item.type ?? 'mobile', [NgValidators.required]]
        })
      );
    });

    this.addresses.clear();
    (data.addresses ?? []).forEach((item) => {
      this.addresses.push(
        this.fb.nonNullable.group({
          address: [item.address ?? '', [NgValidators.required]],
          type: [item.type ?? 'private', [NgValidators.required]]
        })
      );
    });
  }

  private isValidForm(): boolean {
    // Client-side validation with trimmed required checks.
    const locale = this.languageService.getLanguage();
    const birthDate = DateUtils.toLatinDigits(this.form.value.birth_date ?? '');
    const birthDateNormalized =
      locale === 'fa' ? DateUtils.normalizeJalaliInput(birthDate) : DateUtils.normalizeGregorian(birthDate);
    const idNumber = DateUtils.toLatinDigits(this.form.value.id_number ?? '');
    const iban = DateUtils.toLatinDigits(this.form.value.iban ?? '');
    const firstNameControl = this.form.get('first_name');
    const lastNameControl = this.form.get('last_name');
    const firstNameTrim = (firstNameControl?.value ?? '').trim();
    const lastNameTrim = (lastNameControl?.value ?? '').trim();
    const emailControl = this.form.get('email');
    const emailTrim = (emailControl?.value ?? '').trim();

    if (firstNameControl && !firstNameTrim) {
      firstNameControl.setErrors({ ...(firstNameControl.errors ?? {}), required: true });
      return false;
    }

    if (lastNameControl && !lastNameTrim) {
      lastNameControl.setErrors({ ...(lastNameControl.errors ?? {}), required: true });
      return false;
    }

    if (this.isEmailRequired && emailControl && !emailTrim) {
      emailControl.setErrors({ ...(emailControl.errors ?? {}), required: true });
      return false;
    }

    if (!Validators.isValidBirthDateFormat(birthDateNormalized, locale)) {
      this.errorMessage = 'profile.birth_date_invalid';
      return false;
    }
    if (idNumber && !Validators.isValidIranianIdNumber(idNumber)) {
      this.errorMessage = 'profile.id_number_invalid';
      return false;
    }
    if (iban && !Validators.isValidIban(iban)) {
      this.errorMessage = 'profile.iban_invalid';
      return false;
    }

    return this.form.valid;
  }

  private buildPasswordPayload(): ProfileData | null {
    if (this.isAdminView) {
      return null;
    }
    const locale = this.languageService.getLanguage();
    const source = this.isEditing ? this.form.getRawValue() : this.profile;
    if (!source) {
      return null;
    }
    const emailRaw = (source.email ?? this.profile?.email ?? '').toString().trim();
    const payload: ProfileData = {
      first_name: (source.first_name ?? this.profile?.first_name ?? '').toString(),
      last_name: (source.last_name ?? this.profile?.last_name ?? '').toString(),
      username: (source.username ?? this.profile?.username ?? '').toString().toLowerCase() || undefined,
      email: emailRaw || undefined,
      locale
    };
    return payload;
  }

  formatBirthDate(value: string | null | undefined): string {
    // Display value for read-only view with locale-specific digits.
    if (!value) {
      return '';
    }
    const locale = this.languageService.getLanguage();
    if (locale === 'fa') {
      const jalali = DateUtils.toJalali(value);
      return DateUtils.toPersianDigits(jalali);
    }
    return DateUtils.normalizeGregorian(DateUtils.toLatinDigits(value));
  }

  formatIdNumber(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const latin = DateUtils.toLatinDigits(value);
    const digits = latin.replace(/\D+/g, '');
    const padded = digits.padStart(10, '0');
    const formatted = `${padded.slice(0, 3)}-${padded.slice(3, 9)}-${padded.slice(9)}`;
    const locale = this.languageService.getLanguage();
    return locale === 'fa' ? DateUtils.toPersianDigits(formatted) : formatted;
  }

  getTypeKey(type: string | null | undefined): string | null {
    if (!type) {
      return null;
    }
    const normalized = type.trim().toLowerCase();
    if (['private', 'mobile', 'business'].includes(normalized)) {
      return `profile.type.${normalized}`;
    }
    return null;
  }

  getAvatarInitials(): string {
    // Build initials from first/last name for the fallback avatar.
    const first = (this.form.value.first_name ?? this.profile?.first_name ?? '').trim();
    const last = (this.form.value.last_name ?? this.profile?.last_name ?? '').trim();
    const initialOne = first ? first[0] : '';
    const initialTwo = last ? last[0] : '';
    const initials = `${initialOne}${initialTwo}`.trim();
    return initials || 'NH';
  }

  private syncBirthDateWithLocale(): void {
    // Re-render the edit field from the stored Gregorian value.
    const locale = this.languageService.getLanguage();
    if (!this.birthDateGregorian) {
      return;
    }
    const updated =
      locale === 'fa'
        ? DateUtils.toJalali(this.birthDateGregorian)
        : DateUtils.normalizeGregorian(this.birthDateGregorian);
    this.form.patchValue({ birth_date: updated }, { emitEvent: false });
  }

  private getControl(field: string): AbstractControl | null {
    // Helper to access form controls by name.
    return this.form.get(field);
  }

  private updateCustomError(control: AbstractControl, key: string, hasError: boolean): void {
    // Merge/remove custom validation errors while preserving others.
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

  private applyEmailRequirement(isRequired: boolean): void {
    // Backend signals whether email is required (social accounts can be empty).
    const emailControl = this.form.get('email');
    if (!emailControl) {
      return;
    }
    this.isEmailRequired = isRequired;
    const validators = isRequired ? [NgValidators.required, NgValidators.email] : [NgValidators.email];
    emailControl.setValidators(validators);
    emailControl.updateValueAndValidity({ emitEvent: false });
  }

  private applyAvatarFile(file: File, previewUrl?: string): void {
    // Centralized avatar assignment: clears removal flag + sets preview.
    this.avatarRemove = false;
    this.avatarFile = file;
    if (previewUrl) {
      this.setAvatarPreview(previewUrl, false);
      return;
    }
    this.setAvatarPreview(URL.createObjectURL(file), true);
  }

  private setAvatarPreview(value: string | null, isObjectUrl: boolean): void {
    // Clean up old object URLs and swap to the new preview.
    if (this.avatarPreview && this.avatarPreviewIsObjectUrl) {
      URL.revokeObjectURL(this.avatarPreview);
    }
    this.avatarPreview = value;
    this.avatarPreviewIsObjectUrl = isObjectUrl;
  }
}
