import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from './auth.service';

export interface TaskAssignedUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

export interface TaskItem {
  id: number;
  title: string;
  status: 'open' | 'done';
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: number;
  creator: TaskAssignedUser | null;
  assigned_users: TaskAssignedUser[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  can_edit: boolean;
  can_mark_done: boolean;
  can_delete?: boolean;
  // Offline/optimistic hints for UI extensions.
  is_pending?: boolean;
  sync_error?: string | null;
}

export interface TaskComment {
  id: number;
  comment: string;
  is_system: boolean;
  can_delete?: boolean;
  created_at: string;
  user: TaskAssignedUser | null;
  // Offline/optimistic hints for comment rows.
  is_pending?: boolean;
  sync_error?: string | null;
}

export interface TaskAttachment {
  id: number;
  task_id: number | null;
  album_key: string;
  reference_type: string | null;
  reference_id: number | null;
  title: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: number;
  uploader?: TaskAssignedUser | null;
  file_url: string;
  created_at: string | null;
  updated_at: string | null;
  can_delete?: boolean;
  can_edit?: boolean;
}

export interface TaskAssigneeOption {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

export interface TaskDeadLetterEntry {
  id: string;
  entry: {
    type: 'create' | 'update' | 'delete' | 'comment_add' | 'comment_delete' | 'attachment_add';
    task_id: number;
    payload: TaskOutboxPayload;
    created_at: string;
    retries: number;
    last_error?: string;
  };
  failed_at: string;
  reason: string;
}

interface TaskMutationPayload {
  title?: string;
  status?: 'open' | 'done';
  assigned_user_ids?: number[];
  starts_at?: string | null;
  ends_at?: string | null;
}

interface TaskOutboxEntry {
  id: string;
  type: 'create' | 'update' | 'delete' | 'comment_add' | 'comment_delete' | 'attachment_add';
  // Holds current local task reference. For pending creates this is temp negative id.
  task_id: number;
  payload: TaskOutboxPayload;
  created_at: string;
  retries: number;
  // Next earliest replay timestamp for retry backoff (ISO UTC).
  // Missing values (legacy entries) are treated as "retry now".
  next_retry_at?: string;
  last_error?: string;
}

type TaskOutboxPayload = TaskMutationPayload | CommentAddPayload | CommentDeletePayload | AttachmentAddPayload;

interface CommentAddPayload {
  comment: string;
  // Local temporary comment id helps us remove queued inserts when user
  // deletes the unsynced optimistic comment before replay.
  temp_comment_id?: number;
}

interface CommentDeletePayload {
  comment_id: number;
}

interface AttachmentAddPayload {
  batch_id: string;
  file_count: number;
}

interface QueuedAttachmentBatch {
  id: string;
  task_id: number;
  files: File[];
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // Conservative per-file target to stay below typical default PHP upload limits (2MB)
  // in local/dev environments where php.ini was not tuned yet.
  private static readonly PREFERRED_MAX_FILE_BYTES = 1_800_000;
  // Keep visual quality high while reducing payload for mobile uploads.
  private static readonly MAX_IMAGE_EDGE_PX = 1920;

  // Local persistence keys for offline-first task cache and mutation outbox.
  private static readonly TASK_CACHE_KEY = 'nh_tasks_cache_v1';
  private static readonly TASK_OUTBOX_KEY = 'nh_tasks_outbox_v1';
  private static readonly TASK_DEAD_LETTER_KEY = 'nh_tasks_dead_letters_v1';
  private static readonly TASK_ASSIGNEES_KEY = 'nh_task_assignees_cache_v1';
  private static readonly ATTACHMENT_DB_NAME = 'nh_tasks_offline_db';
  private static readonly ATTACHMENT_DB_VERSION = 1;
  private static readonly ATTACHMENT_STORE = 'attachment_batches';

  // Background outbox processing cadence.
  private static readonly SYNC_INTERVAL_MS = 15_000;
  // Retry backoff baseline for failed outbox replay operations.
  private static readonly RETRY_BASE_MS = 5_000;
  // Hard upper bound to keep retries regular without hammering backend.
  private static readonly RETRY_MAX_MS = 5 * 60 * 1_000;
  // Stop replaying permanently failing entries after this many hard retries.
  private static readonly RETRY_MAX_ATTEMPTS = 8;

  // Keep background sync strictly single-flight.
  private isSyncRunning = false;
  // Dedicated timer handle for "next due retry" scheduling.
  // This complements the fixed interval loop with precise wakeups.
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.bootstrapBackgroundSync();
  }

  /**
   * Manually trigger outbox replay (e.g. from "Sync now" UI action).
   */
  async forceSyncNow(): Promise<void> {
    await this.flushOutbox({ ignoreBackoff: true });
  }

  /**
   * Return dead-letter queue for explicit user actions (retry/discard).
   */
  listDeadLetters(): TaskDeadLetterEntry[] {
    const items = this.readDeadLetters();
    return [...items].sort((a, b) => b.failed_at.localeCompare(a.failed_at));
  }

  /**
   * Remove one dead-letter entry and cleanup related persisted payloads.
   */
  discardDeadLetter(deadLetterId: string): void {
    const deadLetters = this.readDeadLetters();
    const target = deadLetters.find((item) => item.id === deadLetterId) ?? null;
    this.writeDeadLetters(deadLetters.filter((item) => item.id !== deadLetterId));

    if (!target) {
      return;
    }

    if (target.entry.type === 'attachment_add') {
      const payload = target.entry.payload as AttachmentAddPayload;
      const batchId = String(payload.batch_id ?? '');
      if (batchId) {
        void this.deleteAttachmentBatch(batchId);
      }
    }
  }

  /**
   * Move one dead-letter entry back to outbox for another replay attempt.
   */
  async retryDeadLetter(deadLetterId: string): Promise<boolean> {
    const deadLetters = this.readDeadLetters();
    const target = deadLetters.find((item) => item.id === deadLetterId) ?? null;
    if (!target) {
      return false;
    }

    // Attachment retries require persisted batch availability.
    if (target.entry.type === 'attachment_add') {
      const payload = target.entry.payload as AttachmentAddPayload;
      const batchId = String(payload.batch_id ?? '');
      if (!batchId) {
        this.discardDeadLetter(deadLetterId);
        return false;
      }
      const batch = await this.readAttachmentBatch(batchId);
      if (!batch) {
        this.discardDeadLetter(deadLetterId);
        return false;
      }
    }

    this.enqueueOutboxEntry({
      type: target.entry.type,
      task_id: target.entry.task_id,
      payload: target.entry.payload,
    });
    this.writeDeadLetters(deadLetters.filter((item) => item.id !== deadLetterId));
    await this.forceSyncNow();
    return true;
  }

