import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { combineLatest, map, shareReplay, startWith } from 'rxjs';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../core/services/auth.service';
import { LanguageService } from '../core/services/language.service';
import { SidebarService } from '../core/services/sidebar.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeMode, ThemeService } from '../core/services/theme.service';
import { UiLocale } from '../core/utils/locale';

interface LanguageOption {
  value: UiLocale;
  label: string;
}

interface ThemeOption {
  value: ThemeMode;
  icon: string;
  labelKey: string;
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
  private readonly themeService = inject(ThemeService);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly languages: LanguageOption[] = [
    { value: 'fa', label: 'فارسی' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' }
  ];
  readonly themes: ThemeOption[] = [
    { value: 'light', icon: 'pi pi-sun', labelKey: 'nav.theme_light' },
    { value: 'dark', icon: 'pi pi-moon', labelKey: 'nav.theme_dark' }
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
  isHandset = false;
  isMenuOpen = false;

  constructor() {
    this.isHandset$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isHandset) => {
        this.isHandset = isHandset;
      });
  }

  toggleSidebar(): void {
    this.sidebarService.toggle();
  }

  setLanguage(value: UiLocale): void {
    this.languageService.setLanguage(value);
    this.isMenuOpen = false;
  }

  setTheme(value: ThemeMode): void {
    this.themeService.setTheme(value);
    this.isMenuOpen = false;
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.isMenuOpen = false;
    void this.router.navigateByUrl('/');
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  navigateTo(url: string): void {
    this.closeMenu();
    void this.router.navigateByUrl(url);
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
}

