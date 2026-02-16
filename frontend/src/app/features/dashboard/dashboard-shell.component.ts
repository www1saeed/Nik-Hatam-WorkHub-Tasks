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

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.scss'
})
export class DashboardShellComponent {
  private readonly authService = inject(AuthService);
  private readonly sidebarService = inject(SidebarService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
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

  readonly menuSections = SIDEBAR_SECTIONS;

  constructor() {
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

  canAccess(user: AuthUser | null, permission: string): boolean {
    if (!user) {
      return false;
    }
    if ((user.roles ?? []).some((role) => role.slug === 'admin')) {
      return true;
    }
    return (user.permissions ?? []).some((perm) => perm.slug === permission);
  }

  isItemVisible(item: { permission?: string }, user: AuthUser | null): boolean {
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
}
