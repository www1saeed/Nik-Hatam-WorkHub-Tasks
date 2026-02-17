import { Injectable } from '@angular/core';

/**
 * App-wide service worker bootstrapper.
 *
 * Why this service exists:
 * - Task offline-first sync now listens to service-worker wake messages.
 * - Previously `/sw.js` was registered only when user enabled push.
 * - Without global registration, non-push users would never receive those
 *   wake events and would rely only on interval/online polling.
 *
 * This service registers `/sw.js` once per app runtime in a safe,
 * best-effort way and never throws to UI callers.
 */
@Injectable({ providedIn: 'root' })
export class ServiceWorkerBootstrapService {
  // Single-flight registration promise to avoid duplicate calls when
  // different features trigger startup logic around the same time.
  private registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

  /**
   * Ensure service worker is registered for this origin.
   *
   * Behavior:
   * - no-op on non-browser or unsupported environments
   * - returns existing registration when already active
   * - performs one registration attempt otherwise
   * - swallows errors (offline-first should degrade gracefully)
   */
  async ensureRegistered(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    if (this.registrationPromise) {
      return await this.registrationPromise;
    }

    this.registrationPromise = (async () => {
      try {
        // Reuse existing root registration when present.
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing) {
          return existing;
        }

        // Register the same worker used for push and task wake events.
        const created = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        return created;
      } catch {
        return null;
      }
    })();

    return await this.registrationPromise;
  }
}

