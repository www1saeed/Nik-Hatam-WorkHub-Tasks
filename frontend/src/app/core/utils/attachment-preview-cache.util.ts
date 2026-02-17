import { TaskAttachment, TasksService } from '../services/tasks.service';

/**
 * Helper utility to resolve protected attachment blobs into in-memory object URLs.
 *
 * Why centralized:
 * - multiple pages (tasks list, scheduler, album) need identical preview behavior
 * - safe cleanup (URL.revokeObjectURL) should be consistent to avoid memory leaks
 */
export class AttachmentPreviewCache {
  private readonly urlsByAttachmentId = new Map<number, string>();

  /**
   * Get existing URL or fetch and cache a new one.
   */
  async resolveUrl(tasksService: TasksService, attachment: TaskAttachment): Promise<string> {
    const existing = this.urlsByAttachmentId.get(attachment.id);
    if (existing) {
      return existing;
    }

    const blob = await tasksService.fetchAttachmentBlob(attachment.id);
    const objectUrl = URL.createObjectURL(blob);
    this.urlsByAttachmentId.set(attachment.id, objectUrl);
    return objectUrl;
  }

  /**
   * Read already-cached URL without triggering a fetch.
   */
  getCachedUrl(attachmentId: number): string | null {
    return this.urlsByAttachmentId.get(attachmentId) ?? null;
  }

  /**
   * Revoke one cached URL.
   */
  revokeOne(attachmentId: number): void {
    const existing = this.urlsByAttachmentId.get(attachmentId);
    if (!existing) {
      return;
    }
    URL.revokeObjectURL(existing);
    this.urlsByAttachmentId.delete(attachmentId);
  }

  /**
   * Revoke all cached URLs.
   */
  revokeAll(): void {
    this.urlsByAttachmentId.forEach((url) => URL.revokeObjectURL(url));
    this.urlsByAttachmentId.clear();
  }
}
