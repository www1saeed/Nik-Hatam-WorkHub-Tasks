<?php

namespace App\Http\Resources;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Task
 */
class TaskResource extends JsonResource
{
    /**
     * Transform task model into API payload expected by the frontend workspace.
     *
     * The payload includes:
     * - core task fields
     * - creator and assigned user summaries
     * - optional comment feed (when relation is eager-loaded)
     * - permission flags (can_edit/can_mark_done/can_delete) for action rendering
     */
    public function toArray(Request $request): array
    {
        /** @var User|null $viewer */
        $viewer = $request->user();
        // Users with manage_staffs have global rights in tasks.
        $isManager = $viewer?->canManageStaffTasks() ?? false;
        // Assignment-based access for non-manager users.
        $isAssigned = $viewer
            ? $this->assignedUsers->contains(fn ($user) => $user->id === $viewer->id)
            : false;
        // Creator privileges for own tasks.
        $isCreator = $viewer ? (int) $this->created_by === (int) $viewer->id : false;
        $canEdit = $isManager || $isAssigned || $isCreator;
        // Creator may delete only when there are no real (non-system) comments.
        $hasRealComments = $this->comments->contains(fn ($comment) => ! (bool) $comment->is_system);
        $canDelete = $isManager || ($isCreator && ! $hasRealComments);

        return [
            'id' => $this->id,
            'title' => $this->title,
            'status' => $this->status,
            // Datetimes are stored in DB as UTC and must be emitted as UTC ISO,
            // independent from APP_TIMEZONE used for other app-level formatting.
            'starts_at' => $this->dbUtcToIso($this->getRawOriginal('starts_at')),
            'ends_at' => $this->dbUtcToIso($this->getRawOriginal('ends_at')),
            // Meta timestamps follow server time (APP_TIMEZONE) by requirement.
            'created_at' => $this->dbUtcToServerIso($this->getRawOriginal('created_at')),
            'updated_at' => $this->dbUtcToServerIso($this->getRawOriginal('updated_at')),
            'created_by' => $this->created_by,
            'creator' => $this->creator ? [
                'id' => $this->creator->id,
                'username' => $this->creator->username,
                'first_name' => $this->creator->first_name,
                'last_name' => $this->creator->last_name,
            ] : null,
            'assigned_users' => $this->assignedUsers->map(fn ($user) => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
            ])->values(),
            'comments' => $this->whenLoaded('comments', fn () => $this->comments
                ->filter(fn ($comment) => $isManager || ! (bool) $comment->is_system)
                ->map(fn ($comment) => [
                'id' => $comment->id,
                'comment' => $comment->comment,
                'is_system' => (bool) $comment->is_system,
                'can_delete' => $viewer
                    ? (! (bool) $comment->is_system) && (
                        $isManager || ((int) ($comment->user_id ?? 0) === (int) $viewer->id)
                    )
                    : false,
                'created_at' => $this->dbUtcToIso($comment->getRawOriginal('created_at')),
                'user' => $comment->user ? [
                    'id' => $comment->user->id,
                    'username' => $comment->user->username,
                    'first_name' => $comment->user->first_name,
                    'last_name' => $comment->user->last_name,
                ] : null,
            ])->values()),
            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments
                ->map(fn ($attachment) => (new PhotoResource($attachment))->toArray($request))
                ->values()),
            'can_edit' => $canEdit,
            'can_mark_done' => $canEdit,
            'can_delete' => $canDelete,
        ];
    }

    private function dbUtcToIso(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        // DB datetime values are treated as UTC by contract.
        return CarbonImmutable::parse($raw, 'UTC')->toISOString();
    }

    private function dbUtcToServerIso(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $timezone = (string) config('app.timezone', 'UTC');
        $date = CarbonImmutable::parse($raw, 'UTC')->setTimezone($timezone);

        return $date->toIso8601String();
    }
}
