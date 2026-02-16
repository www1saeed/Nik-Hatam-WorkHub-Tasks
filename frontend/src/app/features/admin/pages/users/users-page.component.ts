import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminUsersService, AdminUser, AdminRole } from '../../../../core/services/admin-users.service';
import { AdminRolesService, AdminRoleDetail } from '../../../../core/services/admin-roles.service';
import { parseHttpError } from '../../../../core/utils/error-mapper';
import { Validators as CustomValidators } from '../../../../core/utils/validators';
import { DateUtils } from '../../../../core/utils/date-utils';
import { Router } from '@angular/router';
import { UiLocale } from '../../../../core/utils/locale';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss'
})
export class UsersPageComponent implements AfterViewInit {
  // Service dependencies for data access, translation, and lifecycle utilities.
  private readonly usersService = inject(AdminUsersService);
  private readonly rolesService = inject(AdminRolesService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private observer: MutationObserver | null = null;
  private roleLabels: Record<string, string> = {};

  // Table + modal state.
  users: AdminUser[] = [];
  roles: AdminRoleDetail[] = [];
  isLoading = true;
  isEditing = false;
  isFormOpen = false;
  showPasswordForm = false;
  showPasswordText = false;
  errorMessage = '';
  formErrorMessage = '';
  deleteErrorMessage = '';
  fieldErrors: Record<string, string> = {};
  editingId: number | null = null;
  searchTerm = '';
  sortKey: 'username' | 'name' | 'email' | 'roles' = 'username';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 1;
  pageSize = 10;
  verificationFilter: 'all' | 'unverified' | 'verified' = 'all';
  deleteTarget: AdminUser | null = null;
  resetTarget: AdminUser | null = null;
  resetMode: 'email' | 'qr' | null = null;
  resetLink = '';
  resetQrDataUrl = '';
  resetErrorMessage = '';
  resetSuccessMessage = '';
  isResetBusy = false;
  resetEmailNeedsConfirm = false;

  // Reactive form used for create and edit flows.
  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(CustomValidators.passwordPattern)]],
    role_ids: [[] as number[]],
  });

  constructor() {
    // Load initial dataset for table and role selector.
    this.load();

    // Clear error hints and re-evaluate validators on any form change.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.errorMessage = '';
        this.formErrorMessage = '';
        this.fieldErrors = {};
        this.syncUsernameValidators();
      });

    this.transloco
      .selectTranslation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((translation) => {
        this.roleLabels = this.extractRoleLabels(translation as Record<string, unknown>);
      });
  }

  ngAfterViewInit(): void {
    // Remove legacy error banners that can appear behind modals.
    this.hidePageErrors();
    this.observeErrorBanners();
  }

  // Convenience getter for template conditions.
  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      // Fetch users and roles in parallel to reduce total wait time.
      const [users, roles] = await Promise.all([
        this.usersService.list(),
        this.rolesService.list(),
      ]);
      this.users = users;
      this.roles = roles;
    } catch (error) {
      // Map server errors to translation keys for consistent UI messaging.
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      // Ensure UI state is updated, even if the request fails.
      this.isLoading = false;
      this.cdr.detectChanges();
      this.hidePageErrors();
    }
  }

  private hidePageErrors(): void {
    // Defensive cleanup for page-level error banners.
    const elements = this.host.nativeElement.querySelectorAll('.admin-page__error');
    elements.forEach((element: Element) => {
      element.remove();
    });
  }

  private observeErrorBanners(): void {
    // Watch for DOM inserts and remove error banners if they appear.
    if (this.observer) {
      return;
    }
    this.observer = new MutationObserver(() => {
      this.hidePageErrors();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.observer = null;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get filteredUsers(): AdminUser[] {
    const byVerification = this.users.filter((user) => {
      if (this.verificationFilter === 'all') {
        return true;
      }
      const isVerified = !!user.email_verified_at;
      return this.verificationFilter === 'verified' ? isVerified : !isVerified;
    });

    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return byVerification;
    }
    // Search across key identity fields and role labels.
    return byVerification.filter((user) => {
      const roles = (user.roles ?? []).map((role: AdminRole) => role.name).join(' ');
      const haystack = `${user.username} ${user.first_name} ${user.last_name} ${user.email ?? ''} ${roles}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  get sortedUsers(): AdminUser[] {
    const items = [...this.filteredUsers];
    const dir = this.sortDir === 'asc' ? 1 : -1;
    // Use locale-aware string sorting for stable ordering.
    return items.sort((a, b) => {
      const valueA = this.sortValue(a);
      const valueB = this.sortValue(b);
      return valueA.localeCompare(valueB) * dir;
    });
  }

  get pagedUsers(): AdminUser[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedUsers.slice(start, start + this.pageSize);
  }

  private sortValue(user: AdminUser): string {
    if (this.sortKey === 'name') {
      return `${user.first_name} ${user.last_name}`.toLowerCase();
    }
    if (this.sortKey === 'email') {
      return (user.email ?? '').toLowerCase();
    }
    if (this.sortKey === 'roles') {
      return (user.roles ?? []).map((role: AdminRole) => this.roleLabel(role)).join(',').toLowerCase();
    }
    return user.username.toLowerCase();
  }

  roleLabel(role: { name: string; slug?: string }): string {
    // Translate role slugs when a localized label exists.
    const slug = role.slug ?? '';
    if (!slug) {
      return role.name;
    }
    return this.roleLabels[slug] ?? role.name;
  }

  private extractRoleLabels(translation: Record<string, unknown>): Record<string, string> {
    const admin = (translation['admin'] ?? {}) as Record<string, unknown>;
    const roles = (admin['roles'] ?? {}) as Record<string, unknown>;
    const nestedLabels = (roles['labels'] ?? {}) as Record<string, string>;
    if (Object.keys(nestedLabels).length > 0) {
      return nestedLabels;
    }

    const labels: Record<string, string> = {};
    Object.entries(translation).forEach(([key, value]) => {
      if (!key.startsWith('admin.roles.labels.')) {
        return;
      }
      const slug = key.replace('admin.roles.labels.', '');
      if (typeof value === 'string' && slug) {
        labels[slug] = value;
      }
    });
    return labels;
  }

  goToProfile(user: AdminUser): void {
    this.router.navigate(['/dashboard/users', user.id, 'profile']);
  }

  // Detect RTL mode based on the active language.
  isRtl(): boolean {
    return this.transloco.getActiveLang() === 'fa';
  }

  // Format pagination numbers based on the active language.
  formatPageNumber(value: number): string {
    const text = String(value);
    return this.isRtl() ? DateUtils.toPersianDigits(text) : text;
  }

  setPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    this.page = next;
  }

  setSort(key: 'username' | 'name' | 'email' | 'roles'): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDir = 'asc';
  }

  updatePageSize(size: string): void {
    // Changing page size resets pagination to the first page.
    this.pageSize = Number(size);
    this.page = 1;
  }

  setVerificationFilter(value: string): void {
    if (value === 'verified' || value === 'unverified') {
      this.verificationFilter = value;
    } else {
      this.verificationFilter = 'all';
    }
    this.page = 1;
  }

  startCreate(): void {
    // Configure the modal for a new user.
    this.isEditing = false;
    this.isFormOpen = true;
    this.showPasswordForm = true;
    this.showPasswordText = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      username: '',
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      role_ids: this.defaultRoleIds(),
    });
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.get('password')?.addValidators(Validators.pattern(CustomValidators.passwordPattern));
    this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncUsernameValidators();
  }

  // Open modal in edit mode and prefill values.
  startEdit(user: AdminUser): void {
    // Configure the modal for editing.
    this.isEditing = true;
    this.isFormOpen = true;
    this.showPasswordForm = false;
    this.showPasswordText = false;
    this.editingId = user.id;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email ?? '',
      password: '',
      role_ids: (user.roles ?? []).map((role: AdminRole) => role.id),
    });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncUsernameValidators();
  }

  // Close modal and reset password validators.
  cancelEdit(): void {
    // Close the modal and reset edit-specific state.
    this.isEditing = false;
    this.isFormOpen = false;
    this.showPasswordForm = false;
    this.showPasswordText = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.get('password')?.addValidators(Validators.pattern(CustomValidators.passwordPattern));
    this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
    this.syncUsernameValidators();
  }

  // Create or update user based on editing state.
  async save(): Promise<void> {
    if (this.form.invalid) {
      // Immediate client-side validation feedback.
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.formErrorMessage = '';
    const payload = this.form.getRawValue();
    const normalizedUsername = payload.username ? payload.username.toLowerCase() : payload.username;

    try {
      // Update or create based on edit state.
      if (this.editingId) {
        await this.usersService.update(this.editingId, {
          username: normalizedUsername ?? '',
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email || undefined,
          password: this.showPasswordForm ? (payload.password || undefined) : undefined,
          role_ids: payload.role_ids,
        });
      } else {
        const locale = this.transloco.getActiveLang() as UiLocale;
        await this.usersService.create({
          username: normalizedUsername || undefined,
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email || undefined,
          password: payload.password,
          role_ids: payload.role_ids,
          locale,
        });
      }
      // Close modal and refresh dataset on success.
      this.cancelEdit();
      await this.load();
    } catch (error) {
      // Map backend validation errors into field-specific hints.
      const parsed = parseHttpError(error);
      this.fieldErrors = parsed.fieldErrors ?? {};
      if (!this.hasFieldErrors && parsed.generalKey) {
        if (parsed.generalKey === 'auth.errors.username_taken') {
          this.fieldErrors = { ...this.fieldErrors, username: parsed.generalKey };
        }
        if (parsed.generalKey === 'auth.errors.email_taken') {
          this.fieldErrors = { ...this.fieldErrors, email: parsed.generalKey };
        }
      }
      // Show a general error only when there are no field-level errors.
      const general = this.hasFieldErrors ? '' : (parsed.generalKey ?? 'admin.errors.save_failed');
      this.formErrorMessage = general;
      this.errorMessage = '';
      this.cdr.detectChanges();
    }
  }

  // Open delete confirmation dialog.
  confirmDelete(user: AdminUser): void {
    this.deleteTarget = user;
    this.deleteErrorMessage = '';
  }

  // Close delete confirmation dialog.
  closeDelete(): void {
    this.deleteTarget = null;
    this.deleteErrorMessage = '';
  }

  // Execute delete after confirmation.
  async removeConfirmed(): Promise<void> {
    if (!this.deleteTarget) {
      return;
    }
    try {
      // Delete and refresh list.
      await this.usersService.remove(this.deleteTarget.id);
      this.closeDelete();
      await this.load();
    } catch (error) {
      // Keep deletion errors inside the modal.
      const parsed = parseHttpError(error);
      this.deleteErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    }
  }

  // Open email reset dialog (send happens after confirmation).
  openResetEmail(user: AdminUser): void {
    this.resetTarget = user;
    this.resetMode = 'email';
    this.resetErrorMessage = '';
    this.resetSuccessMessage = '';
    this.resetEmailNeedsConfirm = true;
    this.isResetBusy = false;
  }

  // Send a reset email for the selected user (if email exists).
  async confirmSendResetEmail(): Promise<void> {
    if (!this.resetTarget) {
      return;
    }
    this.resetErrorMessage = '';
    this.resetSuccessMessage = '';
    this.isResetBusy = true;
    try {
      const locale = this.transloco.getActiveLang() as UiLocale;
      await this.usersService.sendPasswordReset(this.resetTarget.id, locale);
      this.resetSuccessMessage = 'admin.users.reset_email_sent';
      this.resetEmailNeedsConfirm = false;
    } catch (error) {
      const parsed = parseHttpError(error);
      this.resetErrorMessage = parsed.generalKey ?? 'admin.users.reset_email_failed';
    } finally {
      this.isResetBusy = false;
      this.cdr.detectChanges();
    }
  }

  // Create a reset link and show it with a QR code.
  async openResetQr(user: AdminUser): Promise<void> {
    this.resetTarget = user;
    this.resetMode = 'qr';
    this.resetLink = '';
    this.resetQrDataUrl = '';
    this.resetErrorMessage = '';
    this.resetSuccessMessage = '';
    this.isResetBusy = true;
    this.resetEmailNeedsConfirm = false;
    try {
      const { url } = await this.usersService.createPasswordResetLink(user.id);
      this.resetLink = url;
      this.resetQrDataUrl = await this.buildQrCode(url);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.resetErrorMessage = parsed.generalKey ?? 'admin.users.reset_link_failed';
    } finally {
      this.isResetBusy = false;
      this.cdr.detectChanges();
    }
  }

  closeResetModal(): void {
    this.resetTarget = null;
    this.resetMode = null;
    this.resetLink = '';
    this.resetQrDataUrl = '';
    this.resetErrorMessage = '';
    this.resetSuccessMessage = '';
    this.resetEmailNeedsConfirm = false;
  }

  private async buildQrCode(value: string): Promise<string> {
    const module = await import('qrcode');
    return module.toDataURL(value, {
      margin: 1,
      width: 200,
      color: {
        dark: '#1f2a44',
        light: '#ffffff'
      }
    });
  }

  // Toggle password update section in edit mode.
  togglePasswordForm(): void {
    // Toggle the optional password edit form in edit mode.
    this.showPasswordForm = !this.showPasswordForm;
    this.showPasswordText = false;
    if (this.showPasswordForm) {
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
      this.form.get('password')?.addValidators(Validators.pattern(CustomValidators.passwordPattern));
    } else {
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.setValue('');
    }
    this.form.get('password')?.updateValueAndValidity({ emitEvent: false });
  }

  // Generate a strong password and mark as touched for validation.
  generatePassword(): void {
    // Generate and populate a strong password, then mark as touched.
    const value = this.randomPassword(12);
    this.form.get('password')?.setValue(value);
    this.form.get('password')?.markAsTouched();
  }


  // Generate a username from email or names; backend enforces uniqueness.
  generateUsername(): void {
    // Basic username suggestion to speed up manual entry.
    const email = this.form.get('email')?.value ?? '';
    const firstName = this.form.get('first_name')?.value ?? '';
    const lastName = this.form.get('last_name')?.value ?? '';
    const base = email ? email.split('@')[0] : `${firstName}.${lastName}`;
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '')
      .replace(/^[._-]+|[._-]+$/g, '');
    const username = (normalized || `user${Math.floor(Math.random() * 10000)}`).toLowerCase();
    this.form.get('username')?.setValue(username);
    this.form.get('username')?.markAsTouched();
  }

  // Toggle password visibility for hybrid input.
  togglePasswordVisibility(): void {
    // Hybrid mode: reveal generated passwords without losing input styling.
    this.showPasswordText = !this.showPasswordText;
  }

  // Cryptographically strong random password generator.
  private randomPassword(length: number): string {
    // Use WebCrypto for a strong random password.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let result = '';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    array.forEach((num) => {
      result += chars[num % chars.length];
    });
    return result;
  }

  // Preselect the guest role if available.
  private defaultRoleIds(): number[] {
    // Preselect the guest role to ensure minimal access on new users.
    const guest = this.roles.find((role) => role.slug === 'guest');
    return guest ? [guest.id] : [];
  }

  private syncUsernameValidators(): void {
    // Username is required unless email is provided (create mode only).
    const usernameControl = this.form.get('username');
    if (!usernameControl) {
      return;
    }
    if (this.isEditing) {
      usernameControl.setValidators([Validators.required]);
      usernameControl.updateValueAndValidity({ emitEvent: false });
      return;
    }
    const email = this.form.get('email')?.value ?? '';
    if (email) {
      usernameControl.clearValidators();
    } else {
      usernameControl.setValidators([Validators.required]);
    }
    usernameControl.updateValueAndValidity({ emitEvent: false });
  }
}
