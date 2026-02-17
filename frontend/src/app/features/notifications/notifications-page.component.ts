import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AppNotificationItem, NotificationsService } from '../../core/services/notifications.service';
import { LanguageService } from '../../core/services/language.service';
import { TaskDateTimeUtils } from '../../core/utils/task-datetime.util';
import { parseHttpError } from '../../core/utils/error-mapper';
import { DevicePushService } from '../../core/services/device-push.service';
import { DateUtils } from '../../core/utils/date-utils';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss'
})
export class NotificationsPageComponent {
  private readonly notificationsService = inject(NotificationsService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly devicePushService = inject(DevicePushService);
  private readonly transloco = inject(TranslocoService);

  notifications: AppNotificationItem[] = [];
  isLoading = true;
  isMarkingAll = false;
  isPushBusy = false;
  isPushSupported = false;
  isPushEnabled = false;
  pushPermission: NotificationPermission | 'unsupported' = 'unsupported';
  errorMessage = '';

  constructor() {
    // Instant-first-render path:
    // use already fetched notifications from in-memory cache (e.g. loaded by
    // header menu) so user sees content immediately without waiting for HTTP.
    const cached = this.notificationsService.getCachedNotifications();
    if (cached.length > 0) {
      this.notifications = cached;
      this.isLoading = false;
    }

    // Always refresh from backend so cache stays accurate.
    void this.loadNotifications(cached.length > 0);
    void this.refreshPushState();

    // Keep page relatively fresh while user remains on this view.
    interval(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadNotifications(true);
      });
  }

  /**
   * Render helper: current unread amount in page context.
   */
  get unreadCount(): number {
    return this.notifications.filter((item) => !item.is_read).length;
  }

  /**
   * Render unread count with Persian digits when UI language is FA.
   */
  unreadCountLabel(): string {
    const label = String(this.unreadCount);
    return this.languageService.getLanguage() === 'fa'
      ? DateUtils.toPersianDigits(label)
      : label;
  }

  /**
   * Mark all notifications as read.
   */
  async markAllRead(): Promise<void> {
    if (this.isMarkingAll || this.unreadCount === 0) {
      return;
    }

    this.isMarkingAll = true;
    this.errorMessage = '';
    try {
      await this.notificationsService.markAllRead();
      this.notifications = this.notifications.map((item) => ({ ...item, is_read: true }));
      this.cdr.detectChanges();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.save_failed';
      this.cdr.detectChanges();
    } finally {
      this.isMarkingAll = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Enable device notifications for this browser.
   */
  async enableDevicePush(): Promise<void> {
    if (!this.isPushSupported || this.isPushBusy) {
      return;
    }

    this.isPushBusy = true;
    this.errorMessage = '';
    try {
      await this.devicePushService.enable();
      await this.refreshPushState();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.notifications.push_enable_failed';
      this.cdr.detectChanges();
    } finally {
      this.isPushBusy = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Disable push notifications for current device.
   */
  async disableDevicePush(): Promise<void> {
    if (!this.isPushSupported || this.isPushBusy) {
      return;
    }

    this.isPushBusy = true;
    this.errorMessage = '';
    try {
      await this.devicePushService.disable();
      await this.refreshPushState();
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.notifications.push_disable_failed';
      this.cdr.detectChanges();
    } finally {
      this.isPushBusy = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Open the task context referenced by the notification.
   */
  async openTask(item: AppNotificationItem): Promise<void> {
    // Opportunistically mark as read before navigation.
    if (!item.is_read) {
      await this.markSingleRead(item);
    }

    // Deep-link directly into task detail when backend provides a task id.
    // The task capture page consumes `open_task` and opens the matching detail modal.
    if (item.task_id != null) {
      await this.router.navigate(['/dashboard/tasks/new'], {
        queryParams: { open_task: item.task_id },
      });
      return;
    }

    // Fallback for non-task notifications or legacy payloads without task_id.
    await this.router.navigateByUrl('/dashboard/tasks/new');
  }

  /**
   * Mark one notification as read from inline action.
   */
  async markSingleRead(item: AppNotificationItem): Promise<void> {
    if (item.is_read) {
      return;
    }

    try {
      await this.notificationsService.markRead(item.id);
      this.notifications = this.notifications.map((entry) =>
        entry.id === item.id ? { ...entry, is_read: true } : entry
      );
      this.cdr.detectChanges();
    } catch {
      // Keep silent to avoid noisy UX when a single read action fails.
    }
  }

  /**
   * Translate event metadata into localized display text.
   */
  messageFor(item: AppNotificationItem): string {
    const lang = this.languageService.getLanguage();
    const actor = item.actor?.name?.trim()
      || item.actor?.username
      || this.transloco.translate('admin.notifications.defaults.user', {}, lang);

    if (item.event === 'task_assigned') {
      return this.transloco.translate('admin.notifications.events.task_assigned', {
        actor,
        task_title: item.task_title,
      }, lang);
    }

    if (item.event === 'task_comment') {
      return this.transloco.translate('admin.notifications.events.task_comment', {
        actor,
        task_title: item.task_title,
      }, lang);
    }

    return item.task_title || this.transloco.translate('admin.notifications.events.unknown', {}, lang);
  }

  /**
   * Optional small secondary line (e.g. comment excerpt).
   */
  excerptFor(item: AppNotificationItem): string {
    if (item.event !== 'task_comment' || !item.comment_excerpt) {
      return '';
    }
    return item.comment_excerpt;
  }

  /**
   * Format notification timestamp in configured task timezone style.
   */
  formatTimestamp(iso: string | null): string {
    if (!iso) {
      return '-';
    }
    return TaskDateTimeUtils.formatDateTime(iso, this.languageService.getLanguage());
  }

  /**
   * Load notifications and refresh local list state.
   */
  private async loadNotifications(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    }

    try {
      this.notifications = await this.notificationsService.list(100);
    } catch (error) {
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'admin.errors.load_failed';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Refresh local browser push capability/status flags.
   */
  private async refreshPushState(): Promise<void> {
    this.isPushSupported = this.devicePushService.isSupported();
    if (!this.isPushSupported) {
      this.pushPermission = 'unsupported';
      this.isPushEnabled = false;
      this.cdr.detectChanges();
      return;
    }

    this.pushPermission = this.devicePushService.permission();
    this.isPushEnabled = await this.devicePushService.isEnabled();
    this.cdr.detectChanges();
  }
}
