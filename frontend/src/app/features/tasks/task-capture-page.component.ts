import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AutoCompleteSelectEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { JalaliDatepickerComponent } from '../../shared/jalali-datepicker.component';
import { TaskAssigneeOption, TaskAttachment, TaskComment, TaskDeadLetterEntry, TaskItem, TasksService } from '../../core/services/tasks.service';
import { TaskTemplatesService } from '../../core/services/task-templates.service';
import { DateUtils } from '../../core/utils/date-utils';
import { TaskDateTimeUtils } from '../../core/utils/task-datetime.util';
import { TaskTemplateSuggestionsUtils } from '../../core/utils/task-template-suggestions.util';
import { parseHttpError } from '../../core/utils/error-mapper';
import { AttachmentPreviewCache } from '../../core/utils/attachment-preview-cache.util';

interface AssigneeUiOption {
  id: number;
  label: string;
}

interface TaskGroup {
  dateKey: string;
  label: string;
  tasks: TaskItem[];
}

interface StaffDayGroup {
  assigneeId: number;
  assigneeLabel: string;
  tasks: TaskItem[];
}

@Component({
  selector: 'app-task-capture-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslocoPipe,
    AutoCompleteModule,
    MultiSelectModule,
    ToggleSwitchModule,
    DialogModule,
    JalaliDatepickerComponent
  ],
  templateUrl: './task-capture-page.component.html',
  styleUrl: './task-capture-page.component.scss'
})
export class TaskCapturePageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly taskTemplatesService = inject(TaskTemplatesService);
  private readonly tasksService = inject(TasksService);
  private readonly authService = inject(AuthService);
  readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private activeSearchToken = 0;

  tasks: TaskItem[] = [];
  deadLetters: TaskDeadLetterEntry[] = [];
  // Cached "recent own titles" for instant suggestions when autocomplete query is empty.
  // This avoids a roundtrip and gives users fast access to recurring daily responsibilities.
  recentOwnTitles: string[] = [];
  assigneeOptions: AssigneeUiOption[] = [];
  selectedAssigneeFilterId: number | null = null;
  /**
   * Canonical selected date for staff-day board.
   *
   * Storage rule:
   * - always keep as Gregorian `YYYY-MM-DD`
   * - convert to/from Jalali only for FA input/output
   */
  selectedStaffDayGregorian = this.todayGregorianDate();
  templateSuggestions: string[] = [];
  selectedTemplateTitle: string | null = null;
  isLoading = true;
  isSearching = false;
  isSyncingNow = false;
  errorMessage = '';
  successMessage = '';

  isTaskModalOpen = false;
  isTaskModalSubmitting = false;
  editingTaskId: number | null = null;
  editingCanSetDone = false;
  taskModalError = '';
  taskModalFieldErrors: Record<string, string[]> = {};
  formAttachmentFiles: File[] = [];
  formAttachmentError = '';

  isDetailModalOpen = false;
  isDetailLoading = false;
  detailTask: TaskItem | null = null;
  detailComment = '';
  isDetailCommentSubmitting = false;
  deletingCommentId: number | null = null;
  isAttachmentUploading = false;
  deletingAttachmentId: number | null = null;
  attachmentErrorMessage = '';
  isAttachmentPreviewOpen = false;
  attachmentPreviewTitle = '';
  attachmentPreviewUrl = '';
  isCameraDialogOpen = false;
  isCameraStarting = false;
  cameraErrorMessage = '';
  cameraTarget: 'detail' | 'form' = 'detail';
  private cameraStream: MediaStream | null = null;
  @ViewChild('attachmentCameraVideo') attachmentCameraVideoRef?: ElementRef<HTMLVideoElement>;
  private readonly attachmentPreviewCache = new AttachmentPreviewCache();

  isDeleteModalOpen = false;
  deleteTarget: TaskItem | null = null;
  deleteError = '';

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    // Status is editable in the modal to allow direct open<->done transitions during edits.
    // We keep "open" as default for new items and let the backend enforce final permissions.
    status: this.fb.nonNullable.control<'open' | 'done'>('open'),
    assigned_user_ids: this.fb.nonNullable.control<number[]>([], [Validators.required]),
    starts_date: [''],
    starts_time: [''],
    ends_date: [''],
    ends_time: [''],
  });

  constructor() {
    // Initial page bootstrap:
    // 1) load visible tasks
    // 2) load assignable users
    // 3) prepare UI state for modal/edit operations
    this.loadInitialData();
    // Route bootstrap for deep-link actions:
    // - `?open_new=1|true` opens create modal
    // - `?open_task=<id>` opens detail modal for that task id
    // - consumed params are removed from URL to avoid reopening on refresh/back
    this.handleRouteDrivenCreateIntent();

    this.form.controls.title.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value !== this.selectedTemplateTitle) {
          this.selectedTemplateTitle = null;
        }
      });
  }

  /**
   * Cleanup object URLs created for attachment previews.
   */
  ngOnDestroy(): void {
    this.closeCameraDialog();
    this.attachmentPreviewCache.revokeAll();
  }

  /**
   * Return open tasks scheduled before today.
   *
   * Purpose:
   * - surfaces overdue work at the top of the page for faster triage.
   */
  get overdueOpenTasks(): TaskItem[] {
    // "Overdue" definition for this workspace:
    // - status is open
    // - task date is before today (local date)
    // These are intentionally shown in a dedicated section at the top.
    const todayKey = this.todayKey();
    return this.tasks
      .filter((task) => task.status === 'open' && this.taskDateKey(task) < todayKey)
      .sort((a, b) => this.taskSortTs(a) - this.taskSortTs(b));
  }

  /**
   * Group remaining tasks (today and future) by date key for section rendering.
   *
   * Notes:
   * - overdue open tasks are intentionally excluded from this grouping
   * - groups are sorted by task timestamp ascending
   */
  get groupedTasks(): TaskGroup[] {
    // Group upcoming/current tasks by local day key (YYYY-MM-DD).
    // Only tasks from today forward are included here because overdue open tasks
    // are rendered in a dedicated section above.
    const todayKey = this.todayKey();
    const items = this.tasks
      .filter((task) => this.taskDateKey(task) >= todayKey)
      .sort((a, b) => this.taskSortTs(a) - this.taskSortTs(b));

    const grouped = new Map<string, TaskItem[]>();
    for (const task of items) {
      const key = this.taskDateKey(task);
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }

    return [...grouped.entries()].map(([dateKey, tasks]) => ({
      dateKey,
      label: this.formatDateKey(dateKey),
      tasks,
    }));
  }

  /**
   * Quick UI helper to decide whether empty-state should be shown.
   */
  get hasAnyTask(): boolean {
    return this.tasks.length > 0;
  }

  /**
   * At least one visible task still has pending offline mutations.
   */
  get hasPendingSyncTasks(): boolean {
    return this.tasks.some((task) => task.is_pending === true && !task.sync_error);
  }

  /**
   * At least one visible task has failed sync state.
   */
  get hasFailedSyncTasks(): boolean {
    return this.tasks.some((task) => !!task.sync_error);
  }

  /**
   * Dead-letter entries indicate exhausted outbox mutations.
   */
  get hasDeadLetters(): boolean {
    return this.deadLetters.length > 0;
  }

  /**
   * Show staff filter only for elevated permission holders.
   */
  get canFilterByPersonnel(): boolean {
    return this.authService.hasPermission('manage_staffs');
  }

  /**
   * Creator metadata is privileged and should be visible only for manage_staffs.
   */
  get canViewCreatorInfo(): boolean {
    return this.authService.hasPermission('manage_staffs');
  }

  /**
   * Return selected staff-board date in UI calendar format.
   *
   * Output format:
   * - FA: Jalali `YYYY/MM/DD`
   * - EN: Gregorian `YYYY-MM-DD`
   */
  get selectedStaffDayDisplayValue(): string {
    if (this.languageService.getLanguage() === 'fa') {
      return DateUtils.toJalali(this.selectedStaffDayGregorian);
    }
    return this.selectedStaffDayGregorian;
  }

  /**
   * Build simple day-board grouped by personnel for manage_staffs users.
   *
   * Grouping rule:
   * - one group per assigned person
   * - tasks can appear in multiple groups when multi-assigned
   */
  get staffDayGroups(): StaffDayGroup[] {
    if (!this.canFilterByPersonnel) {
      return [];
    }

    const targetDateKey = this.selectedStaffDayGregorian;
    const dayTasks = this.tasks.filter((task) => this.taskDateKey(task) === targetDateKey);
    if (dayTasks.length === 0) {
      return [];
    }

    const grouped = new Map<number, StaffDayGroup>();
    for (const task of dayTasks) {
      const assignees = task.assigned_users ?? [];
      for (const assignee of assignees) {
        const label = `${assignee.first_name} ${assignee.last_name}`.trim() || assignee.username || `#${assignee.id}`;
        const existing = grouped.get(assignee.id) ?? {
          assigneeId: assignee.id,
          assigneeLabel: label,
          tasks: [],
        };
        existing.tasks.push(task);
        grouped.set(assignee.id, existing);
      }
    }

    return [...grouped.values()].sort((a, b) => a.assigneeLabel.localeCompare(b.assigneeLabel));
  }

  /**
   * Template convenience getter for title form control.
   */
  get titleControl() {
    return this.form.controls.title;
  }

  /**
   * Template convenience getter for assignee form control.
   */
  get assigneeControl() {
    return this.form.controls.assigned_user_ids;
  }

  /**
   * Template convenience getter for status form control.
   */
  get statusControl() {
    return this.form.controls.status;
  }

  /**
   * Bridge enum status to toggle checked state.
   */
  get isDoneChecked(): boolean {
    return this.statusControl.value === 'done';
  }

  /**
   * Determine whether status toggle is interactive in current modal mode.
   */
  get canToggleDoneInForm(): boolean {
    // Create flow: allow immediate "done" marking.
    // Edit flow: respect backend capability mirror.
    return !this.editingTaskId || this.editingCanSetDone;
  }

  /**
   * Navigate to scheduler page from task list toolbar.
   */
  openScheduler(): void {
    // Scheduler is intentionally not a sidebar entry anymore.
    // Navigation is exposed as an inline action button in this page.
    void this.router.navigateByUrl('/dashboard/tasks/scheduler');
  }

  /**
   * Apply personnel filter and reload visible tasks.
   */
  onAssigneeFilterChange(rawValue: string): void {
    // Empty value means "all personnel".
    // We normalize invalid values to null to avoid accidental bad API query params.
    const parsed = Number(rawValue);
    this.selectedAssigneeFilterId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    void this.loadTasks();
  }

  /**
   * Update selected day for manager personnel-board.
   *
   * Input format:
   * - FA input emits Jalali value from datepicker
   * - EN input emits Gregorian date value
   */
  onStaffDayChange(rawValue: string): void {
    const normalizedRaw = (rawValue ?? '').trim();
    if (!normalizedRaw) {
      return;
    }

    if (this.languageService.getLanguage() === 'fa') {
      const jalali = DateUtils.normalizeJalaliInput(DateUtils.toLatinDigits(normalizedRaw));
      if (!DateUtils.isJalaliFormat(jalali)) {
        return;
      }
      const gregorian = DateUtils.toGregorian(jalali);
      if (!DateUtils.isValidGregorianDate(gregorian)) {
        return;
      }
      this.selectedStaffDayGregorian = gregorian;
      return;
    }

    const gregorian = DateUtils.normalizeGregorian(DateUtils.toLatinDigits(normalizedRaw));
    if (!gregorian || !DateUtils.isValidGregorianDate(gregorian)) {
      return;
    }
    this.selectedStaffDayGregorian = gregorian;
  }

  /**
   * Open modal in create mode and initialize defaults.
   *
   * Defaults:
   * - assigned to current user
   * - start date/time prefilled with "now"
   */
  openCreateModal(): void {
    // Reset create modal state to avoid leaking validation/errors from previous runs.
    this.editingTaskId = null;
    this.editingCanSetDone = false;
    this.taskModalError = '';
    this.taskModalFieldErrors = {};
    this.formAttachmentFiles = [];
    this.formAttachmentError = '';
    this.form.reset({
      title: '',
      status: 'open',
      // Product rule: new responsibilities should be auto-assigned to the creator/current user.
      // If current user id is unavailable, we gracefully fallback to empty selection.
      assigned_user_ids: this.defaultAssigneeIds(),
      starts_date: this.defaultDateValue(),
      starts_time: this.defaultTimeValue(),
      ends_date: '',
      ends_time: '',
    });
    this.selectedTemplateTitle = null;
    this.templateSuggestions = [];
    this.isTaskModalOpen = true;
  }

  /**
   * Open modal in edit mode with task data prefilled.
   *
   * Guard:
   * - method exits early when backend flags task as non-editable.
   */
  openEditModal(task: TaskItem): void {
    // UI guard: edit only if backend says user has edit permission.
    if (!task.can_edit) {
      return;
    }

    this.editingTaskId = task.id;
    // "done" selection is exposed when backend capability already allows mark-done,
    // or when task is already done (to allow switching back to open if needed).
    this.editingCanSetDone = task.can_mark_done || task.status === 'done';
    this.taskModalError = '';
    this.taskModalFieldErrors = {};
    this.formAttachmentFiles = [];
    this.formAttachmentError = '';
    this.form.reset({
      title: task.title,
      // Existing status is loaded so edit modal can explicitly switch to done/open.
      status: task.status,
      assigned_user_ids: task.assigned_users.map((user) => user.id),
      starts_date: this.toInputDate(task.starts_at ?? task.created_at),
      starts_time: this.toInputTime(task.starts_at ?? task.created_at),
      ends_date: this.toInputDate(task.ends_at),
      ends_time: this.toInputTime(task.ends_at),
    });
    this.selectedTemplateTitle = null;
    this.templateSuggestions = [];
    this.isTaskModalOpen = true;
  }

  /**
   * Close task modal and clear all modal-scoped state.
   */
  closeTaskModal(): void {
    this.isTaskModalOpen = false;
    this.taskModalError = '';
    this.taskModalFieldErrors = {};
    this.editingTaskId = null;
    this.editingCanSetDone = false;
    this.formAttachmentFiles = [];
    this.formAttachmentError = '';
    if (this.cameraTarget === 'form') {
      this.closeCameraDialog();
    }
  }

  /**
   * Query task template suggestions for autocomplete dropdown.
   *
   * Concurrency:
   * - uses token-based cancellation to prevent stale results from older requests.
   */
  async searchTemplates(event: { query?: string }): Promise<void> {
    // Monotonic token prevents race-condition UI updates when users type fast:
    // only the latest search request may update suggestions.
    const query = (event.query ?? '').trim();
    this.activeSearchToken += 1;
    const currentToken = this.activeSearchToken;

    this.taskModalError = '';
    // Empty query path: show most-recent own titles first.
    // This is intentionally local and immediate to support quick capture workflows.
    if (!query) {
      this.templateSuggestions = [...this.recentOwnTitles];
      this.isSearching = false;
      this.cdr.detectChanges();
      return;
    }

    this.isSearching = true;
    try {
      const templates = await this.taskTemplatesService.search(query);
      if (currentToken !== this.activeSearchToken) {
        return;
      }
      // UX rule for autocomplete list:
      // 1) titles that START with the typed query come first
      // 2) titles that only CONTAIN the query come after
      // This keeps "prefix matches" at the top while still preserving broader LIKE results.
      const titles = templates.map((template) => template.title);
      this.templateSuggestions = TaskTemplateSuggestionsUtils.rankTitlesByPrefix(query, titles);
    } catch {
      if (currentToken !== this.activeSearchToken) {
        return;
      }
      this.templateSuggestions = [];
      this.taskModalError = 'admin.tasks.search_failed';
    } finally {
      if (currentToken === this.activeSearchToken) {
        this.isSearching = false;
      }
      this.cdr.detectChanges();
    }
  }

  /**
   * Persist selected template title marker to detect manual edits afterwards.
   */
  onTemplateSelected(event: AutoCompleteSelectEvent): void {
    this.selectedTemplateTitle = String(event.value ?? '');
  }

  /**
   * Trigger manual replay of offline queue and refresh task snapshot.
   */
  async syncNow(): Promise<void> {
    if (this.isSyncingNow) {
      return;
    }

    this.isSyncingNow = true;
    this.errorMessage = '';
    try {
      await this.tasksService.forceSyncNow();
      await this.loadTasks();
      this.refreshDeadLetters();
      this.successMessage = 'admin.tasks.sync_now_success';
    } catch {
      this.errorMessage = 'admin.tasks.sync_now_failed';
    } finally {
      this.isSyncingNow = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Convert toggle boolean into status enum expected by API payload.
   */
  onDoneToggle(checked: boolean): void {
    // Checkbox maps to enum status in form payload:
    // true -> done, false -> open.
    this.statusControl.setValue(checked ? 'done' : 'open');
  }

  /**
   * Validate form, build API payload, then create or update task.
   *
   * Behavior:
   * - create mode posts new task
   * - edit mode patches existing task
   * - on success reloads list and closes modal
   */
  async saveTask(): Promise<void> {
    // Modal-scoped error state (kept separate from page-level errors).
    this.taskModalError = '';
    this.taskModalFieldErrors = {};

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const title = this.form.controls.title.value.trim();
    if (!title) {
      this.form.controls.title.setErrors({ required: true });
      return;
    }

    const assignedUserIds = this.form.controls.assigned_user_ids.value;
    if (!assignedUserIds || assignedUserIds.length === 0) {
      this.form.controls.assigned_user_ids.setErrors({ required: true });
      return;
    }

    this.isTaskModalSubmitting = true;
    try {
      // Convert local datetime-local inputs to ISO before sending.
      // Backend will normalize to UTC for storage.
      const payload = {
        title,
        assigned_user_ids: assignedUserIds,
        starts_at: this.combineDateTimeForApi(
          this.form.controls.starts_date.value,
          this.form.controls.starts_time.value
        ),
        ends_at: this.combineDateTimeForApi(
          this.form.controls.ends_date.value,
          this.form.controls.ends_time.value
        ),
      };

      if (this.editingTaskId) {
        // Edit flow
        const statusPatch = this.editingCanSetDone ? { status: this.form.controls.status.value } : {};
        const updated = await this.tasksService.update(this.editingTaskId, { ...payload, ...statusPatch });
        // Allow adding photos during edit directly from task modal.
        if (this.formAttachmentFiles.length > 0) {
          await this.tasksService.uploadAttachments(updated.id, this.formAttachmentFiles);
        }
        this.successMessage = 'admin.tasks.updated_success';
      } else {
        // Create flow
        const created = await this.tasksService.create({ ...payload, status: this.form.controls.status.value });
        if (this.formAttachmentFiles.length > 0) {
          await this.tasksService.uploadAttachments(created.id, this.formAttachmentFiles);
        }
        this.successMessage = 'admin.tasks.captured_success';
      }

      this.closeTaskModal();
      try {
        // Best-effort refresh:
        // in offline mode optimistic cache is already updated by service,
        // so failing list refresh must not turn save flow into an error.
        await this.loadTasks();
      } catch {
        this.cdr.detectChanges();
      }
      this.refreshDeadLetters();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.taskModalError = parsed.generalKey ?? 'admin.errors.save_failed';
      this.taskModalFieldErrors = this.extractFieldErrors(error);
      this.cdr.detectChanges();
    } finally {
      this.isTaskModalSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Open details dialog and fetch fresh task data from backend.
   *
   * Rationale:
   * - detail payload may contain newer comments/capability flags than list snapshot.
   */
  async openDetails(task: TaskItem): Promise<void> {
    // Delegate to id-based loader so UI-triggered and deep-link-triggered
    // detail opens share exactly the same behavior and loading states.
    await this.openDetailsById(task.id);
  }

  /**
   * Close detail dialog and reset transient comment/delete state.
   */
  closeDetailModal(): void {
    this.isDetailModalOpen = false;
    this.isDetailLoading = false;
    this.detailTask = null;
    this.detailComment = '';
    this.deletingCommentId = null;
    this.isAttachmentUploading = false;
    this.deletingAttachmentId = null;
    this.attachmentErrorMessage = '';
    this.closeAttachmentPreview();
    this.closeCameraDialog();
    // Clear all attachment blob URLs loaded for the closed detail context.
    this.attachmentPreviewCache.revokeAll();
  }

  /**
   * Post a new comment from detail dialog and refresh local task cache.
   */
  async submitDetailComment(): Promise<void> {
    // Only users with edit rights can add comments.
    // This mirrors backend authorization and keeps UX predictable.
    if (!this.detailTask || !this.detailTask.can_edit || !this.detailComment.trim() || this.isDetailCommentSubmitting) {
      return;
    }

    this.isDetailCommentSubmitting = true;
    this.errorMessage = '';
    try {
      const updated = await this.tasksService.addComment(this.detailTask.id, this.detailComment.trim());
      this.detailTask = updated;
      this.detailComment = '';
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.successMessage = 'admin.tasks.comment_saved';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
    } finally {
      this.isDetailCommentSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Delete one comment from detail dialog when permission allows it.
   */
  async deleteDetailComment(comment: TaskComment): Promise<void> {
    if (!this.detailTask || !this.canDeleteComment(comment) || this.deletingCommentId === comment.id) {
      return;
    }

    this.deletingCommentId = comment.id;
    this.errorMessage = '';
    try {
      const updated = await this.tasksService.removeComment(this.detailTask.id, comment.id);
      this.detailTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.successMessage = 'admin.tasks.comment_deleted';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
    } finally {
      this.deletingCommentId = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Mark task as done from list/detail actions and keep caches in sync.
   */
  async markDone(task: TaskItem): Promise<void> {
    // Fast client guard; backend remains source of truth for authorization.
    if (!task.can_mark_done || task.status === 'done') {
      return;
    }

    this.errorMessage = '';
    try {
      const updated = await this.tasksService.update(task.id, { status: 'done' });
      this.tasks = this.tasks.map((item) => item.id === updated.id ? updated : item);
      if (this.detailTask?.id === updated.id) {
        this.detailTask = updated;
      }
      this.refreshDeadLetters();
      this.successMessage = 'admin.tasks.done_success';
      this.cdr.detectChanges();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle gallery/device image selection and upload to current task.
   *
   * Input supports multiple files for fast operational reporting.
   */
  async onAttachmentFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset element value so selecting the same file twice still triggers change.
    input.value = '';

    if (!this.detailTask || files.length === 0) {
      return;
    }

    await this.uploadTaskAttachments(files);
  }

  /**
   * Add one or more files to create/edit modal pending attachment queue.
   */
  onFormAttachmentFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    this.formAttachmentFiles = [...this.formAttachmentFiles, ...files];
  }

  /**
   * Remove one pending file from task-modal queue.
   */
  removeFormAttachmentAt(index: number): void {
    this.formAttachmentFiles = this.formAttachmentFiles.filter((_, i) => i !== index);
  }

  /**
   * Open live camera preview (device/browser dependent).
   */
  async onAttachmentCameraCaptured(): Promise<void> {
    if (!this.detailTask || this.isCameraStarting) {
      return;
    }
    this.cameraTarget = 'detail';
    await this.openCameraStreamForCurrentTarget();
  }

  /**
   * Open live camera for task create/edit modal and store captured image as pending file.
   */
  async onFormAttachmentCameraCaptured(): Promise<void> {
    if (this.isCameraStarting || !this.isTaskModalOpen) {
      return;
    }
    this.cameraTarget = 'form';
    await this.openCameraStreamForCurrentTarget();
  }

  /**
   * Internal camera stream bootstrap shared by detail/form camera entrypoints.
   */
  private async openCameraStreamForCurrentTarget(): Promise<void> {

    if (!navigator.mediaDevices?.getUserMedia) {
      if (this.cameraTarget === 'form') {
        this.formAttachmentError = 'admin.tasks.attachments.camera_not_supported';
      } else {
        this.attachmentErrorMessage = 'admin.tasks.attachments.camera_not_supported';
      }
      this.cdr.detectChanges();
      return;
    }

    this.isCameraStarting = true;
    this.cameraErrorMessage = '';
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      this.isCameraDialogOpen = true;
      this.cdr.detectChanges();
      queueMicrotask(() => this.bindCameraStream());
    } catch {
      if (this.cameraTarget === 'form') {
        this.formAttachmentError = 'admin.tasks.attachments.camera_open_failed';
      } else {
        this.attachmentErrorMessage = 'admin.tasks.attachments.camera_open_failed';
      }
      this.cdr.detectChanges();
    } finally {
      this.isCameraStarting = false;
    }
  }

  /**
   * Remove one attachment when permission allows it.
   *
   * UX:
   * - explicit confirmation warning before irreversible delete
   */
  async deleteAttachment(attachment: TaskAttachment): Promise<void> {
    if (!this.detailTask || attachment.can_delete !== true || this.deletingAttachmentId === attachment.id) {
      return;
    }

    // Use translated prompt text (sync) to make destructive action explicit.
    const warning = this.transloco.translate('admin.tasks.attachments.delete_warning');
    const confirmed = window.confirm(warning);
    if (!confirmed) {
      return;
    }

    this.deletingAttachmentId = attachment.id;
    this.attachmentErrorMessage = '';
    try {
      const updated = await this.tasksService.removeAttachment(this.detailTask.id, attachment.id);
      this.detailTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.attachmentPreviewCache.revokeOne(attachment.id);
      await this.preloadAttachmentPreviews(updated);
      this.successMessage = 'admin.tasks.attachments.deleted_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.attachmentErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    } finally {
      this.deletingAttachmentId = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Return already-resolved preview URL for inline thumbnail rendering.
   */
  attachmentThumbUrl(attachmentId: number): string | null {
    return this.attachmentPreviewCache.getCachedUrl(attachmentId);
  }

  /**
   * Open large preview dialog for a thumbnail.
   */
  async openAttachmentPreview(attachment: TaskAttachment): Promise<void> {
    this.attachmentErrorMessage = '';
    try {
      const url = await this.attachmentPreviewCache.resolveUrl(this.tasksService, attachment);
      this.attachmentPreviewTitle = attachment.title || attachment.original_name || `#${attachment.id}`;
      this.attachmentPreviewUrl = url;
      this.isAttachmentPreviewOpen = true;
      this.cdr.detectChanges();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.attachmentErrorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
      this.cdr.detectChanges();
    }
  }

  /**
   * Close attachment preview dialog.
   */
  closeAttachmentPreview(): void {
    this.isAttachmentPreviewOpen = false;
    this.attachmentPreviewTitle = '';
    this.attachmentPreviewUrl = '';
  }

  /**
   * Capture one frame from live camera and upload as image attachment.
   */
  async captureAttachmentPhoto(): Promise<void> {
    if (!this.cameraStream) {
      return;
    }

    const video = this.attachmentCameraVideoRef?.nativeElement;
    if (!video) {
      return;
    }

    // Mobile cameras can deliver very large frames (e.g. 4K+), which often
    // exceed conservative backend/php upload limits. We clamp to max edge.
    const rawWidth = video.videoWidth || 1280;
    const rawHeight = video.videoHeight || 720;
    const maxEdge = 1920;
    const longest = Math.max(rawWidth, rawHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(rawWidth * scale));
    const height = Math.max(1, Math.round(rawHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      this.cameraErrorMessage = 'admin.tasks.attachments.camera_open_failed';
      this.cdr.detectChanges();
      return;
    }
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      // Slightly lower quality keeps image readable but significantly smaller.
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.82);
    });
    if (!blob) {
      this.cameraErrorMessage = 'admin.tasks.attachments.camera_open_failed';
      this.cdr.detectChanges();
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const target = this.cameraTarget;
    this.closeCameraDialog();
    if (target === 'detail') {
      if (!this.detailTask) {
        return;
      }
      await this.uploadTaskAttachments([file]);
      return;
    }

    this.formAttachmentFiles = [...this.formAttachmentFiles, file];
    this.cdr.detectChanges();
  }

  /**
   * Close live camera dialog and release device stream.
   */
  closeCameraDialog(): void {
    this.isCameraDialogOpen = false;
    this.cameraErrorMessage = '';

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = null;
    }

    const video = this.attachmentCameraVideoRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  /**
   * Open delete confirmation modal for a task.
   */
  openDeleteModal(task: TaskItem): void {
    if (!this.canDeleteTask(task)) {
      return;
    }

    this.deleteTarget = task;
    this.deleteError = '';
    this.isDeleteModalOpen = true;
  }

  /**
   * Close delete confirmation modal and clear target/error.
   */
  closeDeleteModal(): void {
    this.deleteTarget = null;
    this.deleteError = '';
    this.isDeleteModalOpen = false;
  }

  /**
   * Execute task deletion after confirmation and refresh list.
   */
  async confirmDelete(): Promise<void> {
    if (!this.deleteTarget) {
      return;
    }

    this.deleteError = '';
    try {
      await this.tasksService.remove(this.deleteTarget.id);
      this.closeDeleteModal();
      await this.loadTasks();
      this.refreshDeadLetters();
      this.successMessage = 'admin.tasks.deleted_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.deleteError = parsed.generalKey ?? 'admin.errors.delete_failed';
      this.cdr.detectChanges();
    }
  }

  /**
   * Decide whether delete action should be visible for a task.
   *
   * Priority:
   * - prefer backend capability flag when present
   * - fallback to local legacy check for older payloads
   */
  canDeleteTask(task: TaskItem): boolean {
    // Prefer backend capability flag if present.
    if (task.can_delete === true) {
      return true;
    }

    // Fallback for older payloads: creator can delete only when no real comments exist.
    const user = this.authService.currentUserValue();
    const userId = Number(user?.id ?? 0);
    const hasRealComments = (task.comments ?? []).some((comment) => !comment.is_system);
    return userId > 0 && userId === task.created_by && !hasRealComments;
  }

  /**
   * Decide whether current user can delete a specific comment.
   *
   * Priority:
   * - prefer backend `can_delete`
   * - fallback to owner-only check for non-system comments
   */
  canDeleteComment(comment: TaskComment): boolean {
    if (comment.can_delete === true) {
      return true;
    }

    // Fallback for older payloads: only own real comments are deletable.
    const userId = Number(this.authService.currentUserValue()?.id ?? 0);
    const ownerId = Number(comment.user?.id ?? 0);
    return !comment.is_system && userId > 0 && ownerId === userId;
  }

  /**
   * Flag used to highlight today-open tasks visually in list cards.
   */
  isTodayOpenTask(task: TaskItem): boolean {
    return task.status === 'open' && this.taskDateKey(task) === this.todayKey();
  }

  /**
   * Safely return number of loaded comments for task card chip.
   */
  commentCount(task: TaskItem): number {
    return task.comments?.length ?? 0;
  }

  /**
   * Resolve localized sync badge key for one task.
   */
  taskSyncBadgeKey(task: TaskItem): string | null {
    if (task.sync_error === 'conflict') {
      return 'admin.tasks.task_sync_conflict';
    }
    if (task.sync_error) {
      return 'admin.tasks.task_sync_failed';
    }
    if (task.is_pending) {
      return 'admin.tasks.task_sync_pending';
    }
    return null;
  }

  /**
   * Build creator display label with full-name fallback to username.
   */
  creatorLabel(task: TaskItem): string {
    if (!task.creator) {
      return '-';
    }
    return `${task.creator.first_name} ${task.creator.last_name}`.trim() || task.creator.username;
  }

  /**
   * Format task main timestamp for list display.
   */
  formatTaskDate(task: TaskItem): string {
    const iso = task.starts_at ?? task.created_at;
    return this.formatDateTime(iso);
  }

  /**
   * Format task time-only label for personnel day-board rows.
   *
   * Output:
   * - FA: Persian clock (HH:mm)
   * - EN: 24h clock without seconds
   */
  formatTaskTime(task: TaskItem): string {
    const iso = task.starts_at ?? task.created_at;
    const date = new Date(iso);

    if (this.languageService.getLanguage() === 'fa') {
      return new Intl.DateTimeFormat('fa-IR', {
        timeZone: 'Asia/Tehran',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }

    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  /**
   * Format comment timestamp for detail feed.
   */
  formatCommentDate(iso: string): string {
    return this.formatDateTime(iso);
  }

  /**
   * Initial page bootstrap:
   * - load assignee options
   * - load visible tasks (with optional staff filter)
   * - build recent titles cache for autocomplete
   */
  private async loadInitialData(): Promise<void> {
    // Parallel bootstrap reduces first paint waiting time:
    // - assignee selector options
    // - visible tasks for current user
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [assigneesResult, tasksResult] = await Promise.allSettled([
        this.tasksService.listAssignees(),
        this.tasksService.list(this.canFilterByPersonnel ? this.selectedAssigneeFilterId : null),
      ]);

      if (assigneesResult.status === 'fulfilled') {
        this.assigneeOptions = this.mapAssigneeOptions(assigneesResult.value);
      } else {
        // Offline fallback: keep modal assignment usable with at least self option.
        this.assigneeOptions = this.fallbackAssigneeOptions();
      }

      if (tasksResult.status === 'fulfilled') {
        this.tasks = tasksResult.value;
      } else {
        this.tasks = [];
        throw tasksResult.reason;
      }

      this.recentOwnTitles = TaskTemplateSuggestionsUtils.buildRecentOwnTitles(
        this.tasks,
        Number(this.authService.currentUserValue()?.id ?? 0)
      );
      this.refreshDeadLetters();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Reload task list after mutating operations.
   */
  private async loadTasks(): Promise<void> {
    // Dedicated refresh helper used after create/edit/delete/comment actions.
    const assigneeFilter = this.canFilterByPersonnel ? this.selectedAssigneeFilterId : null;
    this.tasks = await this.tasksService.list(assigneeFilter);
    this.recentOwnTitles = TaskTemplateSuggestionsUtils.buildRecentOwnTitles(
      this.tasks,
      Number(this.authService.currentUserValue()?.id ?? 0)
    );
    this.refreshDeadLetters();
    this.cdr.detectChanges();
  }

  /**
   * Refresh dead-letter snapshot for explicit retry/discard UI.
   */
  private refreshDeadLetters(): void {
    this.deadLetters = this.tasksService.listDeadLetters();
  }

  /**
   * Retry one exhausted mutation from dead-letter list.
   */
  async retryDeadLetter(item: TaskDeadLetterEntry): Promise<void> {
    this.errorMessage = '';
    try {
      const ok = await this.tasksService.retryDeadLetter(item.id);
      if (!ok) {
        this.errorMessage = 'admin.tasks.dead_letter_retry_failed';
        this.refreshDeadLetters();
        return;
      }
      await this.loadTasks();
      this.successMessage = 'admin.tasks.dead_letter_retry_success';
    } catch {
      this.errorMessage = 'admin.tasks.dead_letter_retry_failed';
    } finally {
      this.refreshDeadLetters();
      this.cdr.detectChanges();
    }
  }

  /**
   * Discard one dead-letter mutation and related local payload.
   */
  discardDeadLetter(item: TaskDeadLetterEntry): void {
    this.tasksService.discardDeadLetter(item.id);
    this.refreshDeadLetters();
    this.successMessage = 'admin.tasks.dead_letter_discarded';
    this.cdr.detectChanges();
  }

  /**
   * Resolve localized label key for one dead-letter operation type.
   */
  deadLetterTypeLabelKey(item: TaskDeadLetterEntry): string {
    const type = item.entry.type;
    if (type === 'create') {
      return 'admin.tasks.dead_letter_type.create';
    }
    if (type === 'update') {
      return 'admin.tasks.dead_letter_type.update';
    }
    if (type === 'delete') {
      return 'admin.tasks.dead_letter_type.delete';
    }
    if (type === 'comment_add') {
      return 'admin.tasks.dead_letter_type.comment_add';
    }
    if (type === 'comment_delete') {
      return 'admin.tasks.dead_letter_type.comment_delete';
    }
    return 'admin.tasks.dead_letter_type.attachment_add';
  }

  /**
   * Resolve readable task title for dead-letter row.
   */
  deadLetterTaskTitle(item: TaskDeadLetterEntry): string {
    const task = this.tasks.find((entry) => entry.id === item.entry.task_id);
    if (task?.title) {
      return task.title;
    }
    return `#${item.entry.task_id}`;
  }

  /**
   * Map backend assignee user objects into lightweight select options.
   */
  private mapAssigneeOptions(users: TaskAssigneeOption[]): AssigneeUiOption[] {
    return users.map((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.trim();
      const label = fullName || user.username || `#${user.id}`;
      return { id: user.id, label };
    });
  }

  /**
   * Build minimum assignee option set when remote staff list is unavailable.
   *
   * This allows offline create dialog usage after backend shutdown as long as
   * the user session is already loaded.
   */
  private fallbackAssigneeOptions(): AssigneeUiOption[] {
    const current = this.authService.currentUserValue();
    const userId = Number(current?.id ?? 0);
    if (userId <= 0) {
      return [];
    }

    const fullName = `${current?.first_name ?? ''} ${current?.last_name ?? ''}`.trim();
    const label = fullName || String(current?.username ?? `#${userId}`);
    return [{ id: userId, label }];
  }

  /**
   * Compute default assignment list for create form (self-assignment).
   */
  private defaultAssigneeIds(): number[] {
    // Resolve current authenticated user id for "assign to myself by default" behavior.
    // Number coercion avoids issues if backend/user storage returns string ids.
    const userId = Number(this.authService.currentUserValue()?.id ?? 0);
    return userId > 0 ? [userId] : [];
  }

  /**
   * Extract backend field-level validation errors into normalized map.
   */
  private extractFieldErrors(error: unknown): Record<string, string[]> {
    // Keep raw backend validation messages for modal diagnostics.
    // We intentionally preserve field keys to support future field-level mapping.
    const err = error as { error?: { errors?: Record<string, string[] | string> } };
    const source = err.error?.errors ?? {};
    const mapped: Record<string, string[]> = {};

    Object.entries(source).forEach(([key, value]) => {
      mapped[key] = Array.isArray(value) ? value.map((item) => String(item)) : [String(value)];
    });

    return mapped;
  }

  /**
   * Resolve task date key used by grouping/sorting logic.
   */
  private taskDateKey(task: TaskItem): string {
    // Task date basis:
    // starts_at when available; otherwise fallback to created_at.
    const iso = task.starts_at ?? task.created_at;
    return this.isoToLocalDateKey(iso);
  }

  /**
   * Resolve numeric timestamp used for chronological ordering.
   */
  private taskSortTs(task: TaskItem): number {
    const iso = task.starts_at ?? task.created_at;
    return new Date(iso).getTime();
  }

  /**
   * Build date key for current local day.
   */
  private todayKey(): string {
    return this.isoToLocalDateKey(new Date().toISOString());
  }

  /**
   * Convert ISO timestamp to local `YYYY-MM-DD` key.
   */
  private isoToLocalDateKey(iso: string): string {
    // Task grouping/filtering should follow hotel business timezone (Tehran),
    // not browser local timezone.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));

    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';

    return `${read('year')}-${read('month')}-${read('day')}`;
  }

  /**
   * Format grouped day title depending on active language.
   */
  private formatDateKey(dateKey: string): string {
    // Date group labels are locale-aware:
    // - fa: Jalali + Persian digits
    // - en: Gregorian locale string
    const [gy, gm, gd] = dateKey.split('-').map((part) => Number(part));
    if (this.languageService.getLanguage() !== 'fa') {
      return new Date(gy, gm - 1, gd).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    const [jy, jm, jd] = DateUtils.gregorianToJalali(gy, gm, gd);
    return DateUtils.toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
  }

  /**
   * Build default start-date value for create form.
   */
  private defaultDateValue(): string {
    const now = new Date();
    const gy = now.getFullYear();
    const gm = String(now.getMonth() + 1).padStart(2, '0');
    const gd = String(now.getDate()).padStart(2, '0');
    const gregorian = `${gy}-${gm}-${gd}`;
    if (this.languageService.getLanguage() === 'fa') {
      return DateUtils.toJalali(gregorian);
    }
    return gregorian;
  }

  /**
   * Return today's Gregorian day key (`YYYY-MM-DD`) for state initialization.
   */
  private todayGregorianDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Build default start-time value for create form.
   */
  private defaultTimeValue(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /**
   * Map ISO timestamp to language-specific date input value.
   */
  private toInputDate(iso: string | null | undefined): string {
    return TaskDateTimeUtils.toInputDate(iso, this.languageService.getLanguage());
  }

  /**
   * Map ISO timestamp to `HH:mm` input value.
   */
  private toInputTime(iso: string | null | undefined): string {
    return TaskDateTimeUtils.toInputTime(iso);
  }

  /**
   * Compose API datetime payload value from date + time form fields.
   */
  private combineDateTimeForApi(dateValue: string, timeValue: string): string | null {
    return TaskDateTimeUtils.combineDateTimeForApi(dateValue, timeValue, this.languageService.getLanguage());
  }

  /**
   * Format ISO datetime for UI in business timezone with locale-aware calendar.
   */
  private formatDateTime(iso: string): string {
    return TaskDateTimeUtils.formatDateTime(iso, this.languageService.getLanguage());
  }

  /**
   * Consume query-param based "open create modal" intent.
   *
   * Contract:
   * - accepted values: `1`, `true` (case-insensitive)
   * - after modal is opened, remove `open_new` from URL to keep navigation idempotent
   *
   * Why subscription instead of snapshot only:
   * - user can trigger the same deep-link while staying on the same page
   * - Angular may reuse component instance, so we react to query-param updates too
   */
  private handleRouteDrivenCreateIntent(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const rawFlag = (params.get('open_new') ?? '').trim().toLowerCase();
        const shouldOpen = rawFlag === '1' || rawFlag === 'true';

        const rawTaskId = (params.get('open_task') ?? '').trim();
        const parsedTaskId = Number(rawTaskId);
        const shouldOpenTaskDetail = Number.isInteger(parsedTaskId) && parsedTaskId > 0;

        if (!shouldOpen && !shouldOpenTaskDetail) {
          return;
        }

        // Detail intent has priority over create intent because it is item-specific.
        if (shouldOpenTaskDetail) {
          // Fire-and-forget here is intentional:
          // - opening details is async
          // - route subscription must stay synchronous
          // - error handling is already encapsulated inside `openDetailsById`
          void this.openDetailsById(parsedTaskId);
        } else if (!this.isTaskModalOpen) {
          // Avoid duplicate modal-open attempts if URL updates while dialog is already visible.
          this.openCreateModal();
        }

        // Clear consumed URL flags immediately after handling them.
        // `replaceUrl` prevents polluting browser history with transient query states.
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            open_new: null,
            open_task: null,
          },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
  }

  /**
   * Open task details by id without requiring a full list item object.
   *
   * Primary use case:
   * - deep-link from dashboard list rows (`/dashboard/tasks/new?open_task=<id>`)
   */
  private async openDetailsById(taskId: number): Promise<void> {
    // Open modal shell immediately to keep UX responsive and show loading state.
    this.errorMessage = '';
    this.isDetailModalOpen = true;
    this.isDetailLoading = true;
    this.detailTask = null;
    this.detailComment = '';

    try {
      this.detailTask = await this.tasksService.get(taskId);
      await this.preloadAttachmentPreviews(this.detailTask);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
      this.cdr.detectChanges();
    } finally {
      this.isDetailLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Shared upload flow for device and camera inputs.
   */
  private async uploadTaskAttachments(files: File[]): Promise<void> {
    if (!this.detailTask) {
      return;
    }

    this.isAttachmentUploading = true;
    this.attachmentErrorMessage = '';
    try {
      const updated = await this.tasksService.uploadAttachments(this.detailTask.id, files);
      this.detailTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      await this.preloadAttachmentPreviews(updated);
      this.successMessage = updated.is_pending
        ? 'admin.tasks.attachments.sync_pending'
        : 'admin.tasks.attachments.uploaded_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.attachmentErrorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
      this.cdr.detectChanges();
    } finally {
      this.isAttachmentUploading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Preload thumbnails for currently visible task attachments.
   */
  private async preloadAttachmentPreviews(task: TaskItem): Promise<void> {
    const attachments = task.attachments ?? [];
    // Load thumbnails sequentially to avoid request bursts on low-end mobile devices.
    for (const attachment of attachments) {
      try {
        await this.attachmentPreviewCache.resolveUrl(this.tasksService, attachment);
      } catch {
        // One broken image should not block the rest of detail rendering.
      }
    }
  }

  /**
   * Attach stream to preview video element after dialog renders.
   */
  private bindCameraStream(): void {
    const video = this.attachmentCameraVideoRef?.nativeElement;
    if (!video || !this.cameraStream) {
      return;
    }
    video.srcObject = this.cameraStream;
    void video.play().catch(() => {
      this.cameraErrorMessage = 'admin.tasks.attachments.camera_open_failed';
      this.cdr.detectChanges();
    });
  }
}
