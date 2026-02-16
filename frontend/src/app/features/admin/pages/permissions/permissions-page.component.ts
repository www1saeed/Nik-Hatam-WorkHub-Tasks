import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminPermissionsService, AdminPermission } from '../../../../core/services/admin-permissions.service';
import { parseHttpError } from '../../../../core/utils/error-mapper';
import { DateUtils } from '../../../../core/utils/date-utils';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-permissions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './permissions-page.component.html',
  styleUrl: './permissions-page.component.scss'
})
export class PermissionsPageComponent {
  private readonly permissionsService = inject(AdminPermissionsService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  // Table + modal state for permissions.
  permissions: AdminPermission[] = [];
  isLoading = true;
  isEditing = false;
  isFormOpen = false;
  errorMessage = '';
  formErrorMessage = '';
  deleteErrorMessage = '';
  fieldErrors: Record<string, string> = {};
  editingId: number | null = null;
  searchTerm = '';
  sortKey: 'name' | 'slug' = 'name';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 1;
  pageSize = 10;
  deleteTarget: AdminPermission | null = null;

  // Reactive form for permission creation/editing.
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    slug: ['', [Validators.required]],
  });

  constructor() {
    // Initial load and error reset on input changes.
    this.load();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.errorMessage = '';
        this.formErrorMessage = '';
        this.fieldErrors = {};
      });
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.permissions = await this.permissionsService.list();
    } catch (error) {
      // Normalize error response into translation keys.
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      // Always drop loading state for consistent UX.
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPermissions.length / this.pageSize));
  }

  get filteredPermissions(): AdminPermission[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return this.permissions;
    }
    // Search across name and slug.
    return this.permissions.filter((permission) => {
      const haystack = `${permission.name} ${permission.slug}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  get sortedPermissions(): AdminPermission[] {
    const items = [...this.filteredPermissions];
    const dir = this.sortDir === 'asc' ? 1 : -1;
    // Keep deterministic ordering across renders.
    return items.sort((a, b) => {
      const valueA = this.sortValue(a);
      const valueB = this.sortValue(b);
      return valueA.localeCompare(valueB) * dir;
    });
  }

  get pagedPermissions(): AdminPermission[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedPermissions.slice(start, start + this.pageSize);
  }

  private sortValue(permission: AdminPermission): string {
    if (this.sortKey === 'slug') {
      return permission.slug.toLowerCase();
    }
    return permission.name.toLowerCase();
  }

  setPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    this.page = next;
  }

  setSort(key: 'name' | 'slug'): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDir = 'asc';
  }

  updatePageSize(size: string): void {
    // Reset pagination when the page size changes.
    this.pageSize = Number(size);
    this.page = 1;
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

  startCreate(): void {
    // Open modal in create mode.
    this.isEditing = false;
    this.isFormOpen = true;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      name: '',
      slug: '',
    });
  }

  startEdit(permission: AdminPermission): void {
    // Open modal in edit mode with prefilled values.
    this.isEditing = true;
    this.isFormOpen = true;
    this.editingId = permission.id;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      name: permission.name,
      slug: permission.slug,
    });
  }

  cancelEdit(): void {
    // Close modal and reset error state.
    this.isEditing = false;
    this.isFormOpen = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      // Surface client-side validation immediately.
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    const payload = this.form.getRawValue();

    try {
      // Create or update based on edit state.
      if (this.editingId) {
        await this.permissionsService.update(this.editingId, payload);
      } else {
        await this.permissionsService.create(payload);
      }
      // Close modal and refresh data after successful save.
      this.cancelEdit();
      await this.load();
    } catch (error) {
      // Map backend validation errors into field-level hints.
      const parsed = parseHttpError(error);
      this.fieldErrors = parsed.fieldErrors ?? {};
      if (!this.hasFieldErrors && parsed.generalKey) {
        if (parsed.generalKey === 'admin.errors.slug_taken') {
          this.fieldErrors = { ...this.fieldErrors, slug: parsed.generalKey };
        }
        if (parsed.generalKey === 'admin.errors.name_taken') {
          this.fieldErrors = { ...this.fieldErrors, name: parsed.generalKey };
        }
      }
      // Only show a general error if field errors are absent.
      const general = this.hasFieldErrors ? '' : (parsed.generalKey ?? 'admin.errors.save_failed');
      this.formErrorMessage = general;
      this.errorMessage = '';
      this.cdr.detectChanges();
    }
  }

  confirmDelete(permission: AdminPermission): void {
    // Open delete confirmation dialog.
    this.deleteTarget = permission;
    this.deleteErrorMessage = '';
  }

  closeDelete(): void {
    this.deleteTarget = null;
    this.deleteErrorMessage = '';
  }

  async removeConfirmed(): Promise<void> {
    if (!this.deleteTarget) {
      return;
    }
    try {
      // Delete and refresh list.
      await this.permissionsService.remove(this.deleteTarget.id);
      this.closeDelete();
      await this.load();
    } catch (error) {
      // Keep delete errors inside the modal.
      const parsed = parseHttpError(error);
      this.deleteErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    }
  }
}
