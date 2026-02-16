import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService, AuthUser } from './auth.service';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly authService = inject(AuthService);
  private readonly storagePrefix = 'nh_admin_theme';
  private readonly guestStorageKey = `${this.storagePrefix}_guest`;
  private readonly currentSubject = new BehaviorSubject<ThemeMode>('light');
  readonly current$ = this.currentSubject.asObservable();

  constructor() {
    const initial = this.readStoredTheme(this.authService.currentUserValue()) ?? 'light';
    this.currentSubject.next(initial);
    this.applyTheme(initial);

    this.authService.currentUser$.subscribe((user) => {
      const stored = this.readStoredTheme(user) ?? this.readGuestTheme() ?? 'light';
      if (stored !== this.currentSubject.value) {
        this.currentSubject.next(stored);
      }
      this.applyTheme(stored);
    });
  }

  setTheme(theme: ThemeMode): void {
    const user = this.authService.currentUserValue();
    this.persistTheme(theme, user);
    this.currentSubject.next(theme);
    this.applyTheme(theme);
  }

  getTheme(): ThemeMode {
    return this.currentSubject.value;
  }

  private applyTheme(theme: ThemeMode): void {
    const root = this.documentRef.documentElement;
    root.setAttribute('data-theme', theme);
  }

  private readGuestTheme(): ThemeMode | null {
    const raw = localStorage.getItem(this.guestStorageKey);
    return this.isThemeMode(raw) ? raw : null;
  }

  private readStoredTheme(user: AuthUser | null): ThemeMode | null {
    const userKey = this.resolveUserStorageKey(user);
    const raw = localStorage.getItem(userKey);
    if (this.isThemeMode(raw)) {
      return raw;
    }
    return this.readGuestTheme();
  }

  private persistTheme(theme: ThemeMode, user: AuthUser | null): void {
    localStorage.setItem(this.resolveUserStorageKey(user), theme);
    if (!user) {
      localStorage.setItem(this.guestStorageKey, theme);
    }
  }

  private resolveUserStorageKey(user: AuthUser | null): string {
    if (user?.id != null) {
      return `${this.storagePrefix}_user_${user.id}`;
    }
    if (user?.username) {
      return `${this.storagePrefix}_user_${user.username}`;
    }
    return this.guestStorageKey;
  }

  private isThemeMode(value: string | null): value is ThemeMode {
    return value === 'light' || value === 'dark';
  }
}

