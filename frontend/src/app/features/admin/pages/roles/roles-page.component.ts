import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminRolesService, AdminRoleDetail } from '../../../../core/services/admin-roles.service';
import { AdminPermissionsService, AdminPermission } from '../../../../core/services/admin-permissions.service';
import { parseHttpError } from '../../../../core/utils/error-mapper';
import { DateUtils } from '../../../../core/utils/date-utils';

@Component({
  selector: 'app-roles-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './roles-page.component.html',
  styleUrl: './roles-page.component.scss'
})
export class RolesPageComponent {
  // Service dependencies for data access and UI updates.
  private readonly rolesService = inject(AdminRolesService);
  private readonly permissionsService = inject(AdminPermissionsService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private roleLabels: Record<string, string> = {};

  // Table + modal state.
  roles: AdminRoleDetail[] = [];
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
  permissionSearch = '';
  sortKey: 'name' | 'slug' | 'permissions' = 'name';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 1;
  pageSize = 10;
  deleteTarget: AdminRoleDetail | null = null;

  // Reactive form for role creation/editing.
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    slug: ['', [Validators.required]],
    permission_ids: [[] as number[]],
  });

  constructor() {
    // Initial data fetch for roles and permissions.
    this.load();
    // Clear errors on any field interaction to avoid stale messages.
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.errorMessage = '';
        this.formErrorMessage = '';
        this.fieldErrors = {};
      });

    this.transloco
      .selectTranslation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((translation) => {
        this.roleLabels = this.extractRoleLabels(translation as Record<string, unknown>);
      });
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  async load(): Promise<void> {
    // Fetch roles + permissions in parallel.
    this.isLoading = true;
    try {
      const [roles, permissions] = await Promise.all([
        this.rolesService.list(),
        this.permissionsService.list(),
      ]);
      this.roles = roles;
      this.permissions = permissions;
    } catch (error) {
      // Normalize backend errors to translation keys.
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      // Always end loading state to avoid spinner lock.
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRoles.length / this.pageSize));
  }

  get filteredRoles(): AdminRoleDetail[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return this.roles;
    }
    // Match role name/slug and assigned permissions.
    return this.roles.filter((role) => {
      const permissions = role.permissions.map((permission: AdminPermission) => permission.name).join(' ');
      const haystack = `${role.name} ${role.slug} ${permissions}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  get sortedRoles(): AdminRoleDetail[] {
    const items = [...this.filteredRoles];
    const dir = this.sortDir === 'asc' ? 1 : -1;
    // Use stable, locale-aware ordering for better UX.
    return items.sort((a, b) => {
      const valueA = this.sortValue(a);
      const valueB = this.sortValue(b);
      return valueA.localeCompare(valueB) * dir;
    });
  }

  get pagedRoles(): AdminRoleDetail[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedRoles.slice(start, start + this.pageSize);
  }

  get filteredPermissions(): AdminPermission[] {
    const query = this.permissionSearch.trim().toLowerCase();
    if (!query) {
      return this.permissions;
    }
    // Support quick filtering in the permission pill picker.
    return this.permissions.filter((permission) => {
      const haystack = `${permission.name} ${permission.slug}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  private sortValue(role: AdminRoleDetail): string {
    if (this.sortKey === 'slug') {
      return role.slug.toLowerCase();
    }
    if (this.sortKey === 'permissions') {
      return role.permissions.map((permission: AdminPermission) => permission.name).join(',').toLowerCase();
    }
    return this.roleLabel(role).toLowerCase();
  }

  setPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    this.page = next;
  }

  setSort(key: 'name' | 'slug' | 'permissions'): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDir = 'asc';
  }

  updatePageSize(size: string): void {
    // Reset pagination when page size changes.
    this.pageSize = Number(size);
    this.page = 1;
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
      permission_ids: [],
    });
  }

  startEdit(role: AdminRoleDetail): void {
    // Open modal in edit mode with prefilled values.
    this.isEditing = true;
    this.isFormOpen = true;
    this.editingId = role.id;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      name: role.name,
      slug: role.slug,
      permission_ids: role.permissions.map((permission: AdminPermission) => permission.id),
    });
  }

  cancelEdit(): void {
    // Close modal.
    this.isEditing = false;
    this.isFormOpen = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
  }

  togglePermission(permissionId: number): void {
    // Toggle permission pill selection.
    const current = new Set(this.form.controls.permission_ids.value);
    if (current.has(permissionId)) {
      current.delete(permissionId);
    } else {
      current.add(permissionId);
    }
    this.form.controls.permission_ids.setValue([...current]);
  }

  roleLabel(role: { name: string; slug?: string }): string {
    // Use localized role labels when available.
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

  // Detect RTL mode based on the active language.
  isRtl(): boolean {
    return this.transloco.getActiveLang() === 'fa';
  }

  // Format pagination numbers based on the active language.
  formatPageNumber(value: number): string {
    const text = String(value);
    return this.isRtl() ? DateUtils.toPersianDigits(text) : text;
  }

  async save(): Promise<void> {
    // Create or update role based on edit state.
    if (this.form.invalid) {
      // Show validation errors immediately.
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    const payload = this.form.getRawValue();

    try {
      // Persist via API.
      if (this.editingId) {
        await this.rolesService.update(this.editingId, payload);
      } else {
        await this.rolesService.create(payload);
      }
      // Close modal and refresh list on success.
      this.cancelEdit();
      await this.load();
    } catch (error) {
      // Map backend field errors into modal hints.
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
      // Only show a general error if there are no field-level errors.
      const general = this.hasFieldErrors ? '' : (parsed.generalKey ?? 'admin.errors.save_failed');
      this.formErrorMessage = general;
      this.errorMessage = '';
      this.cdr.detectChanges();
    }
  }

  confirmDelete(role: AdminRoleDetail): void {
    // Open delete confirmation dialog.
    this.deleteTarget = role;
    this.deleteErrorMessage = '';
  }

  closeDelete(): void {
    // Close delete confirmation dialog.
    this.deleteTarget = null;
    this.deleteErrorMessage = '';
  }

  async removeConfirmed(): Promise<void> {
    // Execute delete after confirmation.
    if (!this.deleteTarget) {
      return;
    }
    try {
      // Delete and refresh the list.
      await this.rolesService.remove(this.deleteTarget.id);
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
