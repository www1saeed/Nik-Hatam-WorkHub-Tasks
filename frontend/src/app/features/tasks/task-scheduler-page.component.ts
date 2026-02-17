import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AutoCompleteSelectEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { CalendarOptions, DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import momentTimezonePlugin from '@fullcalendar/moment-timezone';
import timeGridPlugin from '@fullcalendar/timegrid';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { TaskAssigneeOption, TaskAttachment, TaskComment, TaskDeadLetterEntry, TaskItem, TasksService } from '../../core/services/tasks.service';
import { TaskTemplatesService } from '../../core/services/task-templates.service';
import { DateUtils } from '../../core/utils/date-utils';
import { parseHttpError } from '../../core/utils/error-mapper';
import { TaskDateTimeUtils } from '../../core/utils/task-datetime.util';
import { TaskTemplateSuggestionsUtils } from '../../core/utils/task-template-suggestions.util';
import { JalaliDatepickerComponent } from '../../shared/jalali-datepicker.component';
import { AttachmentPreviewCache } from '../../core/utils/attachment-preview-cache.util';

interface AssigneeUiOption {
  id: number;
  label: string;
}

type SchedulerViewMode = 'timeGridDay' | 'timeGridWeek';

@Component({
  selector: 'app-task-scheduler-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslocoPipe,
    AutoCompleteModule,
    FullCalendarModule,
    DialogModule,
    MultiSelectModule,
    ToggleSwitchModule,
    JalaliDatepickerComponent
  ],
  templateUrl: './task-scheduler-page.component.html',
  styleUrl: './task-scheduler-page.component.scss'
})
export class TaskSchedulerPageComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly tasksService = inject(TasksService);
  private readonly taskTemplatesService = inject(TaskTemplatesService);
  readonly languageService = inject(LanguageService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly attachmentPreviewCache = new AttachmentPreviewCache();

  @ViewChild('calendarRef') calendarRef?: FullCalendarComponent;
  @ViewChild('schedulerAttachmentCameraVideo') schedulerAttachmentCameraVideoRef?: ElementRef<HTMLVideoElement>;

  isLoading = true;
  isSyncingNow = false;
  errorMessage = '';
  successMessage = '';
  tasks: TaskItem[] = [];
  deadLetters: TaskDeadLetterEntry[] = [];
  // Cached recent titles authored by current user (shown when query is empty).
  recentOwnTitles: string[] = [];
  assigneeOptions: AssigneeUiOption[] = [];
  selectedAssigneeFilterId: number | null = null;
  selectedView: SchedulerViewMode = 'timeGridWeek';
  visibleRangeLabel = '';

  isDialogOpen = false;
  isDialogLoading = false;
  selectedTask: TaskItem | null = null;
  detailComment = '';
  isCommentSubmitting = false;
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

  isTaskModalOpen = false;
  isTaskModalSubmitting = false;
  editingTaskId: number | null = null;
  editingCanSetDone = false;
  taskModalError = '';
  taskModalFieldErrors: Record<string, string[]> = {};
  formAttachmentFiles: File[] = [];
  formAttachmentError = '';
  templateSuggestions: string[] = [];
  selectedTemplateTitle: string | null = null;
  private activeSearchToken = 0;

  isDeleteModalOpen = false;
  deleteTarget: TaskItem | null = null;
  deleteError = '';

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    status: this.fb.nonNullable.control<'open' | 'done'>('open'),
    assigned_user_ids: this.fb.nonNullable.control<number[]>([], [Validators.required]),
    starts_date: [''],
    starts_time: [''],
    ends_date: [''],
    ends_time: [''],
  });

  calendarOptions: CalendarOptions = this.buildCalendarOptions([]);

  constructor() {
    this.languageService.current$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshCalendar();
      });

    // Reset selected-template marker whenever user manually changes title text.
    this.form.controls.title.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value !== this.selectedTemplateTitle) {
          this.selectedTemplateTitle = null;
        }
      });

    this.loadInitialData();
  }

  /**
   * Release generated object URLs when component is destroyed.
   */
  ngOnDestroy(): void {
    this.closeCameraDialog();
    this.attachmentPreviewCache.revokeAll();
  }

  /**
   * Show staff filter only for users with elevated staff-management permission.
   */
  get canFilterByPersonnel(): boolean {
    return this.authService.hasPermission('manage_staffs');
  }

  /**
   * Creator metadata is visible only for elevated staff-management users.
   */
  get canViewCreatorInfo(): boolean {
    return this.authService.hasPermission('manage_staffs');
  }

  /**
   * Bridge status enum to toggle checked state in task modal.
   */
  get isDoneChecked(): boolean {
    return this.form.controls.status.value === 'done';
  }

  /**
   * Determine if status toggle should be enabled in current modal context.
   */
  get canToggleDoneInForm(): boolean {
    return !this.editingTaskId || this.editingCanSetDone;
  }

  /**
   * Visible tasks with pending queued operations.
   */
  get hasPendingSyncTasks(): boolean {
    return this.tasks.some((task) => task.is_pending === true && !task.sync_error);
  }

  /**
   * Visible tasks with failed sync states.
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
   * Apply selected staff filter and reload scheduler tasks.
   */
  onAssigneeFilterChange(rawValue: string): void {
    const parsed = Number(rawValue);
    this.selectedAssigneeFilterId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    void this.loadTasks();
  }

  /**
   * Switch calendar view between day and week.
   */
  switchView(mode: SchedulerViewMode): void {
    this.selectedView = mode;
    this.calendarRef?.getApi().changeView(mode);
  }

  /**
   * Navigate calendar to current date.
   */
  goToday(): void {
    this.calendarRef?.getApi().today();
  }

  /**
   * Navigate calendar to previous visible range.
   */
  goPrev(): void {
    this.calendarRef?.getApi().prev();
  }

  /**
   * Navigate calendar to next visible range.
   */
  goNext(): void {
    this.calendarRef?.getApi().next();
  }

  /**
   * Open create-task modal from scheduler context.
   *
   * Optional:
   * - prefill start datetime from clicked calendar slot.
   */
  openCreateModal(prefilledStartIso?: string): void {
    this.editingTaskId = null;
    this.editingCanSetDone = false;
    this.taskModalError = '';
    this.taskModalFieldErrors = {};
    this.formAttachmentFiles = [];
    this.formAttachmentError = '';

    const startIso = prefilledStartIso ?? new Date().toISOString();
    this.form.reset({
      title: '',
      status: 'open',
      assigned_user_ids: this.defaultAssigneeIds(),
      starts_date: TaskDateTimeUtils.toInputDate(startIso, this.languageService.getLanguage()),
      starts_time: TaskDateTimeUtils.toInputTime(startIso),
      ends_date: '',
      ends_time: '',
    });

    this.selectedTemplateTitle = null;
    this.templateSuggestions = [];
    this.isTaskModalOpen = true;
  }

  /**
   * Open edit-task modal with existing task values.
   */
  openEditModal(task: TaskItem): void {
    if (!task.can_edit) {
      return;
    }

    this.editingTaskId = task.id;
    this.editingCanSetDone = task.can_mark_done || task.status === 'done';
    this.taskModalError = '';
    this.taskModalFieldErrors = {};
    this.formAttachmentFiles = [];
    this.formAttachmentError = '';
    this.form.reset({
      title: task.title,
      status: task.status,
      assigned_user_ids: task.assigned_users.map((user) => user.id),
      starts_date: TaskDateTimeUtils.toInputDate(task.starts_at ?? task.created_at, this.languageService.getLanguage()),
      starts_time: TaskDateTimeUtils.toInputTime(task.starts_at ?? task.created_at),
      ends_date: TaskDateTimeUtils.toInputDate(task.ends_at, this.languageService.getLanguage()),
      ends_time: TaskDateTimeUtils.toInputTime(task.ends_at),
    });
    this.selectedTemplateTitle = null;
    this.templateSuggestions = [];
    this.isTaskModalOpen = true;
  }

  /**
   * Close task modal and clear modal-local state.
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
   * Map toggle value to task status enum.
   */
  onDoneToggle(checked: boolean): void {
    this.form.controls.status.setValue(checked ? 'done' : 'open');
  }

  /**
   * Search template suggestions for scheduler task-title autocomplete.
   *
   * Behavior parity with task capture page:
   * - empty query => recent own titles
   * - non-empty query => backend search + prefix-first ranking
   * - token guard prevents stale response flicker
   */
  async searchTemplates(event: { query?: string }): Promise<void> {
    const query = (event.query ?? '').trim();
    this.activeSearchToken += 1;
    const currentToken = this.activeSearchToken;

    this.taskModalError = '';
    if (!query) {
      this.templateSuggestions = [...this.recentOwnTitles];
      this.cdr.detectChanges();
      return;
    }

    try {
      const templates = await this.taskTemplatesService.search(query);
      if (currentToken !== this.activeSearchToken) {
        return;
      }
      const titles = templates.map((template) => template.title);
      this.templateSuggestions = TaskTemplateSuggestionsUtils.rankTitlesByPrefix(query, titles);
    } catch {
      if (currentToken !== this.activeSearchToken) {
        return;
      }
      this.templateSuggestions = [];
      this.taskModalError = 'admin.tasks.search_failed';
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * Track selected template text to distinguish from manual input changes.
   */
  onTemplateSelected(event: AutoCompleteSelectEvent): void {
    this.selectedTemplateTitle = String(event.value ?? '');
  }

  /**
   * Manual queue replay action for users.
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
   * Save task from scheduler modal (create or update flow).
   *
   * On success:
   * - closes modal
   * - refreshes scheduler events
   */
  async saveTask(): Promise<void> {
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
      const payload = {
        title,
        assigned_user_ids: assignedUserIds,
        starts_at: TaskDateTimeUtils.combineDateTimeForApi(
          this.form.controls.starts_date.value,
          this.form.controls.starts_time.value,
          this.languageService.getLanguage()
        ),
        ends_at: TaskDateTimeUtils.combineDateTimeForApi(
          this.form.controls.ends_date.value,
          this.form.controls.ends_time.value,
          this.languageService.getLanguage()
        ),
      };

      if (this.editingTaskId) {
        const statusPatch = this.editingCanSetDone ? { status: this.form.controls.status.value } : {};
        const updated = await this.tasksService.update(this.editingTaskId, { ...payload, ...statusPatch });
        if (this.formAttachmentFiles.length > 0) {
          await this.tasksService.uploadAttachments(updated.id, this.formAttachmentFiles);
        }
        this.successMessage = 'admin.tasks.updated_success';
      } else {
        const created = await this.tasksService.create({ ...payload, status: this.form.controls.status.value });
        if (this.formAttachmentFiles.length > 0) {
          await this.tasksService.uploadAttachments(created.id, this.formAttachmentFiles);
        }
        this.successMessage = 'admin.tasks.captured_success';
      }

      this.closeTaskModal();
      try {
        // Best-effort refresh:
        // offline optimistic create/update already mutates local cache,
        // so refresh errors must not break successful save UX.
        await this.loadTasks();
      } catch {
        this.cdr.detectChanges();
      }
      this.refreshDeadLetters();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.taskModalError = parsed.generalKey ?? 'admin.errors.save_failed';
      this.taskModalFieldErrors = this.extractFieldErrors(error);
    } finally {
      this.isTaskModalSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Open task detail dialog and fetch fresh server snapshot.
   */
  async openDetails(taskId: number): Promise<void> {
    this.errorMessage = '';
    this.isDialogOpen = true;
    this.isDialogLoading = true;
    this.selectedTask = null;
    this.detailComment = '';
    this.deletingCommentId = null;
    this.attachmentErrorMessage = '';
    try {
      this.selectedTask = await this.tasksService.get(taskId);
      await this.preloadAttachmentPreviews(this.selectedTask);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isDialogLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Close detail dialog and reset temporary interaction state.
   */
  closeDialog(): void {
    this.isDialogOpen = false;
    this.isDialogLoading = false;
    this.selectedTask = null;
    this.detailComment = '';
    this.deletingCommentId = null;
    this.isAttachmentUploading = false;
    this.deletingAttachmentId = null;
    this.attachmentErrorMessage = '';
    this.closeAttachmentPreview();
    this.closeCameraDialog();
    this.attachmentPreviewCache.revokeAll();
    this.successMessage = '';
  }

  /**
   * Submit comment in detail dialog and sync scheduler/task caches.
   */
  async submitDetailComment(): Promise<void> {
    if (!this.selectedTask || !this.selectedTask.can_edit || !this.detailComment.trim() || this.isCommentSubmitting) {
      return;
    }

    this.isCommentSubmitting = true;
    this.errorMessage = '';
    try {
      const updated = await this.tasksService.addComment(this.selectedTask.id, this.detailComment.trim());
      this.selectedTask = updated;
      this.detailComment = '';
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.refreshCalendar();
      this.successMessage = 'admin.tasks.comment_saved';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
    } finally {
      this.isCommentSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Delete a comment from detail dialog when user is allowed.
   */
  async deleteDetailComment(comment: TaskComment): Promise<void> {
    if (!this.selectedTask || !this.canDeleteComment(comment) || this.deletingCommentId === comment.id) {
      return;
    }

    this.deletingCommentId = comment.id;
    this.errorMessage = '';
    try {
      const updated = await this.tasksService.removeComment(this.selectedTask.id, comment.id);
      this.selectedTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.refreshCalendar();
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
   * Handle gallery/device image selection and upload for current task.
   */
  async onAttachmentFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (!this.selectedTask || files.length === 0) {
      return;
    }

    await this.uploadTaskAttachments(files);
  }

  /**
   * Add one or more files to scheduler task-modal pending queue.
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
   * Remove one pending file from scheduler task-modal queue.
   */
  removeFormAttachmentAt(index: number): void {
    this.formAttachmentFiles = this.formAttachmentFiles.filter((_, i) => i !== index);
  }

  /**
   * Open live camera preview (device/browser dependent).
   */
  async onAttachmentCameraCaptured(): Promise<void> {
    if (!this.selectedTask || this.isCameraStarting) {
      return;
    }
    this.cameraTarget = 'detail';
    await this.openCameraStreamForCurrentTarget();
  }

  /**
   * Open live camera for scheduler create/edit modal and queue captured image.
   */
  async onFormAttachmentCameraCaptured(): Promise<void> {
    if (this.isCameraStarting || !this.isTaskModalOpen) {
      return;
    }
    this.cameraTarget = 'form';
    await this.openCameraStreamForCurrentTarget();
  }

  /**
   * Shared live camera bootstrap for detail and form contexts.
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
   * Delete one attachment with explicit warning confirmation.
   */
  async deleteAttachment(attachment: TaskAttachment): Promise<void> {
    if (!this.selectedTask || attachment.can_delete !== true || this.deletingAttachmentId === attachment.id) {
      return;
    }

    const warning = this.transloco.translate('admin.tasks.attachments.delete_warning');
    if (!window.confirm(warning)) {
      return;
    }

    this.deletingAttachmentId = attachment.id;
    this.attachmentErrorMessage = '';
    try {
      const updated = await this.tasksService.removeAttachment(this.selectedTask.id, attachment.id);
      this.selectedTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      this.attachmentPreviewCache.revokeOne(attachment.id);
      await this.preloadAttachmentPreviews(updated);
      this.refreshCalendar();
      this.successMessage = 'admin.tasks.attachments.deleted_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.attachmentErrorMessage = parsed.generalKey ?? 'admin.errors.delete_failed';
    } finally {
      this.deletingAttachmentId = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Resolve cached thumbnail URL for attachment card.
   */
  attachmentThumbUrl(attachmentId: number): string | null {
    return this.attachmentPreviewCache.getCachedUrl(attachmentId);
  }

  /**
   * Open large preview dialog for selected attachment.
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
   * Close image preview dialog.
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

    const video = this.schedulerAttachmentCameraVideoRef?.nativeElement;
    if (!video) {
      return;
    }

    // Mobile cameras can return very high-resolution frames that break upload
    // limits in default local PHP setups. We cap the longest edge.
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
      // Keep quality strong while reducing payload for upload reliability.
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
      if (!this.selectedTask) {
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

    const video = this.schedulerAttachmentCameraVideoRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  /**
   * Mark task as done from detail actions and refresh event rendering.
   */
  async markDone(task: TaskItem): Promise<void> {
    if (!task.can_mark_done || task.status === 'done') {
      return;
    }

    this.errorMessage = '';
    try {
      const updated = await this.tasksService.update(task.id, { status: 'done' });
      this.tasks = this.tasks.map((item) => item.id === updated.id ? updated : item);
      if (this.selectedTask?.id === updated.id) {
        this.selectedTask = updated;
      }
      this.refreshCalendar();
      this.refreshDeadLetters();
      this.successMessage = 'admin.tasks.done_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
    } finally {
      this.cdr.detectChanges();
    }
  }

  /**
   * Open delete confirmation modal for selected task.
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
   * Close delete confirmation modal.
   */
  closeDeleteModal(): void {
    this.deleteTarget = null;
    this.deleteError = '';
    this.isDeleteModalOpen = false;
  }

  /**
   * Confirm task deletion and refresh scheduler data.
   */
  async confirmDelete(): Promise<void> {
    if (!this.deleteTarget) {
      return;
    }

    this.deleteError = '';
    try {
      await this.tasksService.remove(this.deleteTarget.id);
      this.closeDeleteModal();
      if (this.selectedTask?.id === this.deleteTarget.id) {
        this.closeDialog();
      }
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
   * Decide visibility of delete action for a task.
   */
  canDeleteTask(task: TaskItem): boolean {
    if (task.can_delete === true) {
      return true;
    }

    const userId = Number(this.authService.currentUserValue()?.id ?? 0);
    const hasRealComments = (task.comments ?? []).some((comment) => !comment.is_system);
    return userId > 0 && userId === task.created_by && !hasRealComments;
  }

  /**
   * Decide visibility of comment-delete action for a comment.
   */
  canDeleteComment(comment: TaskComment): boolean {
    if (comment.can_delete === true) {
      return true;
    }

    const userId = Number(this.authService.currentUserValue()?.id ?? 0);
    const ownerId = Number(comment.user?.id ?? 0);
    return !comment.is_system && userId > 0 && ownerId === userId;
  }

  /**
   * Format timestamp for detail dialog in business timezone.
   */
  formatForDialog(iso: string | null | undefined): string {
    if (!iso) {
      return '-';
    }
    return TaskDateTimeUtils.formatDateTime(iso, this.languageService.getLanguage());
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
   * Initial scheduler bootstrap:
   * - load staff options
   * - load visible tasks
   * - render calendar events
   */
  private async loadInitialData(): Promise<void> {
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
        // Offline fallback keeps assignment control usable after backend shutdown.
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
      this.refreshCalendar();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Reload task list used by scheduler event source.
   */
  private async loadTasks(): Promise<void> {
    const assigneeFilter = this.canFilterByPersonnel ? this.selectedAssigneeFilterId : null;
    this.tasks = await this.tasksService.list(assigneeFilter);
    this.recentOwnTitles = TaskTemplateSuggestionsUtils.buildRecentOwnTitles(
      this.tasks,
      Number(this.authService.currentUserValue()?.id ?? 0)
    );
    this.refreshDeadLetters();
    this.refreshCalendar();
    this.cdr.detectChanges();
  }

  /**
   * Refresh dead-letter snapshot for explicit retry/discard controls.
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
   * Rebuild FullCalendar options with current event set.
   */
  private refreshCalendar(): void {
    const events = this.tasks.map((task) => this.toCalendarEvent(task));
    this.calendarOptions = this.buildCalendarOptions(events);
    // Avoid forcing an immediate detect cycle while Angular is already updating.
    // markForCheck is safe in both idle and in-progress change-detection phases.
    this.cdr.markForCheck();
  }

  /**
   * Build FullCalendar configuration based on language and current UI state.
   *
   * Includes:
   * - timezone policy (Asia/Tehran)
   * - RTL for FA
   * - day header customization for Jalali labels
   */
  private buildCalendarOptions(events: EventInput[]): CalendarOptions {
    const isFa = this.languageService.getLanguage() === 'fa';

    return {
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, momentTimezonePlugin],
      initialView: this.selectedView,
      initialDate: new Date(),
      locale: isFa ? 'fa' : 'en',
      direction: isFa ? 'rtl' : 'ltr',
      // In FA mode week columns should start from the right side.
      firstDay: isFa ? 6 : 1,
      // Calendar rendering must follow hotel business time (Tehran), not browser local time.
      timeZone: 'Asia/Tehran',
      allDaySlot: false,
      // Render concurrent events side-by-side for clearer title readability.
      slotEventOverlap: false,
      eventMinHeight: 34,
      slotMinTime: '00:00:00',
      slotMaxTime: '24:00:00',
      slotLabelFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
      // Event cards intentionally hide time to keep concurrent titles legible.
      displayEventTime: false,
      height: 'auto',
      headerToolbar: false,
      nowIndicator: true,
      events,
      eventContent: (arg) => ({
        html: `<div class="task-event__title">${this.escapeHtml(arg.event.title)}</div>`,
      }),
      dateClick: (arg) => this.onDateClick(arg),
      eventClick: (arg) => void this.onEventClick(arg),
      datesSet: (arg) => this.onDatesSet(arg),
      dayHeaderContent: (arg) => {
        if (!isFa) {
          return arg.text;
        }
        return this.buildJalaliDayHeader(arg.date);
      },
      slotLabelContent: (arg) => isFa ? DateUtils.toPersianDigits(arg.text) : arg.text,
    };
  }

  /**
   * Handle calendar visible-range change and update range label.
   */
  private onDatesSet(arg: DatesSetArg): void {
    this.selectedView = arg.view.type as SchedulerViewMode;
    this.visibleRangeLabel = this.buildRangeLabel(arg.start, new Date(arg.end.getTime() - 1));
    // datesSet can fire during FullCalendar/Angular render transitions.
    // Use markForCheck instead of detectChanges to prevent assertion errors.
    this.cdr.markForCheck();
  }

  /**
   * Handle click on an empty calendar slot by opening create modal.
   */
  private onDateClick(arg: DateClickArg): void {
    this.openCreateModal(arg.date.toISOString());
  }

  /**
   * Handle click on calendar event by opening task detail.
   */
  private async onEventClick(arg: EventClickArg): Promise<void> {
    const taskId = Number(arg.event.id);
    await this.openDetails(taskId);
  }

  /**
   * Convert task entity into FullCalendar event object.
   */
  private toCalendarEvent(task: TaskItem): EventInput {
    const start = task.starts_at ?? task.created_at;
    const end = task.ends_at ?? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
    const isToday = this.toLocalDateKey(start) === this.toLocalDateKey(new Date().toISOString());

    return {
      id: String(task.id),
      title: task.title,
      start,
      end,
      classNames: [
        'task-event',
        `task-event--${task.status}`,
        ...(isToday ? ['task-event--today'] : []),
      ],
      extendedProps: {
        status: task.status,
      },
    };
  }

  /**
   * Escape plain text for safe insertion into eventContent HTML.
   */
  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /**
   * Convert ISO timestamp to local `YYYY-MM-DD` key.
   */
  private toLocalDateKey(iso: string): string {
    const date = new Date(iso);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Build Jalali day header label (weekday + day/month) for FA mode.
   */
  private buildJalaliDayHeader(date: Date): string {
    // Use explicit Tehran timezone for weekday/date header generation.
    // This avoids browser-local drift (off-by-one day) in FA Jalali mode.
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';

    // FA scheduler header requires month/day order.
    return `${weekday} ${month}/${day}`;
  }

  /**
   * Build visible range title shown above calendar.
   */
  private buildRangeLabel(start: Date, end: Date): string {
    const isFa = this.languageService.getLanguage() === 'fa';
    if (!isFa) {
      return `${start.toLocaleDateString('en-US')} - ${end.toLocaleDateString('en-US')}`;
    }

    const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }

  /**
   * Map backend assignee payload to selector options.
   */
  private mapAssigneeOptions(users: TaskAssigneeOption[]): AssigneeUiOption[] {
    return users.map((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.trim();
      const label = fullName || user.username || `#${user.id}`;
      return { id: user.id, label };
    });
  }

  /**
   * Build minimum assignee option set when remote staff endpoint is unavailable.
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
   * Resolve default assignee for create flow (current user).
   */
  private defaultAssigneeIds(): number[] {
    const userId = Number(this.authService.currentUserValue()?.id ?? 0);
    return userId > 0 ? [userId] : [];
  }

  /**
   * Normalize backend validation errors into field-key map.
   */
  private extractFieldErrors(error: unknown): Record<string, string[]> {
    const err = error as { error?: { errors?: Record<string, string[] | string> } };
    const source = err.error?.errors ?? {};
    const mapped: Record<string, string[]> = {};

    Object.entries(source).forEach(([key, value]) => {
      mapped[key] = Array.isArray(value) ? value.map((item) => String(item)) : [String(value)];
    });

    return mapped;
  }

  /**
   * Shared attachment upload flow (used by both file pickers).
   */
  private async uploadTaskAttachments(files: File[]): Promise<void> {
    if (!this.selectedTask) {
      return;
    }

    this.isAttachmentUploading = true;
    this.attachmentErrorMessage = '';
    try {
      const updated = await this.tasksService.uploadAttachments(this.selectedTask.id, files);
      this.selectedTask = updated;
      this.tasks = this.tasks.map((task) => task.id === updated.id ? updated : task);
      await this.preloadAttachmentPreviews(updated);
      this.refreshCalendar();
      this.successMessage = updated.is_pending
        ? 'admin.tasks.attachments.sync_pending'
        : 'admin.tasks.attachments.uploaded_success';
    } catch (error) {
      const parsed = parseHttpError(error);
      this.attachmentErrorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
    } finally {
      this.isAttachmentUploading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Preload thumbnails for selected task attachments.
   */
  private async preloadAttachmentPreviews(task: TaskItem): Promise<void> {
    const attachments = task.attachments ?? [];
    for (const attachment of attachments) {
      try {
        await this.attachmentPreviewCache.resolveUrl(this.tasksService, attachment);
      } catch {
        // Keep preview flow resilient: one failed image must not block others.
      }
    }
  }

  /**
   * Attach camera stream to dialog video element after render.
   */
  private bindCameraStream(): void {
    const video = this.schedulerAttachmentCameraVideoRef?.nativeElement;
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
