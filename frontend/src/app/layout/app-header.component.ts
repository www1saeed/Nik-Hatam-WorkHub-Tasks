import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { combineLatest, interval, map, shareReplay, startWith } from 'rxjs';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../core/services/auth.service';
import { LanguageService } from '../core/services/language.service';
import { SidebarService } from '../core/services/sidebar.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppNotificationItem, NotificationsService } from '../core/services/notifications.service';
import { TaskDateTimeUtils } from '../core/utils/task-datetime.util';
import { DateUtils } from '../core/utils/date-utils';
import { ThemeMode, ThemeService } from '../core/services/theme.service';

interface LanguageOption {
  value: 'fa' | 'en' | 'de';
  label: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, RouterLink, TranslocoPipe],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss'
})
export class AppHeaderComponent {
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly sidebarService = inject(SidebarService);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly notificationsService = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);
  private readonly themeService = inject(ThemeService);

  readonly languages: LanguageOption[] = [
    { value: 'fa', label: 'فارسی' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' }
  ];

  readonly currentLang$ = this.languageService.current$;
  readonly currentTheme$ = this.themeService.current$;
  readonly isAuthenticated$ = this.authService.isAuthenticated$;
  readonly currentUser$ = this.authService.currentUser$;
  readonly userInitials$ = this.currentUser$.pipe(
    map((user) => this.getInitials(user))
  );
  readonly isHandset$ = this.breakpoint.observe('(max-width: 960px)').pipe(
    map((state) => state.matches),
    shareReplay(1)
  );
  readonly isDashboard$ = this.router.events.pipe(
    map((event) => (event instanceof NavigationEnd ? event.urlAfterRedirects : this.router.url)),
    startWith(this.router.url),
    map((url) => url.startsWith('/dashboard')),
    shareReplay(1)
  );
  readonly showSidebarToggle$ = combineLatest([this.isHandset$, this.isDashboard$]).pipe(
    map(([isHandset, isDashboard]) => isHandset && isDashboard),
    shareReplay(1)
  );
  readonly unreadNotifications$ = this.notificationsService.unreadCount$;
  isHandset = false;
  isMenuOpen = false;
  headerNotifications: AppNotificationItem[] = [];
  isLoadingNotifications = false;

  constructor() {
    this.isHandset$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isHandset) => {
        this.isHandset = isHandset;
      });

    // When user becomes authenticated, bootstrap notification badge/list and
    // keep unread counter in sync with lightweight polling.
    this.isAuthenticated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthenticated) => {
        if (!isAuthenticated) {
          this.headerNotifications = [];
          return;
        }
        void this.refreshNotifications();
      });

    interval(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.authService.currentUserValue()) {
          void this.refreshUnreadCountOnly();
        }
      });
  }

  toggleSidebar(): void {
    this.sidebarService.toggle();
  }

  setLanguage(value: 'fa' | 'en' | 'de'): void {
    this.languageService.setLanguage(value);
    this.isMenuOpen = false;
  }

  setTheme(theme: ThemeMode): void {
    this.themeService.setTheme(theme);
    this.isMenuOpen = false;
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.isMenuOpen = false;
    void this.router.navigateByUrl('/');
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen && this.authService.currentUserValue()) {
      void this.refreshNotifications();
    }
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  navigateTo(url: string): void {
    this.closeMenu();
    void this.router.navigateByUrl(url);
  }

  /**
   * Human-friendly unread badge label (caps at 99+).
   */
  unreadBadgeLabel(count: number | null | undefined): string {
    const safe = Number(count ?? 0);
    if (safe <= 0) {
      return '';
    }
    const label = safe > 99 ? '99+' : String(safe);
    return this.languageService.getLanguage() === 'fa'
      ? DateUtils.toPersianDigits(label)
      : label;
  }

  /**
   * Mark header-list item as read and open linked task detail when possible.
   */
  async openNotification(item: AppNotificationItem): Promise<void> {
    if (!item.is_read) {
      await this.notificationsService.markRead(item.id);
      this.headerNotifications = this.headerNotifications.map((entry) =>
        entry.id === item.id ? { ...entry, is_read: true } : entry
      );
    }
    this.closeMenu();

    // Notifications that carry task context should open the task detail directly.
    // The target page reads `open_task` from query params and opens the modal.
    if (item.task_id != null) {
      await this.router.navigate(['/dashboard/tasks/new'], {
        queryParams: { open_task: item.task_id },
      });
      return;
    }

    // Fallback for notification types without task linkage.
    await this.router.navigateByUrl('/dashboard/notifications');
  }

  /**
   * Compose localized, short notification message for compact header dropdown.
   */
  notificationMessage(item: AppNotificationItem, currentLang: string | null): string {
    const lang = currentLang === 'fa' ? 'fa' : 'en';
    const actor = item.actor?.name?.trim()
      || item.actor?.username
      || this.transloco.translate('admin.notifications.defaults.user', {}, lang);
    if (item.event === 'task_assigned') {
      return this.transloco.translate('admin.notifications.events.task_assigned_short', {
        actor,
        task_title: item.task_title,
      }, lang);
    }

    if (item.event === 'task_comment') {
      return this.transloco.translate('admin.notifications.events.task_comment_short', {
        actor,
        task_title: item.task_title,
      }, lang);
    }

    return item.task_title || this.transloco.translate('admin.notifications.events.unknown', {}, lang);
  }

  /**
   * Format compact timestamp in hotel timezone style.
   */
  notificationTime(item: AppNotificationItem, currentLang: string | null): string {
    const iso = item.created_at;
    if (!iso) {
      return '';
    }
    const lang = currentLang === 'fa' ? 'fa' : 'en';
    return TaskDateTimeUtils.formatDateTime(iso, lang);
  }

  /**
   * Header dropdown should only show unread notifications.
   */
  unreadHeaderNotifications(): AppNotificationItem[] {
    return this.headerNotifications.filter((item) => !item.is_read);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.app-header__menu')) {
      return;
    }
    this.isMenuOpen = false;
  }

  private getInitials(user: { first_name?: string; last_name?: string } | null): string {
    if (!user) {
      return 'NH';
    }
    const first = (user.first_name ?? '').trim();
    const last = (user.last_name ?? '').trim();
    const firstInitial = first ? first[0] : '';
    const lastInitial = last ? last[0] : '';
    const initials = `${firstInitial}${lastInitial}`.trim();
    return initials || 'NH';
  }

  /**
   * Load recent notification list and keep unread counter synchronized.
   */
  private async refreshNotifications(): Promise<void> {
    this.isLoadingNotifications = true;
    try {
      this.headerNotifications = await this.notificationsService.list(6);
    } catch {
      this.headerNotifications = [];
    } finally {
      this.isLoadingNotifications = false;
    }
  }

  /**
   * Poll unread count without reloading the whole list.
   */
  private async refreshUnreadCountOnly(): Promise<void> {
    try {
      await this.notificationsService.refreshUnreadCount();
    } catch {
      // Ignore background refresh failures to avoid UI noise.
    }
  }
}