  /**
   * Fetch tasks visible to the current user.
   *
   * Offline-first strategy:
   * - return cached tasks immediately when available
   * - trigger background refresh to reconcile with server
   * - if cache is empty, fallback to direct server request
   */
  async list(assignedUserId?: number | null): Promise<TaskItem[]> {
    const cached = this.readTaskCache();
    if (cached.length > 0) {
      // Reconcile in background while keeping list responsive/offline-safe.
      void this.refreshTasksFromServer(assignedUserId ?? null);
      return this.applyAssignedUserFilter(cached, assignedUserId ?? null);
    }

    const remote = await this.fetchTasksFromServer(assignedUserId ?? null);
    this.persistFetchedTasks(remote, assignedUserId ?? null);
    return this.applyAssignedUserFilter(remote, assignedUserId ?? null);
  }

  /**
   * Create a daily responsibility.
   *
   * Optimistic strategy:
   * - insert local optimistic task immediately
   * - attempt API create now
   * - on offline/transient network errors: queue create in outbox and keep optimistic task
   * - on hard server validation errors: rollback optimistic task and rethrow
   */
  async create(payload: {
    title: string;
    status?: 'open' | 'done';
    assigned_user_ids: number[];
    starts_at?: string | null;
    ends_at?: string | null;
  }): Promise<TaskItem> {
    const optimisticTask = this.buildOptimisticTask(payload);
    this.upsertCachedTask(optimisticTask);

    try {
      const response = await firstValueFrom(
        this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks`, payload)
      );
      const serverTask = this.normalizeServerTask(response.data);
      this.replaceCachedTaskId(optimisticTask.id, serverTask);
      return serverTask;
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        this.enqueueOutboxEntry({
          type: 'create',
          task_id: optimisticTask.id,
          payload,
        });
        // Keep task pending and flush when network resumes.
        void this.flushOutbox();
        return optimisticTask;
      }

      // Hard server-side rejection -> rollback optimistic insert.
      this.removeCachedTask(optimisticTask.id);
      throw error;
    }
  }

  /**
   * Update task fields and/or status.
   *
   * Optimistic strategy:
   * - patch task in local cache immediately
   * - attempt API update now
   * - on offline/transient errors: queue update and keep optimistic state
   * - on hard rejection: rollback to previous local snapshot
   */
  async update(id: number, payload: TaskMutationPayload): Promise<TaskItem> {
    const previous = this.findCachedTask(id);
    const optimistic = this.buildOptimisticUpdate(previous, id, payload);
    this.upsertCachedTask(optimistic);

    // Local-only task ids are unsynced create artifacts. Updates are queued directly.
    if (id < 0) {
      this.enqueueOutboxEntry({
        type: 'update',
        task_id: id,
        payload,
      });
      void this.flushOutbox();
      return optimistic;
    }

    try {
      const response = await firstValueFrom(
        this.http.put<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${id}`, payload)
      );
      const serverTask = this.normalizeServerTask(response.data);
      this.upsertCachedTask(serverTask);
      return serverTask;
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        this.enqueueOutboxEntry({
          type: 'update',
          task_id: id,
          payload,
        });
        void this.flushOutbox();
        return optimistic;
      }

