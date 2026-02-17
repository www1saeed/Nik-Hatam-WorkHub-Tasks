<?php

namespace App\Services;

use App\Models\User;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

class PushNotificationService
{
    /**
     * Send one push payload to all active subscriptions of a user.
     *
     * The payload follows a simple structure consumed by `public/sw.js`:
     * - title
     * - body
     * - url (opened on notification click)
     */
    public function sendToUser(User $user, array $payload): void
    {
        // Push delivery must never break the primary business flow (task create/update/comment).
        // Any crypto/subscription/provider failure is handled silently here.
        try {
        $publicKey = (string) config('services.webpush.vapid_public_key', '');
        $privateKey = (string) config('services.webpush.vapid_private_key', '');
        $subject = (string) config('services.webpush.vapid_subject', '');

        // Without VAPID keys we skip push silently and keep app functional.
        if ($publicKey === '' || $privateKey === '' || $subject === '') {
            return;
        }

        $subscriptions = $user->pushSubscriptions()->get();
        if ($subscriptions->isEmpty()) {
            return;
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ],
        ]);

        $message = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($message)) {
            return;
        }

        foreach ($subscriptions as $subscription) {
            try {
                $webPush->queueNotification(
                    Subscription::create([
                        'endpoint' => $subscription->endpoint,
                        'publicKey' => $subscription->public_key,
                        'authToken' => $subscription->auth_token,
                        'contentEncoding' => $subscription->content_encoding ?: 'aesgcm',
                    ]),
                    $message
                );
            } catch (Throwable) {
                // Skip malformed subscriptions without interrupting request flow.
                continue;
            }
        }

            foreach ($webPush->flush() as $report) {
                if ($report->isSuccess()) {
                    continue;
                }

                // Cleanup stale/broken subscriptions when push service reports failure.
                // This keeps table size healthy and avoids repeated failures.
                $endpoint = (string) $report->getRequest()->getUri();
                $user->pushSubscriptions()->where('endpoint', $endpoint)->delete();
            }
        } catch (Throwable) {
            // Intentionally ignored to keep API response path stable.
            // In-app database notifications still work even if web push fails.
            return;
        }
    }
}
