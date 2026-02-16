import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, firstValueFrom, of } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { ApiLocale, UiLocale, normalizeApiLocale } from '../utils/locale';

export interface LoginResponse {
  token: string;
  token_type?: string;
  user?: AuthUser;
}

export interface AuthUser {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  roles?: { id: number; name: string; slug: string }[];
  permissions?: { id: number; name: string; slug: string }[];
}

export interface RegisterPayload {
  locale: UiLocale;
  first_name: string;
  last_name: string;
  email: string;
  username?: string;
  password: string;
}

export interface TelegramAuthPayload {
  id: string;
  auth_date: number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/**
 * AuthService handles login, logout, and token persistence.
 * Stores token + user summary in localStorage for refresh-safe session state.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenKey = 'nh_admin_token';
  private readonly userKey = 'nh_admin_user';
  private readonly authenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(this.readUser());

  readonly isAuthenticated$ = this.authenticatedSubject.asObservable();
  readonly currentUser$ = this.userSubject.asObservable();

  // Login with username/email + password and persist token.
  async login(login: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, {
        login,
        password,
        device_name: 'nh-admin-ui'
      })
    );
    this.storeSession(response);
  }

  // Refresh user profile for header/avatar rendering.
  refreshUser(): Promise<AuthUser | null> {
    return firstValueFrom(
      this.http.get<{ data: AuthUser }>(`${API_BASE_URL}/auth/me`).pipe(
        catchError(() => of(null))
      )
    ).then((response) => {
      if (response?.data) {
        this.storeUser(response.data);
        return response.data;
      }
      return null;
    });
  }

  currentUserValue(): AuthUser | null {
    return this.userSubject.value;
  }

  hasPermission(permission: string): boolean {
    const user = this.userSubject.value;
    if (!user) {
      return false;
    }
    const roles = user.roles ?? [];
    if (roles.some((role) => role.slug === 'admin')) {
      return true;
    }
    const permissions = user.permissions ?? [];
    return permissions.some((perm) => perm.slug === permission);
  }

  // Register a new user with required locale + identity fields.
  register(payload: RegisterPayload): Promise<void> {
    const apiLocale = normalizeApiLocale(payload.locale);
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/register`, { ...payload, locale: apiLocale })
    );
  }

  // Telegram login/register.
  telegramLogin(payload: TelegramAuthPayload): Promise<LoginResponse> {
    return firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/auth/telegram`, payload)
    );
  }

  getTelegramConfig(): Promise<{ bot_username: string | null }> {
    return firstValueFrom(
      this.http.get<{ bot_username: string | null }>(`${API_BASE_URL}/auth/telegram/config`)
    );
  }

  // Complete social profile.
  completeSocialProfile(payload: {
    completion_token: string;
    locale: UiLocale;
    first_name?: string;
    last_name?: string;
    email?: string;
    username: string;
  }): Promise<void> {
    const apiLocale: ApiLocale = normalizeApiLocale(payload.locale);
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/social/complete`, { ...payload, locale: apiLocale })
    );
  }

  linkSocialAccount(payload: {
    completion_token: string;
    locale: UiLocale;
    merge_login: string;
    merge_password: string;
  }): Promise<void> {
    const apiLocale: ApiLocale = normalizeApiLocale(payload.locale);
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/social/link`, { ...payload, locale: apiLocale })
    );
  }

  // Store auth response from social login.
  applyLoginResponse(response: LoginResponse): void {
    this.storeSession(response);
  }

  // Verify email with activation code.
  verifyEmail(email: string, code: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/verify-email`, { email, code })
    );
  }

  // Resend email verification code.
  resendVerification(email: string, locale: UiLocale): Promise<void> {
    const apiLocale = normalizeApiLocale(locale);
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/resend-verification`, { email, locale: apiLocale })
    );
  }

  // Request password reset email.
  requestPasswordReset(login: string, locale: UiLocale): Promise<void> {
    const apiLocale = normalizeApiLocale(locale);
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/password/request`, { login, locale: apiLocale })
    );
  }

  // Reset password using token.
  resetPassword(login: string, token: string, password: string, passwordConfirmation: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/password/reset`, {
        login,
        token,
        password,
        password_confirmation: passwordConfirmation
      })
    );
  }

  // Logout by revoking the token and clearing local storage.
  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${API_BASE_URL}/auth/logout`, {}).pipe(catchError(() => of(null)))
    );
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.authenticatedSubject.next(false);
    this.userSubject.next(null);
  }

  // Read stored token for API requests.
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  // Local token presence check.
  private hasToken(): boolean {
    return Boolean(localStorage.getItem(this.tokenKey));
  }

  // Load cached user summary for quick header render.
  private readUser(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  // Persist user summary to localStorage + BehaviorSubject.
  private storeUser(user: AuthUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.userSubject.next(user);
  }

  // Persist token + user.
  private storeSession(response: LoginResponse): void {
    if (!response?.token) {
      return;
    }
    localStorage.setItem(this.tokenKey, response.token);
    this.authenticatedSubject.next(true);
    if (response.user) {
      this.storeUser(response.user);
    }
  }
}