      // Hard rejection -> revert local state to pre-update snapshot.
      if (previous) {
        this.upsertCachedTask(previous);
      } else {
        this.removeCachedTask(id);
      }
      throw error;
    }
  }

  /**
   * Return assignable staff options for task assignment selectors.
   *
   * Offline behavior:
   * - fallback to cached assignee list when API is unreachable
   */
  async listAssignees(): Promise<TaskAssigneeOption[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ data: TaskAssigneeOption[] }>(`${API_BASE_URL}/tasks/assignees`)
      );
      const items = response.data ?? [];
      this.writeAssigneeCache(items);
      return items;
    } catch (error) {
      const cached = this.readAssigneeCache();
      if (cached.length > 0) {
        return cached;
      }
      throw error;
    }
  }

  /**
   * Fetch one task with full details for dialog rendering.
   *
   * Offline-first behavior:
   * - when offline or API fails, return cached task when available
   */
  async get(id: number): Promise<TaskItem> {
    const cached = this.findCachedTask(id);

    // Temp local ids only exist client-side; server lookup is invalid by design.
    if (id < 0) {
      if (cached) {
        return cached;
      }
      throw new Error(`task_not_found_local_${id}`);
    }

    try {
      const response = await firstValueFrom(
        this.http.get<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${id}`)
      );
      const serverTask = this.normalizeServerTask(response.data);
      this.upsertCachedTask(serverTask);
      return serverTask;
    } catch (error) {
      if (cached) {
        return cached;
      }
      throw error;
    }
  }

  /**
   * Add a user comment to task feed.
   *
   * Current phase keeps comment mutation online-first.
   * It still updates local cache on success.
   */
  async addComment(taskId: number, comment: string): Promise<TaskItem> {
    const previousTask = this.findCachedTask(taskId);
    const optimisticComment = this.buildOptimisticComment(comment);
    const optimisticTask = this.withCommentAppended(previousTask, taskId, optimisticComment);
    this.upsertCachedTask(optimisticTask);

    // For local-only tasks we cannot hit server yet; queue for replay after
    // task create reconciliation.
    if (taskId < 0) {
      this.enqueueOutboxEntry({
        type: 'comment_add',
        task_id: taskId,
        payload: {
          comment,
          temp_comment_id: optimisticComment.id,
        },
      });
      void this.flushOutbox();
      return optimisticTask;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${taskId}/comments`, { comment })
      );
      const updated = this.normalizeServerTask(response.data);
      this.upsertCachedTask(updated);
      return updated;
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        this.enqueueOutboxEntry({
          type: 'comment_add',
          task_id: taskId,
          payload: {
            comment,
            temp_comment_id: optimisticComment.id,
          },
        });
        void this.flushOutbox();
        return optimisticTask;
      }

      // Hard rejection -> restore pre-comment snapshot.
      if (previousTask) {
        this.upsertCachedTask(previousTask);
      } else {
        this.removeCachedTask(taskId);
      }
      throw error;
    }
  }

  /**
   * Delete one real (non-system) comment from a task feed.
   *
   * Current phase keeps comment deletion online-first.
   */
  async removeComment(taskId: number, commentId: number): Promise<TaskItem> {
    const previousTask = this.findCachedTask(taskId);
    const optimisticTask = this.withCommentRemoved(previousTask, taskId, commentId);
    this.upsertCachedTask(optimisticTask);

    // Unsynced optimistic comments exist only locally; deleting them means
    // we should simply remove their queued add operation.
    if (commentId < 0) {
      this.dropQueuedCommentAdd(taskId, commentId);
      return optimisticTask;
    }

    // For local-only tasks server deletion is impossible until task sync.
    if (taskId < 0) {
      this.enqueueOutboxEntry({
        type: 'comment_delete',
        task_id: taskId,
        payload: { comment_id: commentId },
      });
      void this.flushOutbox();
      return optimisticTask;
    }

    try {
      const response = await firstValueFrom(
        this.http.delete<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${taskId}/comments/${commentId}`)
      );
      const updated = this.normalizeServerTask(response.data);
      this.upsertCachedTask(updated);
      return updated;
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        this.enqueueOutboxEntry({
          type: 'comment_delete',
          task_id: taskId,
          payload: { comment_id: commentId },
        });
        void this.flushOutbox();
        return optimisticTask;
      }

      // Hard rejection -> restore original task snapshot.
      if (previousTask) {
        this.upsertCachedTask(previousTask);
      } else {
        this.removeCachedTask(taskId);
      }
      throw error;
    }
  }

  /**
   * Delete task.
   *
   * Optimistic strategy:
   * - remove from local cache immediately
   * - try API delete now
   * - on offline/transient errors queue delete and keep local removal
   * - on hard rejection restore previously removed task
   */
  async remove(id: number): Promise<void> {
    const previous = this.findCachedTask(id);
    this.removeCachedTask(id);

    // Local-only tasks can be deleted fully client-side.
    if (id < 0) {
      this.dropOutboxEntriesForTask(id);
      return;
    }

    try {
      await firstValueFrom(
        this.http.delete(`${API_BASE_URL}/tasks/${id}`)
      );
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        this.enqueueOutboxEntry({
          type: 'delete',
          task_id: id,
          payload: {},
        });
        void this.flushOutbox();
        return;
      }

      // Hard rejection -> restore previous task snapshot.
      if (previous) {
        this.upsertCachedTask(previous);
      }
      throw error;
    }
  }

  /**
   * Upload one or many image attachments to a task.
   *
   * Transport:
   * - multipart/form-data with repeated `images[]` parts
   * - backend validates image type/size and returns refreshed task payload
   */
  async uploadAttachments(taskId: number, files: File[]): Promise<TaskItem> {
    // Normalize/compress files before transport to reduce "failed to upload"
    // errors caused by strict server upload limits.
    const preparedFiles = await this.prepareFilesForUpload(files);
    const previousTask = this.findCachedTask(taskId);
    const optimisticTask = this.markTaskPending(previousTask, taskId);
    this.upsertCachedTask(optimisticTask);

    // For unsynced local tasks and offline network state, store files in IndexedDB
    // and replay automatically after reconnect/task-id reconciliation.
    if (taskId < 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      try {
        await this.enqueueAttachmentBatch(taskId, preparedFiles);
        void this.flushOutbox();
        return optimisticTask;
      } catch {
        // If local batch persistence fails, revert optimistic pending flag and
        // bubble up as regular save failure.
        if (previousTask) {
          this.upsertCachedTask(previousTask);
        }
        throw new Error('attachment_queue_failed');
      }
    }

    const formData = new FormData();
    preparedFiles.forEach((file) => {
      formData.append('images[]', file);
    });
    try {
      const response = await firstValueFrom(
        this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${taskId}/attachments`, formData)
      );
      const updated = this.normalizeServerTask(response.data);
      this.upsertCachedTask(updated);
      return updated;
    } catch (error) {
      if (this.isTransientOfflineError(error)) {
        try {
          await this.enqueueAttachmentBatch(taskId, preparedFiles);
          void this.flushOutbox();
          return optimisticTask;
        } catch {
          if (previousTask) {
            this.upsertCachedTask(previousTask);
          }
          throw new Error('attachment_queue_failed');
        }
      }

      // Hard server-side rejection -> restore previous task snapshot.
      if (previousTask) {
        this.upsertCachedTask(previousTask);
      } else {
        this.removeCachedTask(taskId);
      }
      throw error;
    }
  }

  /**
   * Prepare images for backend upload limits.
   *
   * Strategy:
   * - keep small, supported images unchanged
   * - for large or unsupported/unknown image encodings, convert to JPEG
   * - resize long edge to <= 1920px and adjust quality until target size is met
   *
   * This runs in browser only and does not alter server-side originals because
   * uploads are task evidence photos where practical transmission is more
   * important than archival RAW fidelity.
   *
   * @param files Raw selected files from input/camera.
   */
  private async prepareFilesForUpload(files: File[]): Promise<File[]> {
    const prepared: File[] = [];

    // Sequential processing avoids CPU spikes on low-end mobile devices.
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        prepared.push(file);
        continue;
      }

      const isSmallEnough = file.size <= TasksService.PREFERRED_MAX_FILE_BYTES;
      const isDirectlySupportedType = this.isBackendSupportedImageMime(file.type);
      if (isSmallEnough && isDirectlySupportedType) {
        prepared.push(file);
        continue;
      }

      const optimized = await this.tryOptimizeToJpeg(file);
      prepared.push(optimized ?? file);
    }

    return prepared;
  }

  /**
   * Backend image whitelist mirror used for "keep as-is" decision.
   */
  private isBackendSupportedImageMime(mime: string): boolean {
    return [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ].includes(mime.toLowerCase());
  }

  /**
   * Convert an image file to optimized JPEG.
   *
   * Returns null when browser cannot decode the source image.
   */
  private async tryOptimizeToJpeg(file: File): Promise<File | null> {
    const image = await this.loadImage(file);
    if (!image) {
      return null;
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    // Scale down large photos while preserving aspect ratio.
    const longestEdge = Math.max(sourceWidth, sourceHeight);
    const scale = longestEdge > TasksService.MAX_IMAGE_EDGE_PX
      ? TasksService.MAX_IMAGE_EDGE_PX / longestEdge
      : 1;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    // Start with good quality and step down only if still too large.
    let quality = 0.86;
    let blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
    if (!blob) {
      return null;
    }

    while (blob.size > TasksService.PREFERRED_MAX_FILE_BYTES && quality > 0.56) {
      quality -= 0.08;
      const nextBlob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
      if (!nextBlob) {
        break;
      }
      blob = nextBlob;
    }

    const baseName = (file.name || 'upload').replace(/\.[^/.]+$/, '');
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }

  /**
   * Decode File into HTMLImageElement for canvas processing.
   */
  private async loadImage(file: File): Promise<HTMLImageElement | null> {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Promise wrapper for canvas.toBlob().
   */
  private async canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  /**
   * Delete one attachment from task detail context.
   */
  async removeAttachment(taskId: number, attachmentId: number): Promise<TaskItem> {
    const response = await firstValueFrom(
      this.http.delete<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${taskId}/attachments/${attachmentId}`)
    );
    const updated = this.normalizeServerTask(response.data);
    this.upsertCachedTask(updated);
    return updated;
  }

  /**
   * Load protected attachment bytes as Blob.
   *
   * We avoid exposing public storage URLs. Instead, client fetches through
   * authenticated API endpoint and renders via object URL.
   */
  async fetchAttachmentBlob(attachmentId: number): Promise<Blob> {
    return await firstValueFrom(
      this.http.get(`${API_BASE_URL}/photos/${attachmentId}/file`, {
        responseType: 'blob',
      })
    );
  }

  /**
   * Keep periodic outbox processing alive and trigger immediate replay when
   * browser reconnects.
   */
  private bootstrapBackgroundSync(): void {
    if (typeof window !== 'undefined') {
      // Replay immediately when browser reconnects.
      window.addEventListener('online', () => {
        void this.flushOutbox();
      });

      // Cross-tab coordination: when another tab updates outbox key, this tab
      // should also wake up and attempt replay for newly queued operations.
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === TasksService.TASK_OUTBOX_KEY) {
          void this.flushOutbox();
        }
      });

      // Resume sync quickly when app regains user focus after being backgrounded.
      window.addEventListener('focus', () => {
        void this.flushOutbox();
      });
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      // Service worker can wake currently open tabs via postMessage when push
      // events are received. We treat that as a high-priority sync hint.
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
        const payload = event.data as { type?: string } | null;
        if (payload?.type === 'TASKS_WAKE_SYNC') {
          void this.flushOutbox();
        }
      });
    }

    if (typeof document !== 'undefined') {
      // Visibility-based wake-up avoids long stale periods on mobile/tab suspend.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.flushOutbox();
        }
      });
    }

    // Best-effort periodic replay while app stays open.
    setInterval(() => {
      void this.flushOutbox();
    }, TasksService.SYNC_INTERVAL_MS);

    // Initial schedule from persisted queue (after reload/crash recovery).
    this.scheduleNextRetryTimer();
  }

  /**
   * Pull fresh task list from server and merge into cache.
   */
  private async refreshTasksFromServer(assignedUserId: number | null): Promise<void> {
    try {
      const remote = await this.fetchTasksFromServer(assignedUserId);
      // For full list queries, server snapshot is canonical.
      // For staff-filtered queries, merge only fetched records to avoid dropping
      // other cached tasks that were not part of the filtered subset.
      this.persistFetchedTasks(remote, assignedUserId);
    } catch {
      // Silence background refresh failures to preserve offline UX.
    }
  }

  /**
   * Persist fetched tasks with filter-aware strategy.
   *
   * Behavior:
   * - no filter: replace entire cache with server truth
   * - filtered fetch: upsert fetched subset into existing cache
   */
  private persistFetchedTasks(tasks: TaskItem[], assignedUserId: number | null): void {
    if (!assignedUserId) {
      this.replaceTaskCache(tasks);
      return;
    }

    const existing = this.readTaskCache();
    const byId = new Map<number, TaskItem>(existing.map((item) => [item.id, item]));
    for (const task of tasks) {
      byId.set(task.id, task);
    }
    this.replaceTaskCache([...byId.values()]);
  }

  /**
   * Single endpoint helper used by list and refresh paths.
   */
  private async fetchTasksFromServer(assignedUserId: number | null): Promise<TaskItem[]> {
    const query: Record<string, string> = {};
    if (assignedUserId) {
      query['assigned_user_id'] = String(assignedUserId);
    }

    const response = await firstValueFrom(
      this.http.get<{ data: TaskItem[] }>(`${API_BASE_URL}/tasks`, {
        params: query,
      })
    );

    return (response.data ?? []).map((task) => this.normalizeServerTask(task));
  }

  /**
   * Queue operation for deferred replay.
   */
  private enqueueOutboxEntry(input: Omit<TaskOutboxEntry, 'id' | 'created_at' | 'retries'>): void {
    const existing = this.readOutbox();
    const entry: TaskOutboxEntry = {
      ...input,
      id: this.generateOutboxId(),
      created_at: new Date().toISOString(),
      retries: 0,
      next_retry_at: new Date().toISOString(),
    };
    existing.push(entry);
    this.writeOutbox(existing);
  }

  /**
   * Process queued operations in FIFO order.
   */
  private async flushOutbox(options?: { ignoreBackoff?: boolean }): Promise<void> {
    if (this.isSyncRunning) {
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    this.isSyncRunning = true;
    try {
      while (true) {
        const queue = this.readOutbox();
        if (queue.length === 0) {
          return;
        }

        const replayCandidates = this.pickReplayCandidates(queue, options?.ignoreBackoff === true);
        if (replayCandidates.length === 0) {
          return;
        }
        const next = replayCandidates[0];

        try {
          await this.replayOutboxEntry(next);
          this.deleteOutboxEntry(next.id);
        } catch (error) {
          // Update for a temp id must wait until queued create is synchronized.
          if (error instanceof Error && error.message === 'pending_create_not_synced') {
            this.scheduleOutboxRetry(next.id, 'pending_create_not_synced', { incrementAttempts: false });
            continue;
          }

          if (this.isTransientOfflineError(error)) {
            // Keep remaining queue for next online attempt.
            this.scheduleOutboxRetry(next.id, this.readErrorMessage(error), { incrementAttempts: false });
            return;
          }

          // Conflict policy:
          // - when server returns 409, apply server state (if provided),
          //   drop the queued mutation, and continue with remaining entries.
          if (this.isConflictError(error)) {
            this.resolveConflictEntry(next, error);
            this.deleteOutboxEntry(next.id);
            continue;
          }

          // Persist failure metadata and mirror failure state into local cache
          // so UI can expose pending/failed badges.
          const message = this.readErrorMessage(error);
          const retryMeta = this.scheduleOutboxRetry(next.id, message);
          if (retryMeta.exhausted) {
            // Dead-letter behavior:
            // - remove permanently failing operation from queue
            // - keep payload for explicit user retry/discard actions
            this.moveOutboxEntryToDeadLetter(next, message);
            this.deleteOutboxEntry(next.id, { cleanupAttachmentBatch: false });
            this.applyOutboxFailureToCache(next, message);
            continue;
          }
          this.applyOutboxFailureToCache(next, message);
          continue;
        }
      }
    } finally {
      this.isSyncRunning = false;
    }
  }

  /**
   * Replay one queued mutation against backend.
   */
  private async replayOutboxEntry(entry: TaskOutboxEntry): Promise<void> {
    if (entry.type === 'create') {
      await this.replayCreate(entry);
      return;
    }

    if (entry.type === 'update') {
      await this.replayUpdate(entry);
      return;
    }

    if (entry.type === 'comment_add') {
      await this.replayCommentAdd(entry);
      return;
    }

    if (entry.type === 'comment_delete') {
      await this.replayCommentDelete(entry);
      return;
    }

    if (entry.type === 'attachment_add') {
      await this.replayAttachmentAdd(entry);
      return;
    }

    await this.replayDelete(entry);
  }

  /**
   * Replay queued create and reconcile temp local id with server id.
   */
  private async replayCreate(entry: TaskOutboxEntry): Promise<void> {
    const localTask = this.findCachedTask(entry.task_id);
    if (!localTask) {
      return;
    }

    const payload = entry.payload as {
      title: string;
      status?: 'open' | 'done';
      assigned_user_ids: number[];
      starts_at?: string | null;
      ends_at?: string | null;
    };

    const response = await firstValueFrom(
      this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks`, payload)
    );
    const serverTask = this.normalizeServerTask(response.data);

    // Replace temp id entity and re-point follow-up outbox operations.
    this.replaceCachedTaskId(entry.task_id, serverTask);
    this.rewriteOutboxTaskId(entry.task_id, serverTask.id);
  }

  /**
   * Replay queued update mutation.
   */
  private async replayUpdate(entry: TaskOutboxEntry): Promise<void> {
    // Temp ids are waiting for create reconciliation; skip until id is rewritten.
    if (entry.task_id < 0) {
      throw new Error('pending_create_not_synced');
    }

    const payload = entry.payload as TaskMutationPayload;
    const response = await firstValueFrom(
      this.http.put<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${entry.task_id}`, payload)
    );
    const serverTask = this.normalizeServerTask(response.data);
    this.upsertCachedTask(serverTask);
  }

  /**
   * Replay queued delete mutation.
   */
  private async replayDelete(entry: TaskOutboxEntry): Promise<void> {
    if (entry.task_id < 0) {
      // Local-only task already gone.
      this.dropOutboxEntriesForTask(entry.task_id);
      return;
    }

    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/tasks/${entry.task_id}`)
    );
    this.removeCachedTask(entry.task_id);
  }

  /**
   * Replay queued comment add mutation.
   */
  private async replayCommentAdd(entry: TaskOutboxEntry): Promise<void> {
    if (entry.task_id < 0) {
      // Create must be synchronized first so task receives server id.
      throw new Error('pending_create_not_synced');
    }

    const payload = entry.payload as CommentAddPayload;
    const commentText = String(payload.comment ?? '').trim();
    if (!commentText) {
      return;
    }

    const response = await firstValueFrom(
      this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${entry.task_id}/comments`, {
        comment: commentText,
      })
    );
    const updated = this.normalizeServerTask(response.data);
    this.upsertCachedTask(updated);
  }

  /**
   * Replay queued comment delete mutation.
   */
  private async replayCommentDelete(entry: TaskOutboxEntry): Promise<void> {
    if (entry.task_id < 0) {
      // Create must be synchronized first so task receives server id.
      throw new Error('pending_create_not_synced');
    }

    const payload = entry.payload as CommentDeletePayload;
    const commentId = Number(payload.comment_id ?? 0);
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return;
    }

    const response = await firstValueFrom(
      this.http.delete<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${entry.task_id}/comments/${commentId}`)
    );
    const updated = this.normalizeServerTask(response.data);
    this.upsertCachedTask(updated);
  }

  /**
   * Replay queued attachment upload batch.
   */
  private async replayAttachmentAdd(entry: TaskOutboxEntry): Promise<void> {
    if (entry.task_id < 0) {
      // Create must be synchronized first so task receives server id.
      throw new Error('pending_create_not_synced');
    }

    const payload = entry.payload as AttachmentAddPayload;
    const batchId = String(payload.batch_id ?? '');
    if (!batchId) {
      return;
    }

    const batch = await this.readAttachmentBatch(batchId);
    if (!batch || batch.files.length === 0) {
      // Missing batch means nothing left to upload.
      await this.deleteAttachmentBatch(batchId);
      return;
    }

    const formData = new FormData();
    for (const file of batch.files) {
      formData.append('images[]', file);
    }

    const response = await firstValueFrom(
      this.http.post<{ data: TaskItem }>(`${API_BASE_URL}/tasks/${entry.task_id}/attachments`, formData)
    );
    const updated = this.normalizeServerTask(response.data);
    this.upsertCachedTask(updated);
    await this.deleteAttachmentBatch(batchId);
  }

  /**
   * Build a local optimistic task object for create operations.
   */
  private buildOptimisticTask(payload: {
    title: string;
    status?: 'open' | 'done';
    assigned_user_ids: number[];
    starts_at?: string | null;
    ends_at?: string | null;
  }): TaskItem {
    const nowIso = new Date().toISOString();
    const currentUser = this.authService.currentUserValue();
    const currentUserId = Number(currentUser?.id ?? 0);
    const tempId = this.generateTempTaskId();

    const creator: TaskAssignedUser | null = currentUserId > 0
      ? {
          id: currentUserId,
          username: String(currentUser?.username ?? ''),
          first_name: String(currentUser?.first_name ?? ''),
          last_name: String(currentUser?.last_name ?? ''),
        }
      : null;

    return {
      id: tempId,
      title: payload.title,
      status: payload.status ?? 'open',
      starts_at: payload.starts_at ?? null,
      ends_at: payload.ends_at ?? null,
      created_at: nowIso,
      updated_at: nowIso,
      created_by: currentUserId,
      creator,
      assigned_users: this.resolveAssignedUsers(payload.assigned_user_ids),
      comments: [],
      attachments: [],
      can_edit: true,
      can_mark_done: true,
      can_delete: true,
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Build optimistic local comment object.
   */
  private buildOptimisticComment(comment: string): TaskComment {
    const nowIso = new Date().toISOString();
    const currentUser = this.authService.currentUserValue();
    const currentUserId = Number(currentUser?.id ?? 0);

    const author: TaskAssignedUser | null = currentUserId > 0
      ? {
          id: currentUserId,
          username: String(currentUser?.username ?? ''),
          first_name: String(currentUser?.first_name ?? ''),
          last_name: String(currentUser?.last_name ?? ''),
        }
      : null;

    return {
      id: this.generateTempCommentId(),
      comment: comment.trim(),
      is_system: false,
      can_delete: true,
      created_at: nowIso,
      user: author,
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Append one comment into cached task snapshot (or create fallback task).
   */
  private withCommentAppended(task: TaskItem | null, taskId: number, comment: TaskComment): TaskItem {
    const base = this.ensureTaskShell(task, taskId);
    return {
      ...base,
      comments: [...(base.comments ?? []), comment],
      updated_at: new Date().toISOString(),
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Remove one comment from cached task snapshot (or create fallback task).
   */
  private withCommentRemoved(task: TaskItem | null, taskId: number, commentId: number): TaskItem {
    const base = this.ensureTaskShell(task, taskId);
    return {
      ...base,
      comments: (base.comments ?? []).filter((entry) => entry.id !== commentId),
      updated_at: new Date().toISOString(),
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Ensure we always have a writable task snapshot for optimistic comment ops.
   */
  private ensureTaskShell(task: TaskItem | null, taskId: number): TaskItem {
    if (task) {
      return task;
    }

    const nowIso = new Date().toISOString();
    return {
      id: taskId,
      title: '',
      status: 'open',
      starts_at: null,
      ends_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      created_by: Number(this.authService.currentUserValue()?.id ?? 0),
      creator: null,
      assigned_users: [],
      comments: [],
      attachments: [],
      can_edit: true,
      can_mark_done: true,
      can_delete: true,
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Mark one task snapshot as pending for optimistic/queued operations.
   */
  private markTaskPending(task: TaskItem | null, taskId: number): TaskItem {
    const base = this.ensureTaskShell(task, taskId);
    return {
      ...base,
      is_pending: true,
      sync_error: null,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Persist one attachment batch and enqueue replay operation.
   */
  private async enqueueAttachmentBatch(taskId: number, files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const batchId = this.generateAttachmentBatchId();
    const batch: QueuedAttachmentBatch = {
      id: batchId,
      task_id: taskId,
      files,
      created_at: new Date().toISOString(),
    };
    await this.writeAttachmentBatch(batch);
    this.enqueueOutboxEntry({
      type: 'attachment_add',
      task_id: taskId,
      payload: {
        batch_id: batchId,
        file_count: files.length,
      },
    });
  }

  /**
   * Build optimistic local snapshot for updates.
   */
  private buildOptimisticUpdate(previous: TaskItem | null, id: number, payload: TaskMutationPayload): TaskItem {
    const nowIso = new Date().toISOString();

    const base: TaskItem = previous ?? {
      id,
      title: payload.title ?? '',
      status: payload.status ?? 'open',
      starts_at: payload.starts_at ?? null,
      ends_at: payload.ends_at ?? null,
      created_at: nowIso,
      updated_at: nowIso,
      created_by: Number(this.authService.currentUserValue()?.id ?? 0),
      creator: null,
      assigned_users: this.resolveAssignedUsers(payload.assigned_user_ids ?? []),
      comments: [],
      attachments: [],
      can_edit: true,
      can_mark_done: true,
      can_delete: true,
      is_pending: true,
      sync_error: null,
    };

    return {
      ...base,
      title: payload.title ?? base.title,
      status: payload.status ?? base.status,
      starts_at: payload.starts_at !== undefined ? payload.starts_at ?? null : base.starts_at,
      ends_at: payload.ends_at !== undefined ? payload.ends_at ?? null : base.ends_at,
      assigned_users: payload.assigned_user_ids
        ? this.resolveAssignedUsers(payload.assigned_user_ids)
        : base.assigned_users,
      updated_at: nowIso,
      is_pending: true,
      sync_error: null,
    };
  }

  /**
   * Convert server item to canonical local shape.
   */
  private normalizeServerTask(task: TaskItem): TaskItem {
    return {
      ...task,
      is_pending: false,
      sync_error: null,
    };
  }

  /**
   * Resolve assignment ids into cached assignee labels for optimistic rendering.
   */
  private resolveAssignedUsers(ids: number[]): TaskAssignedUser[] {
    const assignees = this.readAssigneeCache();
    const byId = new Map<number, TaskAssigneeOption>(assignees.map((item) => [item.id, item]));

    return ids.map((id) => {
      const cached = byId.get(id);
      if (cached) {
        return {
          id: cached.id,
          username: cached.username,
          first_name: cached.first_name,
          last_name: cached.last_name,
        };
      }

      return {
        id,
        username: `#${id}`,
        first_name: '',
        last_name: '',
      };
    });
  }

  /**
   * Offline/transient detection guard.
   */
  private isTransientOfflineError(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }

    if (error instanceof HttpErrorResponse) {
      // status=0 covers DNS/CORS/offline/network abort in browser context.
      if (error.status === 0) {
        return true;
      }
      // 502/503/504 are usually transient gateway/service outages.
      if (error.status === 502 || error.status === 503 || error.status === 504) {
        return true;
      }
      // During local development a stopped backend can surface as generic 500
      // responses with incomplete metadata (missing body/url). We treat these
      // as transient only for local runtime hosts so optimistic flow still
      // works while backend is unavailable.
      if (error.status === 500 && this.isLikelyLocalRuntime()) {
        if (this.isLikelyBackendUnavailableError(error) || this.isLocalApiRequest(error) || !error.url) {
          return true;
        }
      }
      // Local dev proxy often returns 500 when backend process is down
      // (connection refused/socket hang up). Treat this as transient so
      // optimistic outbox flow still works during offline testing.
      if (error.status === 500 && (this.isLikelyBackendUnavailableError(error) || this.isLocalApiRequest(error))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect local-backend-unavailable signatures wrapped into a generic 500.
   *
   * Typical dev-proxy messages include:
   * - ECONNREFUSED
   * - socket hang up
   * - failed to proxy
   * - connection refused
   */
  private isLikelyBackendUnavailableError(error: HttpErrorResponse): boolean {
    const rawParts: string[] = [];
    rawParts.push(String(error.message ?? ''));

    if (typeof error.error === 'string') {
      rawParts.push(error.error);
    } else if (error.error && typeof error.error === 'object') {
      try {
        rawParts.push(JSON.stringify(error.error));
      } catch {
        // Ignore serialization issues and keep best-effort detection.
      }
    }

    const haystack = rawParts.join(' ').toLowerCase();
    return haystack.includes('econnrefused')
      || haystack.includes('connection refused')
      || haystack.includes('failed to proxy')
      || haystack.includes('socket hang up')
      || haystack.includes('err_connection_refused');
  }

  /**
   * Detect local dev API target (ng serve + local Laravel) where backend-down
   * conditions are frequently surfaced as generic 500 proxy responses.
   */
  private isLocalApiRequest(error: HttpErrorResponse): boolean {
    const target = String(error.url ?? '').toLowerCase();
    if (!target.includes('/api/')) {
      return false;
    }

    return target.includes('127.0.0.1')
      || target.includes('localhost')
      || target.includes('0.0.0.0');
  }

  /**
   * Detect if frontend itself runs on a local development host.
   */
  private isLikelyLocalRuntime(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const host = String(window.location.hostname ?? '').toLowerCase();
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0';
  }

  /**
   * Detect explicit server-side conflict response.
   */
  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  /**
   * Apply staff filter client-side for cached snapshots.
   */
  private applyAssignedUserFilter(tasks: TaskItem[], assignedUserId: number | null): TaskItem[] {
    if (!assignedUserId) {
      return [...tasks];
    }

    return tasks.filter((task) =>
      (task.assigned_users ?? []).some((user) => Number(user.id) === Number(assignedUserId))
    );
  }

  /**
   * Read task cache from localStorage safely.
   */
  private readTaskCache(): TaskItem[] {
    const raw = localStorage.getItem(TasksService.TASK_CACHE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as TaskItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Replace full task cache snapshot.
   */
  private replaceTaskCache(tasks: TaskItem[]): void {
    localStorage.setItem(TasksService.TASK_CACHE_KEY, JSON.stringify(tasks));
  }

  /**
   * Upsert one task in cache.
   */
  private upsertCachedTask(task: TaskItem): void {
    const existing = this.readTaskCache();
    const next = [...existing];
    const index = next.findIndex((item) => item.id === task.id);
    if (index >= 0) {
      next[index] = task;
    } else {
      next.unshift(task);
    }
    this.replaceTaskCache(next);
  }

  /**
   * Remove one task from cache.
   */
  private removeCachedTask(taskId: number): void {
    const existing = this.readTaskCache();
    const next = existing.filter((item) => item.id !== taskId);
    this.replaceTaskCache(next);
  }

  /**
   * Find one task in cache by id.
   */
  private findCachedTask(taskId: number): TaskItem | null {
    const existing = this.readTaskCache();
    return existing.find((item) => item.id === taskId) ?? null;
  }

  /**
   * Replace temp/local task id with canonical server task payload.
   */
  private replaceCachedTaskId(oldId: number, replacement: TaskItem): void {
    const existing = this.readTaskCache();
    const next = existing.map((item) => item.id === oldId ? replacement : item);
    this.replaceTaskCache(next);
  }

  /**
   * Read outbox queue.
   */
  private readOutbox(): TaskOutboxEntry[] {
    const raw = localStorage.getItem(TasksService.TASK_OUTBOX_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as TaskOutboxEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Read dead-letter entries from localStorage safely.
   */
  private readDeadLetters(): TaskDeadLetterEntry[] {
    const raw = localStorage.getItem(TasksService.TASK_DEAD_LETTER_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as TaskDeadLetterEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Persist dead-letter entries.
   */
  private writeDeadLetters(items: TaskDeadLetterEntry[]): void {
    localStorage.setItem(TasksService.TASK_DEAD_LETTER_KEY, JSON.stringify(items));
  }

  /**
   * Persist outbox queue.
   */
  private writeOutbox(items: TaskOutboxEntry[]): void {
    localStorage.setItem(TasksService.TASK_OUTBOX_KEY, JSON.stringify(items));
    // Every write can shift due time boundaries (add/remove/retry), therefore
    // we always refresh timer alignment.
    this.scheduleNextRetryTimer(items);

    // Ask browser background-sync subsystem for a future wakeup when possible.
    // This is best-effort and silently ignored on unsupported browsers.
    if (items.length > 0) {
      this.requestBackgroundSync();
    }
  }

  /**
   * Remove one queue entry by id.
   */
  private deleteOutboxEntry(id: string, options?: { cleanupAttachmentBatch?: boolean }): void {
    const cleanupAttachmentBatch = options?.cleanupAttachmentBatch !== false;
    const queue = this.readOutbox();
    const removed = queue.find((item) => item.id === id) ?? null;
    this.writeOutbox(queue.filter((item) => item.id !== id));

    // Best-effort attachment batch cleanup when its queue entry is removed.
    if (cleanupAttachmentBatch && removed?.type === 'attachment_add') {
      const payload = removed.payload as AttachmentAddPayload;
      const batchId = String(payload.batch_id ?? '');
      if (batchId) {
        void this.deleteAttachmentBatch(batchId);
      }
    }
  }

  /**
   * Compute and persist exponential retry backoff for one queue entry.
   *
   * Retry curve:
   * - retry #1: 5s
   * - retry #2: 10s
   * - retry #3: 20s
   * - ...capped at RETRY_MAX_MS
   */
  private scheduleOutboxRetry(
    id: string,
    message: string,
    options?: { incrementAttempts?: boolean }
  ): { retries: number; exhausted: boolean } {
    const incrementAttempts = options?.incrementAttempts !== false;
    let nextRetries = 0;
    let exhausted = false;
    const queue = this.readOutbox();
    const next = queue.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const retries = incrementAttempts ? entry.retries + 1 : entry.retries;
      const delayMs = Math.min(
        TasksService.RETRY_BASE_MS * (2 ** Math.max(0, retries - 1)),
        TasksService.RETRY_MAX_MS
      );
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
      nextRetries = retries;
      exhausted = incrementAttempts && retries >= TasksService.RETRY_MAX_ATTEMPTS;
      return {
        ...entry,
        retries,
        last_error: message,
        next_retry_at: nextRetryAt,
      };
    });
    this.writeOutbox(next);
    return { retries: nextRetries, exhausted };
  }

  /**
   * Persist one exhausted outbox entry into dead-letter storage.
   */
  private moveOutboxEntryToDeadLetter(entry: TaskOutboxEntry, reason: string): void {
    const deadLetters = this.readDeadLetters();
    const nowIso = new Date().toISOString();
    const deadLetter: TaskDeadLetterEntry = {
      id: `dl_${entry.id}`,
      entry: {
        type: entry.type,
        task_id: entry.task_id,
        payload: entry.payload,
        created_at: entry.created_at,
        retries: entry.retries,
        last_error: entry.last_error ?? reason,
      },
      failed_at: nowIso,
      reason,
    };

    deadLetters.unshift(deadLetter);
    // Keep dead-letter list bounded to avoid unbounded localStorage growth.
    this.writeDeadLetters(deadLetters.slice(0, 100));
  }

  /**
   * Align one in-memory timer to the earliest due outbox entry.
   *
   * Why this exists:
   * - fixed polling interval can delay retries longer than needed
   * - mobile browsers can throttle intervals while backgrounded
   * - explicit timer allows near-immediate replay when retry window opens
   *
   * Behavior:
   * - clears previous timer on each reschedule
   * - if queue is empty: no timer
   * - if earliest entry is due now: schedule immediate micro-delay trigger
   * - otherwise schedule exact delay to earliest due timestamp
   */
  private scheduleNextRetryTimer(preloadedQueue?: TaskOutboxEntry[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const queue = preloadedQueue ?? this.readOutbox();
    if (queue.length === 0) {
      return;
    }

    const nowMs = Date.now();
    let earliestDueMs = Number.POSITIVE_INFINITY;
    for (const entry of queue) {
      const dueMs = this.readRetryTimestampMs(entry);
      if (dueMs < earliestDueMs) {
        earliestDueMs = dueMs;
      }
    }

    if (!Number.isFinite(earliestDueMs)) {
      return;
    }

    const delayMs = Math.max(0, earliestDueMs - nowMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flushOutbox();
    }, delayMs);
  }

  /**
   * Request one-shot Background Sync wakeup for task outbox replay.
   *
   * Notes:
   * - only available on some browsers (Chromium family)
   * - no hard dependency; queue still syncs via normal triggers
   * - registration can fail for permission/quota reasons and is ignored
   */
  private requestBackgroundSync(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const SYNC_TAG = 'nh-tasks-outbox-sync';
    void navigator.serviceWorker.ready
      .then((registration) => {
        const maybeSync = (registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }).sync;
        if (!maybeSync || typeof maybeSync.register !== 'function') {
          return;
        }
        return maybeSync.register(SYNC_TAG);
      })
      .catch(() => {
        // Graceful fallback: other triggers (online/focus/interval) remain active.
      });
  }

  /**
   * Select queue items currently eligible for replay.
   *
   * We preserve FIFO semantics by sorting by original creation timestamp
   * among entries whose retry window is already due.
   */
  private pickDueOutboxEntries(queue: TaskOutboxEntry[]): TaskOutboxEntry[] {
    const nowMs = Date.now();
    return queue
      .filter((entry) => this.readRetryTimestampMs(entry) <= nowMs)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Select queue entries for the current replay run.
   *
   * - default mode: only due entries (respect retry backoff)
   * - manual mode: all entries (ignore backoff for "Sync now")
   */
  private pickReplayCandidates(queue: TaskOutboxEntry[], ignoreBackoff: boolean): TaskOutboxEntry[] {
    if (ignoreBackoff) {
      return [...queue].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return this.pickDueOutboxEntries(queue);
  }

  /**
   * Parse one entry retry timestamp with safe fallback for legacy data.
   */
  private readRetryTimestampMs(entry: TaskOutboxEntry): number {
    if (!entry.next_retry_at) {
      return 0;
    }

    const parsed = Date.parse(entry.next_retry_at);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return parsed;
  }

  /**
   * Remove all queued mutations for one task id.
   */
  private dropOutboxEntriesForTask(taskId: number): void {
    const queue = this.readOutbox();
    const removed = queue.filter((entry) => entry.task_id === taskId && entry.type === 'attachment_add');
    this.writeOutbox(queue.filter((entry) => entry.task_id !== taskId));

    // Best-effort cleanup of persisted file batches tied to removed operations.
    for (const entry of removed) {
      const payload = entry.payload as AttachmentAddPayload;
      const batchId = String(payload.batch_id ?? '');
      if (batchId) {
        void this.deleteAttachmentBatch(batchId);
      }
    }
  }

  /**
   * Remove queued optimistic comment-add operation when user deletes that
   * unsynced temp comment locally.
   */
  private dropQueuedCommentAdd(taskId: number, tempCommentId: number): void {
    const queue = this.readOutbox();
    this.writeOutbox(queue.filter((entry) => {
      if (entry.type !== 'comment_add' || entry.task_id !== taskId) {
        return true;
      }

      const payload = entry.payload as CommentAddPayload;
      return Number(payload.temp_comment_id ?? 0) !== Number(tempCommentId);
    }));
  }

  /**
   * Re-point queued operations from temp id to real server id.
   */
  private rewriteOutboxTaskId(fromTaskId: number, toTaskId: number): void {
    const queue = this.readOutbox();
    const next = queue.map((entry) => {
      if (entry.task_id !== fromTaskId) {
        return entry;
      }
      return {
        ...entry,
        task_id: toTaskId,
      };
    });
    this.writeOutbox(next);
  }

  /**
   * Read assignee cache for optimistic label resolution.
   */
  private readAssigneeCache(): TaskAssigneeOption[] {
    const raw = localStorage.getItem(TasksService.TASK_ASSIGNEES_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as TaskAssigneeOption[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Persist assignee cache.
   */
  private writeAssigneeCache(items: TaskAssigneeOption[]): void {
    localStorage.setItem(TasksService.TASK_ASSIGNEES_KEY, JSON.stringify(items));
  }

  /**
   * Generate stable queue id.
   */
  private generateOutboxId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Generate negative local task ids to avoid collisions with server ids.
   */
  private generateTempTaskId(): number {
    const randomTail = Math.floor(Math.random() * 10_000);
    return -1 * Number(`${Date.now()}${String(randomTail).padStart(4, '0')}`);
  }

  /**
   * Generate negative local ids for optimistic comments.
   */
  private generateTempCommentId(): number {
    const randomTail = Math.floor(Math.random() * 10_000);
    return -1 * Number(`${Date.now()}${String(randomTail).padStart(4, '0')}`);
  }

  /**
   * Generate unique id for persisted attachment batch payload.
   */
  private generateAttachmentBatchId(): string {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Open attachment queue IndexedDB.
   */
  private async openAttachmentDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    return await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open(TasksService.ATTACHMENT_DB_NAME, TasksService.ATTACHMENT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TasksService.ATTACHMENT_STORE)) {
          db.createObjectStore(TasksService.ATTACHMENT_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Store one queued attachment batch in IndexedDB.
   */
  private async writeAttachmentBatch(batch: QueuedAttachmentBatch): Promise<void> {
    const db = await this.openAttachmentDb();
    if (!db) {
      throw new Error('attachment_store_unavailable');
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TasksService.ATTACHMENT_STORE, 'readwrite');
      const store = tx.objectStore(TasksService.ATTACHMENT_STORE);
      const request = store.put(batch);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }).finally(() => db.close());
  }

  /**
   * Read one queued attachment batch by id.
   */
  private async readAttachmentBatch(batchId: string): Promise<QueuedAttachmentBatch | null> {
    const db = await this.openAttachmentDb();
    if (!db) {
      return null;
    }

    return await new Promise<QueuedAttachmentBatch | null>((resolve) => {
      const tx = db.transaction(TasksService.ATTACHMENT_STORE, 'readonly');
      const store = tx.objectStore(TasksService.ATTACHMENT_STORE);
      const request = store.get(batchId);
      request.onsuccess = () => resolve((request.result as QueuedAttachmentBatch | undefined) ?? null);
      request.onerror = () => resolve(null);
    }).finally(() => db.close());
  }

  /**
   * Delete one queued attachment batch by id.
   */
  private async deleteAttachmentBatch(batchId: string): Promise<void> {
    const db = await this.openAttachmentDb();
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      const tx = db.transaction(TasksService.ATTACHMENT_STORE, 'readwrite');
      const store = tx.objectStore(TasksService.ATTACHMENT_STORE);
      const request = store.delete(batchId);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    }).finally(() => db.close());
  }

  /**
   * Read safe diagnostic message from unknown error input.
   */
  private readErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.message || `http_${error.status}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'unknown_error';
  }

  /**
   * Resolve queued mutation conflict by applying server task snapshot when present.
   */
  private resolveConflictEntry(entry: TaskOutboxEntry, error: unknown): void {
    const serverTask = this.extractConflictTaskFromError(error, entry.task_id);
    if (serverTask) {
      // Keep a soft marker so UI can hint that server version won.
      this.upsertCachedTask({
        ...serverTask,
        is_pending: false,
        sync_error: 'conflict',
      });
      return;
    }

    // Fallback when server payload is unavailable.
    if (entry.type === 'delete') {
      this.removeCachedTask(entry.task_id);
      return;
    }

    this.applyOutboxFailureToCache(entry, 'conflict');
  }

  /**
   * Try extracting canonical server task snapshot from conflict response payload.
   */
  private extractConflictTaskFromError(error: unknown, fallbackTaskId: number): TaskItem | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }

    const payload = error.error as {
      data?: unknown;
      current?: unknown;
      task?: unknown;
    } | null;

    const candidates: unknown[] = [
      payload?.data,
      (payload?.data as { current?: unknown } | null)?.current,
      payload?.current,
      payload?.task,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      const record = candidate as Record<string, unknown>;
      if (typeof record['id'] !== 'number') {
        continue;
      }

      return this.normalizeServerTask(record as unknown as TaskItem);
    }

    // Last fallback: try existing cached task by id.
    return this.findCachedTask(fallbackTaskId);
  }

  /**
   * Mirror outbox replay failures into cached entities for user visibility.
   */
  private applyOutboxFailureToCache(entry: TaskOutboxEntry, message: string): void {
    const task = this.findCachedTask(entry.task_id);
    if (!task) {
      return;
    }

    // Comment-add failure is shown on the specific optimistic comment row.
    if (entry.type === 'comment_add') {
      const payload = entry.payload as CommentAddPayload;
      const tempCommentId = Number(payload.temp_comment_id ?? 0);
      if (tempCommentId < 0) {
        const nextComments = (task.comments ?? []).map((comment) => {
          if (comment.id !== tempCommentId) {
            return comment;
          }
          return {
            ...comment,
            is_pending: false,
            sync_error: message,
          };
        });
        this.upsertCachedTask({
          ...task,
          comments: nextComments,
          is_pending: true,
          sync_error: message,
        });
        return;
      }
    }

    // Fallback: mark task-level sync error.
    this.upsertCachedTask({
      ...task,
      is_pending: true,
      sync_error: message,
    });
  }
}
