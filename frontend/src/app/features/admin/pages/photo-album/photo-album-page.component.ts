import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PhotoAlbumService } from '../../../../core/services/photo-album.service';
import { TaskAttachment, TasksService } from '../../../../core/services/tasks.service';
import { AttachmentPreviewCache } from '../../../../core/utils/attachment-preview-cache.util';
import { parseHttpError } from '../../../../core/utils/error-mapper';
import { DateUtils } from '../../../../core/utils/date-utils';
import { TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';

@Component({
  selector: 'app-photo-album-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './photo-album-page.component.html',
  styleUrl: './photo-album-page.component.scss'
})
export class PhotoAlbumPageComponent implements OnDestroy {
  private readonly albumService = inject(PhotoAlbumService);
  private readonly tasksService = inject(TasksService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly previewCache = new AttachmentPreviewCache();

  attachments: TaskAttachment[] = [];
  isLoading = true;
  errorMessage = '';
  formErrorMessage = '';
  deleteErrorMessage = '';
  fieldErrors: Record<string, string> = {};
  editingId: number | null = null;
  searchTerm = '';
  selectedAlbumKey = '';
  availableAlbumKeys: string[] = ['tasks'];
  sortDir: 'asc' | 'desc' = 'desc';
  sortBy: 'created_at' | 'size_bytes' | 'title' = 'created_at';
  page = 1;
  pageSize = 10;
  deleteTarget: TaskAttachment | null = null;
  isFormOpen = false;
  isPreviewOpen = false;
  previewTitle = '';
  previewUrl = '';

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
  });

  constructor() {
    // Initial load and error reset on modal form changes.
    this.load();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formErrorMessage = '';
        this.fieldErrors = {};
      });
  }

  ngOnDestroy(): void {
    this.previewCache.revokeAll();
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.attachments = await this.albumService.list({
        query: this.searchTerm.trim(),
        album_key: this.selectedAlbumKey || undefined,
        sort_by: this.sortBy,
        sort_dir: this.sortDir,
      });
      // Keep list of known keys for dropdown filtering.
      this.availableAlbumKeys = Array.from(new Set(this.attachments.map((item) => item.album_key).filter((key) => key.trim() !== '')))
        .sort((a, b) => a.localeCompare(b));
      await this.preloadCurrentPageThumbs();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredAttachments.length / this.pageSize));
  }

  get filteredAttachments(): TaskAttachment[] {
    return this.attachments;
  }

  get sortedAttachments(): TaskAttachment[] {
    // Sorting is already applied server-side through query params.
    return this.filteredAttachments;
  }

  get pagedAttachments(): TaskAttachment[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedAttachments.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.totalPages);
    void this.preloadCurrentPageThumbs();
  }

  updatePageSize(size: string): void {
    this.pageSize = Number(size);
    this.page = 1;
    void this.preloadCurrentPageThumbs();
  }

  applySearch(): void {
    this.page = 1;
    void this.load();
  }

  applyAlbumFilter(value: string): void {
    this.selectedAlbumKey = value;
    this.page = 1;
    void this.load();
  }

  toggleSortBy(column: 'created_at' | 'size_bytes' | 'title'): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = column === 'created_at' ? 'desc' : 'asc';
    }
    this.page = 1;
    void this.load();
  }

  startEdit(item: TaskAttachment): void {
    this.editingId = item.id;
    this.isFormOpen = true;
    this.fieldErrors = {};
    this.formErrorMessage = '';
    this.form.reset({
      title: item.title,
    });
  }

  cancelEdit(): void {
    this.isFormOpen = false;
    this.editingId = null;
    this.fieldErrors = {};
    this.formErrorMessage = '';
  }

  async save(): Promise<void> {
    if (!this.editingId) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = {
      title: this.form.controls.title.value.trim(),
    };
    if (!payload.title) {
      this.form.markAllAsTouched();
      return;
    }

    try {
      await this.albumService.update(this.editingId, payload);
      this.cancelEdit();
      await this.load();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.fieldErrors = parsed.fieldErrors ?? {};
      this.formErrorMessage = this.hasFieldErrors ? '' : (parsed.generalKey ?? 'admin.errors.save_failed');
      this.cdr.detectChanges();
    }
  }

  confirmDelete(item: TaskAttachment): void {
    this.deleteTarget = item;
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
      await this.albumService.remove(this.deleteTarget.id);
      this.previewCache.revokeOne(this.deleteTarget.id);
      this.closeDelete();
      await this.load();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.deleteErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    }
  }

  thumbUrl(attachmentId: number): string | null {
    return this.previewCache.getCachedUrl(attachmentId);
  }

  async openPreview(item: TaskAttachment): Promise<void> {
    this.errorMessage = '';
    try {
      const url = await this.previewCache.resolveUrl(this.tasksService, item);
      this.previewTitle = item.title || item.original_name || `#${item.id}`;
      this.previewUrl = url;
      this.isPreviewOpen = true;
      this.cdr.detectChanges();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
      this.cdr.detectChanges();
    }
  }

  /**
   * Open linked reference from album row.
   *
   * Current implementation supports task-linked photos.
   */
  openReference(item: TaskAttachment): void {
    if (item.album_key === 'tasks' && item.task_id) {
      void this.router.navigate(['/dashboard/tasks/new'], {
        queryParams: { open_task: item.task_id },
      });
    }
  }

  canOpenReference(item: TaskAttachment): boolean {
    return item.album_key === 'tasks' && !!item.task_id;
  }

  closePreview(): void {
    this.isPreviewOpen = false;
    this.previewTitle = '';
    this.previewUrl = '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDate(iso: string | null): string {
    if (!iso) {
      return '-';
    }
    const date = new Date(iso);
    const locale = this.transloco.getActiveLang() === 'fa' ? 'fa-IR' : 'en-GB';
    const rendered = new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return this.transloco.getActiveLang() === 'fa' ? DateUtils.toPersianDigits(rendered) : rendered;
  }

  isRtl(): boolean {
    return this.transloco.getActiveLang() === 'fa';
  }

  formatPageNumber(value: number): string {
    const text = String(value);
    return this.isRtl() ? DateUtils.toPersianDigits(text) : text;
  }

  /**
   * Preload thumbnails only for currently visible page items.
   */
  private async preloadCurrentPageThumbs(): Promise<void> {
    for (const item of this.pagedAttachments) {
      try {
        await this.previewCache.resolveUrl(this.tasksService, item);
      } catch {
        // Thumbnail failures are isolated and should not stop page rendering.
      }
    }
    this.cdr.detectChanges();
  }
}
