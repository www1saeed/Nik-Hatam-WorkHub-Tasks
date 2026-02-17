import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { LanguageService } from '../../core/services/language.service';
import { SIDEBAR_SECTIONS, SidebarSection } from './sidebar-menu.config';
import { map, shareReplay } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BP_LG_PX, BP_MD_PX } from '../../core/config/layout.config';
import { NotificationsService } from '../../core/services/notifications.service';
import { DateUtils } from '../../core/utils/date-utils';

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.scss'
})
export class DashboardShellComponent {
  /**
   * Local storage key for persisted sidebar-group collapse states.
   * Value shape: `{ [groupKey: string]: boolean }` where `true` means collapsed.
   */
  private static readonly GROUP_COLLAPSE_STORAGE_KEY = 'dashboard.shell.group-collapsed.v1';

  private readonly authService = inject(AuthService);
  private readonly sidebarService = inject(SidebarService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsService = inject(NotificationsService);
  readonly currentUser$ = this.authService.currentUser$;
  readonly currentLang$ = this.languageService.current$;
  readonly isHandset$ = this.breakpoint.observe(`(max-width: ${BP_MD_PX}px)`).pipe(
    map((state) => state.matches),
    shareReplay(1)
  );
  readonly isCompactDesktop$ = this.breakpoint.observe(
    `(min-width: ${BP_MD_PX + 1}px) and (max-width: ${BP_LG_PX}px)`
  ).pipe(
    map((state) => state.matches),
    shareReplay(1)
  );
  isHandset = false;
  isCollapsed = false;
  isSidebarOpen = false;
  /**
   * Per-group collapse memory.
   * Example keys: `general`, `workdesk`, `account`.
   */
  private groupCollapseState: Record<string, boolean> = {};

  readonly menuSections = SIDEBAR_SECTIONS;
  readonly unreadNotifications$ = this.notificationsService.unreadCount$;

  constructor() {
    // Restore persisted group states once during shell bootstrap.
    this.groupCollapseState = this.readGroupCollapseState();

    this.isHandset$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isHandset) => {
        this.isHandset = isHandset;
        if (!isHandset) {
          this.isSidebarOpen = false;
        } else {
          this.isCollapsed = false;
        }
      });

    this.isCompactDesktop$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isCompactDesktop) => {
        // Force expanded sidebar on compact desktop widths (<= 1200px).
        this.isCollapsed = isCompactDesktop;
      });

    this.sidebarService.toggle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isHandset) {
          this.toggleSidebar();
        }
      });

    // Keep sidebar badge synchronized with current unread counter.
    // Header performs periodic refresh, while this shell just subscribes to state.
    void this.notificationsService.refreshUnreadCount().catch(() => {
      // Ignore initial unread refresh failures (offline/test backend unavailable).
    });
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.closeSidebar();
    void this.router.navigateByUrl('/');
  }

  toggleCollapse(): void {
    if (this.isHandset) {
      return;
    }
    this.isCollapsed = !this.isCollapsed;
  }

  /**
   * Toggle a single sidebar group and persist its new state.
   */
  toggleGroup(groupKey: string): void {
    if (!groupKey) {
      return;
    }

    const current = this.isGroupCollapsed(groupKey);
    this.groupCollapseState = {
      ...this.groupCollapseState,
      [groupKey]: !current,
    };
    this.persistGroupCollapseState();
  }

  /**
   * Return whether a sidebar group is currently collapsed.
   */
  isGroupCollapsed(groupKey: string): boolean {
    return this.groupCollapseState[groupKey] === true;
  }

  canAccess(user: AuthUser | null, permission: string): boolean {
    if (!user) {
      return false;
    }
    if ((user.roles ?? []).some((role) => role.slug === 'admin')) {
      return true;
    }
    return (user.permissions ?? []).some((perm) => perm.slug === permission);
  }

  hasAnyPermission(user: AuthUser | null, permissions: string[]): boolean {
    if (!user) {
      return false;
    }
    if ((user.roles ?? []).some((role) => role.slug === 'admin')) {
      return true;
    }
    const current = new Set((user.permissions ?? []).map((perm) => perm.slug));
    return permissions.some((permission) => current.has(permission));
  }

  isItemVisible(item: { permission?: string; permissionsAny?: string[] }, user: AuthUser | null): boolean {
    if (item.permissionsAny && item.permissionsAny.length > 0) {
      return this.hasAnyPermission(user, item.permissionsAny);
    }

    if (!item.permission) {
      return true;
    }
    return this.canAccess(user, item.permission);
  }

  getVisibleSections(user: AuthUser | null): SidebarSection[] {
    return this.menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => this.isItemVisible(item, user))
      }))
      .filter((section) => section.items.length > 0);
  }

  /**
   * Compact unread badge label for sidebar account entry.
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
   * Safely load persisted group collapse states from local storage.
   */
  private readGroupCollapseState(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(DashboardShellComponent.GROUP_COLLAPSE_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      const normalized: Record<string, boolean> = {};
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        normalized[key] = value === true;
      });
      return normalized;
    } catch {
      // Invalid JSON or unavailable storage should not break sidebar rendering.
      return {};
    }
  }

  /**
   * Persist current group collapse states to local storage.
   */
  private persistGroupCollapseState(): void {
    try {
      localStorage.setItem(
        DashboardShellComponent.GROUP_COLLAPSE_STORAGE_KEY,
        JSON.stringify(this.groupCollapseState)
      );
    } catch {
      // Ignore storage write failures (quota/privacy mode).
    }
  }
}
