<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    /**
     * Return VAPID public key for browser push subscription flow.
     */
    public function publicKey(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $publicKey = (string) config('services.webpush.vapid_public_key', '');
        if ($publicKey === '') {
            abort(422, 'VAPID public key is not configured.');
        }

        return response()->json([
            'data' => [
                'public_key' => $publicKey,
            ],
        ]);
    }

    /**
     * Create or refresh the current device push subscription.
     *
     * Upsert rule:
     * - unique by endpoint
     * - endpoint ownership is reassigned to current user if needed
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $validated = $request->validate([
            'endpoint' => ['required', 'string', 'max:5000'],
            'keys' => ['required', 'array'],
            'keys.p256dh' => ['required', 'string', 'max:5000'],
            'keys.auth' => ['required', 'string', 'max:5000'],
            'content_encoding' => ['nullable', 'string', 'max:64'],
        ]);

        $record = PushSubscription::query()->updateOrCreate(
            ['endpoint' => $validated['endpoint']],
            [
                'user_id' => (int) $user->id,
                'public_key' => (string) $validated['keys']['p256dh'],
                'auth_token' => (string) $validated['keys']['auth'],
                'content_encoding' => $validated['content_encoding'] ?? null,
                'user_agent' => substr((string) $request->userAgent(), 0, 1024),
                'last_seen_at' => CarbonImmutable::now('UTC'),
            ]
        );

        return response()->json([
            'data' => [
                'id' => (int) $record->id,
                'endpoint' => (string) $record->endpoint,
                'updated_at' => CarbonImmutable::parse((string) $record->updated_at)->toISOString(),
            ],
        ], 201);
    }

    /**
     * Remove one device subscription.
     *
     * Client sends endpoint from current PushManager subscription.
     */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $validated = $request->validate([
            'endpoint' => ['required', 'string', 'max:5000'],
        ]);

        PushSubscription::query()
            ->where('user_id', (int) $user->id)
            ->where('endpoint', (string) $validated['endpoint'])
            ->delete();

        return response()->json([
            'data' => [
                'deleted' => true,
            ],
        ]);
    }
}

