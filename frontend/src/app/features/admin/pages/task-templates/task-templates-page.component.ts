import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TaskTemplate, TaskTemplatesService } from '../../../../core/services/task-templates.service';
import { parseHttpError } from '../../../../core/utils/error-mapper';
import { DateUtils } from '../../../../core/utils/date-utils';

@Component({
  selector: 'app-task-templates-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './task-templates-page.component.html',
  styleUrl: './task-templates-page.component.scss'
})
export class TaskTemplatesPageComponent {
  private readonly taskTemplatesService = inject(TaskTemplatesService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  // List + modal state.
  templates: TaskTemplate[] = [];
  isLoading = true;
  isEditing = false;
  isFormOpen = false;
  errorMessage = '';
  formErrorMessage = '';
  deleteErrorMessage = '';
  fieldErrors: Record<string, string> = {};
  editingId: number | null = null;
  searchTerm = '';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 1;
  pageSize = 10;
  deleteTarget: TaskTemplate | null = null;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
  });

  constructor() {
    // Initial load and modal error reset on input changes.
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
      this.templates = await this.taskTemplatesService.list();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTemplates.length / this.pageSize));
  }

  get filteredTemplates(): TaskTemplate[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return this.templates;
    }
    // Title-only filter for quick configuration searches.
    return this.templates.filter((template) => template.title.toLowerCase().includes(query));
  }

  get sortedTemplates(): TaskTemplate[] {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...this.filteredTemplates].sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()) * dir
    );
  }

  get pagedTemplates(): TaskTemplate[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedTemplates.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.totalPages);
  }

  toggleSort(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
  }

  updatePageSize(size: string): void {
    this.pageSize = Number(size);
    this.page = 1;
  }

  isRtl(): boolean {
    return this.transloco.getActiveLang() === 'fa';
  }

  formatPageNumber(value: number): string {
    const text = String(value);
    return this.isRtl() ? DateUtils.toPersianDigits(text) : text;
  }

  startCreate(): void {
    this.isEditing = false;
    this.isFormOpen = true;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({ title: '' });
  }

  startEdit(template: TaskTemplate): void {
    this.isEditing = true;
    this.isFormOpen = true;
    this.editingId = template.id;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({ title: template.title });
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.isFormOpen = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = { title: this.form.controls.title.value.trim() };
    if (!payload.title) {
      this.form.controls.title.setErrors({ required: true });
      return;
    }

    try {
      if (this.editingId) {
        await this.taskTemplatesService.update(this.editingId, payload);
      } else {
        await this.taskTemplatesService.create(payload);
      }

      this.cancelEdit();
      await this.load();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.fieldErrors = parsed.fieldErrors ?? {};
      this.formErrorMessage = this.hasFieldErrors ? '' : (parsed.generalKey ?? 'admin.errors.save_failed');
      this.cdr.detectChanges();
    }
  }

  confirmDelete(template: TaskTemplate): void {
    this.deleteTarget = template;
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
      await this.taskTemplatesService.remove(this.deleteTarget.id);
      this.closeDelete();
      await this.load();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.deleteErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    }
  }
}

