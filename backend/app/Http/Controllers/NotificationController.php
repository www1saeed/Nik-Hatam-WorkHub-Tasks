<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

class NotificationController extends Controller
{
    /**
     * Return notifications for current user, newest first.
     *
     * Response includes:
     * - notification list
     * - unread counter for badge rendering
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $limit = (int) ($validated['limit'] ?? 20);

        $notifications = $user->notifications()
            ->latest()
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $notifications->map(fn (DatabaseNotification $notification) => $this->mapNotification($notification))->values(),
            'meta' => [
                'unread_count' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /**
     * Return unread notifications counter for lightweight polling.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        return response()->json([
            'data' => [
                'unread_count' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /**
     * Mark one notification as read.
     */
    public function markRead(Request $request, string $notification): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        /** @var DatabaseNotification|null $record */
        $record = $user->notifications()->where('id', $notification)->first();
        if (! $record) {
            abort(404);
        }

        if ($record->read_at === null) {
            $record->markAsRead();
        }

        return response()->json([
            'data' => $this->mapNotification($record->fresh()),
            'meta' => [
                'unread_count' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /**
     * Mark all user notifications as read.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $user->unreadNotifications->markAsRead();

        return response()->json([
            'data' => [
                'updated' => true,
            ],
            'meta' => [
                'unread_count' => 0,
            ],
        ]);
    }

    /**
     * Map Laravel notification model into frontend payload contract.
     *
     * @return array<string, mixed>
     */
    private function mapNotification(?DatabaseNotification $notification): array
    {
        if (! $notification) {
            return [];
        }

        $data = is_array($notification->data) ? $notification->data : [];
        return [
            'id' => $notification->id,
            'event' => (string) ($data['event'] ?? ''),
            'task_id' => isset($data['task_id']) ? (int) $data['task_id'] : null,
            'task_title' => (string) ($data['task_title'] ?? ''),
            'actor' => is_array($data['actor'] ?? null) ? $data['actor'] : null,
            'comment_excerpt' => isset($data['comment_excerpt']) ? (string) $data['comment_excerpt'] : null,
            'is_read' => $notification->read_at !== null,
            'read_at' => $this->toIsoOrNull($notification->read_at),
            'created_at' => $this->toIsoOrNull($notification->created_at),
        ];
    }

    private function toIsoOrNull(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return CarbonImmutable::parse($value)->toISOString();
    }
}

