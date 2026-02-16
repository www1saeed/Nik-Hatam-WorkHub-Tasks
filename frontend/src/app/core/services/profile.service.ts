import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { UiLocale, normalizeApiLocale } from '../utils/locale';

export interface ProfileData {
  username?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  social_providers?: string[];
  birth_date?: string | null;
  id_number?: string | null;
  iban?: string | null;
  phone_numbers?: { number: string; type?: string }[];
  addresses?: { address: string; type?: string }[];
  avatar_url?: string | null;
  admin_locale?: string | null;
  email_required?: boolean;
  locale?: UiLocale;
}

export interface ProfileAvailability {
  username_available: boolean;
  email_available: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  // Fetch current profile (Gregorian birth_date from backend).
  async fetchProfile(locale?: UiLocale): Promise<ProfileData> {
    const localeQuery = locale ? `?locale=${normalizeApiLocale(locale)}` : '';
    const response = await firstValueFrom(
      this.http.get<{ data: ProfileData }>(`${API_BASE_URL}/profile${localeQuery}`)
    );
    return response.data;
  }

  async fetchUserProfile(userId: number, locale?: UiLocale): Promise<ProfileData> {
    const localeQuery = locale ? `?locale=${normalizeApiLocale(locale)}` : '';
    const response = await firstValueFrom(
      this.http.get<{ data: ProfileData }>(`${API_BASE_URL}/users/${userId}/profile${localeQuery}`)
    );
    return response.data;
  }

  // Update profile details + optional avatar/password via multipart form.
  async updateProfile(payload: ProfileData, avatarFile?: File | null, passwordChange?: {
    current_password?: string;
    new_password?: string;
    new_password_confirmation?: string;
  }, removeAvatar?: boolean): Promise<ProfileData> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, String(value));
    });

    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (removeAvatar) {
      formData.append('remove_avatar', '1');
    }

    if (passwordChange?.new_password) {
      formData.append('current_password', passwordChange.current_password ?? '');
      formData.append('new_password', passwordChange.new_password);
      formData.append('new_password_confirmation', passwordChange.new_password_confirmation ?? '');
    }

    const response = await firstValueFrom(
      this.http.post<{ data: ProfileData }>(`${API_BASE_URL}/profile`, formData)
    );
    return response.data;
  }

  async updateUserProfile(userId: number, payload: ProfileData, avatarFile?: File | null, removeAvatar?: boolean): Promise<ProfileData> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, String(value));
    });

    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (removeAvatar) {
      formData.append('remove_avatar', '1');
    }

    const response = await firstValueFrom(
      this.http.post<{ data: ProfileData }>(`${API_BASE_URL}/users/${userId}/profile`, formData)
    );
    return response.data;
  }

  async checkAvailability(username?: string, email?: string): Promise<ProfileAvailability> {
    const params = new URLSearchParams();
    if (username) {
      params.set('username', username);
    }
    if (email) {
      params.set('email', email);
    }
    const query = params.toString();
    const response = await firstValueFrom(
      this.http.get<ProfileAvailability>(`${API_BASE_URL}/profile/availability${query ? `?${query}` : ''}`)
    );
    return response;
  }

  async checkUserAvailability(userId: number, username?: string, email?: string): Promise<ProfileAvailability> {
    const params = new URLSearchParams();
    if (username) {
      params.set('username', username);
    }
    if (email) {
      params.set('email', email);
    }
    const query = params.toString();
    const response = await firstValueFrom(
      this.http.get<ProfileAvailability>(`${API_BASE_URL}/users/${userId}/profile/availability${query ? `?${query}` : ''}`)
    );
    return response;
  }
}
