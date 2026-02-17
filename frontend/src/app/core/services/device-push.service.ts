import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { ServiceWorkerBootstrapService } from './service-worker-bootstrap.service';

interface PublicKeyResponse {
  data?: {
    public_key?: string;
  };
}

interface PushSubscriptionJson {
  endpoint: string;
  expirationTime: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

/**
 * Browser push subscription manager.
 *
 * Responsibilities:
 * - register service worker (`/sw.js`)
 * - ask user permission when needed
 * - subscribe/unsubscribe PushManager
 * - sync subscription endpoint + keys with backend
 */
@Injectable({ providedIn: 'root' })
export class DevicePushService {
  private readonly http = inject(HttpClient);
  private readonly serviceWorkerBootstrap = inject(ServiceWorkerBootstrapService);

  /**
   * Runtime capability check for current browser.
   */
  isSupported(): boolean {
    return typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window;
  }

  /**
   * Return current browser permission state.
   */
  permission(): NotificationPermission {
    if (!this.isSupported()) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Check whether current device already has an active push subscription.
   */
  async isEnabled(): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      return false;
    }

    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  }

  /**
   * Enable push notifications for current device.
   *
   * Flow:
   * 1) request permission
   * 2) ensure service worker exists
   * 3) fetch VAPID public key from backend
   * 4) subscribe in PushManager
   * 5) persist subscription on backend
   */
  async enable(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('push_not_supported');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('push_permission_denied');
    }

    const registration = await this.ensureWorkerRegistration();
    if (!registration) {
      throw new Error('push_service_worker_missing');
    }

    const vapidPublicKey = await this.fetchPublicKey();
    if (!vapidPublicKey) {
      throw new Error('push_public_key_missing');
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.base64UrlToArrayBuffer(vapidPublicKey),
    });

    await this.syncSubscriptionToBackend(subscription);
  }

  /**
   * Return a ready service-worker registration used for push operations.
   *
   * This delegates to the shared bootstrap service to keep registration
   * behavior consistent across task offline sync and push notification flows.
   */
  private async ensureWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    return await this.serviceWorkerBootstrap.ensureRegistered();
  }

  /**
   * Disable push notifications for current device.
   *
   * Notes:
   * - We first notify backend for endpoint removal.
   * - Then we unsubscribe on browser side.
   */
  async disable(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint;
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/push-subscriptions`, {
        body: { endpoint },
      })
    );

    await subscription.unsubscribe();
  }

  /**
   * Retrieve VAPID public key from backend.
   */
  private async fetchPublicKey(): Promise<string> {
    const response = await firstValueFrom(
      this.http.get<PublicKeyResponse>(`${API_BASE_URL}/push-subscriptions/public-key`)
    );
    return String(response.data?.public_key ?? '');
  }

  /**
   * Send browser subscription payload to backend.
   */
  private async syncSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON() as PushSubscriptionJson;
    const endpoint = String(json.endpoint ?? '');
    const p256dh = String(json.keys?.p256dh ?? '');
    const auth = String(json.keys?.auth ?? '');
    if (!endpoint || !p256dh || !auth) {
      throw new Error('push_subscription_invalid');
    }

    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/push-subscriptions`, {
        endpoint,
        keys: {
          p256dh,
          auth,
        },
        content_encoding: 'aesgcm',
      })
    );
  }

  /**
   * Convert VAPID key from base64url to Uint8Array as required by Push API.
   */
  private base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
  }
}
