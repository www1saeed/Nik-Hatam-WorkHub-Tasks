import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { UiLocale, normalizeApiLocale } from '../utils/locale';

/**
 * Minimal role shape needed for the admin users table.
 * Keep this local to avoid coupling the UI to full role payloads.
 */
export interface AdminRole {
  id: number;
  name: string;
  slug: string;
}

/**
 * Admin list item for users.
 * Designed to power table rows and modal forms without extra round trips.
 */
export interface AdminUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  email_verified_at?: string | null;
  roles: AdminRole[];
  social_providers?: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  /**
   * List users for the admin table (includes roles + social provider info).
   */
  async list(): Promise<AdminUser[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: AdminUser[] }>(`${API_BASE_URL}/users`)
    );
    return response.data ?? [];
  }

  /**
   * Create a new user (admin flow).
   * Backend may send a credentials email if email is provided.
   */
  async create(payload: {
    username?: string;
    first_name: string;
    last_name: string;
    email?: string;
    password: string;
    role_ids?: number[];
    locale?: UiLocale;
  }): Promise<AdminUser> {
    const apiPayload = payload.locale
      ? { ...payload, locale: normalizeApiLocale(payload.locale) }
      : payload;
    const response = await firstValueFrom(
      this.http.post<{ data: AdminUser }>(`${API_BASE_URL}/users`, apiPayload)
    );
    return response.data;
  }

  /**
   * Update a user (admin flow).
   * Password is optional and only applied when provided.
   */
  async update(id: number, payload: {
    username: string;
    first_name: string;
    last_name: string;
    email?: string;
    password?: string;
    role_ids?: number[];
  }): Promise<AdminUser> {
    const response = await firstValueFrom(
      this.http.put<{ data: AdminUser }>(`${API_BASE_URL}/users/${id}`, payload)
    );
    return response.data;
  }

  /**
   * Delete a user.
   */
  async remove(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/users/${id}`)
    );
  }

  /**
   * Trigger a reset email for the selected user.
   */
  async sendPasswordReset(id: number, locale: UiLocale): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/users/${id}/password/reset`, { locale: normalizeApiLocale(locale) })
    );
  }

  /**
   * Create a one-time reset link (used for QR code display).
   */
  async createPasswordResetLink(id: number): Promise<{ url: string; token: string }> {
    const response = await firstValueFrom(
      this.http.post<{ data: { url: string; token: string } }>(`${API_BASE_URL}/users/${id}/password/reset-link`, {})
    );
    return response.data;
  }
}
