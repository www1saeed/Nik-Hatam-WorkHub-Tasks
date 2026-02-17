import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

export interface AppNotificationActor {
  id: number;
  name: string;
  username: string;
}

export interface AppNotificationItem {
  id: string;
  event: 'task_assigned' | 'task_comment' | string;
  task_id: number | null;
  task_title: string;
  actor: AppNotificationActor | null;
  comment_excerpt: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string | null;
}

interface NotificationsListResponse {
  data: AppNotificationItem[];
  meta?: {
    unread_count?: number;
  };
}

interface NotificationsCountResponse {
  data?: {
    unread_count?: number;
  };
}

/**
 * Central notification API adapter + reactive unread badge state.
 *
 * Components consume `unreadCount$` to render badges without manually sharing
 * state through inputs.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly unreadCountSubject = new BehaviorSubject<number>(0);
  private readonly notificationsCacheSubject = new BehaviorSubject<AppNotificationItem[]>([]);

  readonly unreadCount$ = this.unreadCountSubject.asObservable();
  readonly notifications$ = this.notificationsCacheSubject.asObservable();

  /**
   * Return latest notifications and sync unread badge from response metadata.
   */
  async list(limit = 20): Promise<AppNotificationItem[]> {
    const response = await firstValueFrom(
      this.http.get<NotificationsListResponse>(`${API_BASE_URL}/notifications`, {
        params: { limit: String(limit) },
      })
    );

    const unread = Number(response.meta?.unread_count ?? 0);
    this.unreadCountSubject.next(Number.isFinite(unread) ? unread : 0);
    const items = response.data ?? [];
    // Keep an in-memory cache so pages/menus can render instantly on revisit
    // and only then refresh from backend in the background.
    this.notificationsCacheSubject.next(items);
    return items;
  }

  /**
   * Lightweight counter refresh for periodic polling.
   */
  async refreshUnreadCount(): Promise<number> {
    const response = await firstValueFrom(
      this.http.get<NotificationsCountResponse>(`${API_BASE_URL}/notifications/unread-count`)
    );

    const unread = Number(response.data?.unread_count ?? 0);
    const normalized = Number.isFinite(unread) ? unread : 0;
    this.unreadCountSubject.next(normalized);
    return normalized;
  }

  /**
   * Mark one notification as read and synchronize unread badge.
   */
  async markRead(notificationId: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<NotificationsListResponse>(`${API_BASE_URL}/notifications/${notificationId}/read`, {})
    );

    const unread = Number(response.meta?.unread_count ?? 0);
    this.unreadCountSubject.next(Number.isFinite(unread) ? unread : 0);
    this.notificationsCacheSubject.next(
      this.notificationsCacheSubject.value.map((item) =>
        item.id === notificationId ? { ...item, is_read: true } : item
      )
    );
  }

  /**
   * Mark all notifications as read and zero unread badge.
   */
  async markAllRead(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/notifications/read-all`, {})
    );
    this.unreadCountSubject.next(0);
    this.notificationsCacheSubject.next(
      this.notificationsCacheSubject.value.map((item) => ({ ...item, is_read: true }))
    );
  }

  /**
   * Synchronous snapshot for instant first paint in notification-related views.
   */
  getCachedNotifications(): AppNotificationItem[] {
    return this.notificationsCacheSubject.value;
  }
}
