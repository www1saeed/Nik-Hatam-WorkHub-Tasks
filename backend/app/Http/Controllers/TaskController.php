<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\TaskActivityNotification;
use App\Services\PushNotificationService;
use App\Support\TaskAuditFormatter;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class TaskController extends Controller
{
    /**
     * Return task list for the current user.
     *
     * Visibility rules:
     * - Users with `manage_staffs`: see all tasks.
     * - Users with only `manage_tasks`: see tasks they created OR tasks assigned to them.
     *
     * We eager-load related users/comments to avoid N+1 queries in list rendering.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $query = Task::query()
            ->with($this->taskRelations())
            ->orderByDesc('created_at');

        $validated = $request->validate([
            'assigned_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        if (! $user->canManageStaffTasks()) {
            $query->where(function ($inner) use ($user): void {
                $inner->where('created_by', $user->id)
                    ->orWhereHas('assignedUsers', fn ($assigned) => $assigned->where('users.id', $user->id));
            });
        }

        $assignedUserFilterId = isset($validated['assigned_user_id']) ? (int) $validated['assigned_user_id'] : null;
        if ($assignedUserFilterId !== null) {
            if (! $user->canManageStaffTasks()) {
                abort(403, 'Forbidden.');
            }

            // Manager-only staff filter:
            // return only tasks that are assigned to the selected personnel id.
            $query->whereHas('assignedUsers', fn ($assigned) => $assigned->where('users.id', $assignedUserFilterId));
        }

        return response()->json([
            'data' => TaskResource::collection($query->get()),
        ]);
    }

    /**
     * Create a new task and assign one or more users.
     *
     * Important behavior:
     * - Users without `manage_staffs` must include themselves in assigned_user_ids.
     * - Datetimes are normalized to UTC before persistence.
     * - Response includes all relations needed by the UI immediately.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'status' => ['nullable', 'in:open,done'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'assigned_user_ids' => ['required', 'array', 'min:1'],
            'assigned_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $assignedUserIds = $this->normalizeAssignees($validated['assigned_user_ids'], $user);

        $task = Task::query()->create([
            'title' => trim($validated['title']),
            'status' => $validated['status'] ?? 'open',
            'starts_at' => $this->toUtcOrNull($validated['starts_at'] ?? null),
            'ends_at' => $this->resolveEndsAtForStatus(
                status: $validated['status'] ?? 'open',
                requestedEndsAt: $validated['ends_at'] ?? null,
                currentEndsAt: null
            ),
            'created_by' => $user->id,
        ]);
        $task->assignedUsers()->sync($assignedUserIds);
        $task->load($this->taskRelations());

        // Notify assignees (except creator) that a new responsibility was assigned.
        $this->notifyTaskAssignedUsers(
            task: $task,
            actor: $user,
            newlyAssignedUserIds: $assignedUserIds
        );

        return response()->json([
            'data' => new TaskResource($task),
        ], 201);
    }

    /**
     * Show full details for a single task.
     *
     * Includes:
     * - assigned users
     * - creator
     * - comments + comment author
     *
     * Access is guarded by ensureCanView().
     */
    public function show(Request $request, Task $task): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load($this->taskRelations());
        $this->ensureCanView($user, $task);

        return response()->json([
            'data' => new TaskResource($task),
        ]);
    }

    /**
     * Update an existing task.
     *
     * Allowed updates:
     * - title
     * - status
     * - starts_at / ends_at
     * - assigned users
     *
     * Side effect:
     * - When status changes from non-done -> done, a system comment is created.
     * - The system comment text is localized using Accept-Language (fa/en).
     */
    public function update(Request $request, Task $task): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load($this->taskRelations());
        $this->ensureCanEdit($user, $task);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'status' => ['sometimes', 'required', 'in:open,done'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'assigned_user_ids' => ['sometimes', 'required', 'array', 'min:1'],
            'assigned_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        // Capture original values before mutation so we can emit a full audit trail.
        $oldTitle = (string) $task->title;
        $oldStatus = (string) $task->status;
        $oldStartsAt = $this->dbUtcToCarbon($task->getRawOriginal('starts_at'));
        $oldEndsAt = $this->dbUtcToCarbon($task->getRawOriginal('ends_at'));
        $oldAssignedIds = $task->assignedUsers
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->sort()
            ->values()
            ->all();

        if (array_key_exists('title', $validated)) {
            $task->title = trim($validated['title']);
        }
        if (array_key_exists('status', $validated)) {
            $task->status = $validated['status'];
        }
        if (array_key_exists('starts_at', $validated)) {
            $task->starts_at = $this->toUtcOrNull($validated['starts_at']);
        }
        if (array_key_exists('ends_at', $validated)) {
            $task->ends_at = $this->toUtcOrNull($validated['ends_at']);
        }

        // Auto-fill end time on completion when end date is still empty.
        // This keeps manual planning optional while ensuring done tasks have a completion timestamp.
        $statusRequestedDone = array_key_exists('status', $validated) && $validated['status'] === 'done';
        $endsAtNotExplicitlyProvided = ! array_key_exists('ends_at', $validated);
        if ($statusRequestedDone && $endsAtNotExplicitlyProvided && $task->ends_at === null) {
            $task->ends_at = CarbonImmutable::now('UTC');
        }
        $task->save();

        if (array_key_exists('assigned_user_ids', $validated)) {
            $assignedUserIds = $this->normalizeAssignees($validated['assigned_user_ids'], $user);
            $task->assignedUsers()->sync($assignedUserIds);
            $task->load('assignedUsers');
        }

        $locale = $this->resolveLocale($request);
        $actorLabel = $this->resolveActorLabel($user);
        $newAssignedIds = $task->assignedUsers
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->sort()
            ->values()
            ->all();

        $auditMessages = $this->buildAuditMessages(
            locale: $locale,
            actorLabel: $actorLabel,
            oldTitle: $oldTitle,
            newTitle: (string) $task->title,
            oldStatus: $oldStatus,
            newStatus: (string) $task->status,
            oldStartsAt: $oldStartsAt,
            newStartsAt: $this->dbUtcToCarbon($task->getRawOriginal('starts_at')),
            oldEndsAt: $oldEndsAt,
            newEndsAt: $this->dbUtcToCarbon($task->getRawOriginal('ends_at')),
            oldAssignedIds: $oldAssignedIds,
            newAssignedIds: $newAssignedIds
        );

        foreach ($auditMessages as $message) {
            $task->comments()->create([
                'user_id' => $user->id,
                'comment' => $message,
                'is_system' => true,
            ]);
        }

        // Notify only newly-added assignees after assignment changes.
        if (array_key_exists('assigned_user_ids', $validated)) {
            $newlyAddedAssigneeIds = array_values(array_diff($newAssignedIds, $oldAssignedIds));
            $this->notifyTaskAssignedUsers(
                task: $task,
                actor: $user,
                newlyAssignedUserIds: $newlyAddedAssigneeIds
            );
        }

        $task->load($this->taskRelations());

        return response()->json([
            'data' => new TaskResource($task),
        ]);
    }

    /**
     * Add a user comment to a task discussion feed.
     *
     * Only users with edit permission (assigned/creator/manager) may comment.
     * The created comment is explicitly marked as non-system.
     */
    public function addComment(Request $request, Task $task): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load($this->taskRelations());
        $this->ensureCanEdit($user, $task);

        $validated = $request->validate([
            'comment' => ['required', 'string', 'max:5000'],
        ]);

        $commentText = trim($validated['comment']);
        $task->comments()->create([
            'user_id' => $user->id,
            'comment' => $commentText,
            'is_system' => false,
        ]);

        // Notify task participants (creator + assignees), excluding the actor.
        $this->notifyTaskCommentParticipants(
            task: $task,
            actor: $user,
            commentText: $commentText
        );

        $task->load($this->taskRelations());

        return response()->json([
            'data' => new TaskResource($task),
        ]);
    }

    /**
     * Delete a real (non-system) comment from a task.
     *
     * Permission:
     * - manager/admin can delete any real comment
     * - comment owner can delete own real comment
     */
    public function destroyComment(Request $request, Task $task, TaskComment $comment): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load($this->taskRelations());
        $this->ensureCanView($user, $task);

        if ((int) $comment->task_id !== (int) $task->id) {
            abort(404);
        }

        if ((bool) $comment->is_system) {
            abort(403, 'Forbidden.');
        }

        $isOwner = (int) $comment->user_id === (int) $user->id;
        if (! $user->canManageStaffTasks() && ! $isOwner) {
            abort(403, 'Forbidden.');
        }

        $comment->delete();
        $task->load($this->taskRelations());

        return response()->json([
            'data' => new TaskResource($task),
        ]);
    }

    /**
     * Delete a task.
     *
     * Permission:
     * - users with `manage_staffs` can delete any task
     * - task creator can delete own task
     *
     * Task comments and pivot assignments are removed via cascade constraints.
     */
    public function destroy(Request $request, Task $task): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load($this->taskRelations());
        $this->ensureCanDelete($user, $task);
        $task->delete();

        return response()->json([], 204);
    }

    /**
     * Return assignable users for the task form.
     *
     * This endpoint provides a minimal shape (id/name/username) for UI selectors.
     */
    public function assignees(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $users = User::query()
            ->select(['id', 'username', 'first_name', 'last_name'])
            ->whereHas('roles', fn ($query) => $query->where('slug', 'staff'))
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        return response()->json([
            'data' => $users,
        ]);
    }

    /**
     * @param array<int, int|string> $ids
     * @return array<int, int>
     */
    private function normalizeAssignees(array $ids, User $actor): array
    {
        // Normalize incoming ids to unique integers.
        $normalized = array_values(array_unique(array_map(fn ($id) => (int) $id, $ids)));
        // Previous behavior required non-managers to always include themselves
        // in `assigned_user_ids`, which caused 403 on create/update in valid
        // workflows (user has `manage_tasks` but does not assign self).
        //
        // Updated behavior:
        // - `manage_tasks` users may assign one/multiple staff users
        // - visibility remains safe because creators can always view/edit
        //   their own created tasks via existing policy checks.

        // Only staff users may be assigned as task personnel.
        $staffCount = User::query()
            ->whereIn('id', $normalized)
            ->whereHas('roles', fn ($query) => $query->where('slug', 'staff'))
            ->count();
        if ($staffCount !== count($normalized)) {
            abort(422, 'Only staff users can be assigned.');
        }

        return $normalized;
    }

    private function ensureCanView(User $user, Task $task): void
    {
        // Users with manage_staffs can always read any task.
        if ($user->canManageStaffTasks()) {
            return;
        }

        // Creator can always read own task.
        if ((int) $task->created_by === (int) $user->id) {
            return;
        }

        // Otherwise the user must be in assigned users.
        $isAssigned = $task->assignedUsers->contains(fn ($assigned) => $assigned->id === $user->id);
        if (! $isAssigned) {
            abort(403, 'Forbidden.');
        }
    }

    private function ensureCanEdit(User $user, Task $task): void
    {
        // Users with manage_staffs can always edit.
        if ($user->canManageStaffTasks()) {
            return;
        }

        // Creator can edit own task.
        if ((int) $task->created_by === (int) $user->id) {
            return;
        }

        // Otherwise edit permission requires assignment.
        $isAssigned = $task->assignedUsers->contains(fn ($assigned) => $assigned->id === $user->id);
        if (! $isAssigned) {
            abort(403, 'Forbidden.');
        }
    }

    private function ensureCanDelete(User $user, Task $task): void
    {
        // Users with manage_staffs can delete any task.
        if ($user->canManageStaffTasks()) {
            return;
        }

        // Task creator can delete own task only when there are no real comments.
        $hasRealComments = $task->comments()->where('is_system', false)->exists();
        if ((int) $task->created_by === (int) $user->id && ! $hasRealComments) {
            return;
        }

        abort(403, 'Forbidden.');
    }

    private function toUtcOrNull(?string $value): ?CarbonImmutable
    {
        // Empty values are stored as NULL so clients can treat them as optional.
        if ($value === null || trim($value) === '') {
            return null;
        }

        // Persist in UTC for consistent backend storage and timezone-safe APIs.
        return CarbonImmutable::parse($value)->utc();
    }

    private function ensureTaskAccess(User $user): void
    {
        if (! $user->canAccessTasks()) {
            abort(403, 'Forbidden.');
        }
    }

    private function resolveEndsAtForStatus(string $status, ?string $requestedEndsAt, ?CarbonImmutable $currentEndsAt): ?CarbonImmutable
    {
        $normalizedRequested = $this->toUtcOrNull($requestedEndsAt);
        if ($normalizedRequested !== null) {
            return $normalizedRequested;
        }

        if ($status === 'done') {
            return $currentEndsAt ?? CarbonImmutable::now('UTC');
        }

        return $currentEndsAt;
    }

    private function dbUtcToCarbon(?string $value): ?CarbonImmutable
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC');
    }

    private function resolveLocale(Request $request): string
    {
        $acceptLanguage = strtolower((string) $request->header('Accept-Language', ''));
        if (str_contains($acceptLanguage, 'fa')) {
            return 'fa';
        }

        if (str_contains($acceptLanguage, 'en')) {
            return 'en';
        }

        return 'fa';
    }

    private function resolveActorLabel(User $user): string
    {
        $displayName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));
        if ($displayName !== '') {
            return $displayName;
        }

        return $user->username ?? ('User #' . $user->id);
    }

    /**
     * @param array<int, int> $oldAssignedIds
     * @param array<int, int> $newAssignedIds
     * @return array<int, string>
     */
    private function buildAuditMessages(
        string $locale,
        string $actorLabel,
        string $oldTitle,
        string $newTitle,
        string $oldStatus,
        string $newStatus,
        ?CarbonImmutable $oldStartsAt,
        ?CarbonImmutable $newStartsAt,
        ?CarbonImmutable $oldEndsAt,
        ?CarbonImmutable $newEndsAt,
        array $oldAssignedIds,
        array $newAssignedIds
    ): array {
        $messages = [];

        if ($oldTitle !== $newTitle) {
            $messages[] = trans('tasks.system.task_title_changed', [
                'user' => $actorLabel,
                'from' => $oldTitle,
                'to' => $newTitle,
            ], $locale);
        }

        if ($oldStatus !== $newStatus) {
            $messages[] = trans('tasks.system.task_status_changed', [
                'user' => $actorLabel,
                'from' => trans("tasks.system.status_{$oldStatus}", [], $locale),
                'to' => trans("tasks.system.status_{$newStatus}", [], $locale),
            ], $locale);
        }

        if ($this->dateTimeChanged($oldStartsAt, $newStartsAt)) {
            $messages[] = trans('tasks.system.task_starts_at_changed', [
                'user' => $actorLabel,
                'from' => TaskAuditFormatter::formatDateTime($oldStartsAt, $locale),
                'to' => TaskAuditFormatter::formatDateTime($newStartsAt, $locale),
            ], $locale);
        }

        if ($this->dateTimeChanged($oldEndsAt, $newEndsAt)) {
            $messages[] = trans('tasks.system.task_ends_at_changed', [
                'user' => $actorLabel,
                'from' => TaskAuditFormatter::formatDateTime($oldEndsAt, $locale),
                'to' => TaskAuditFormatter::formatDateTime($newEndsAt, $locale),
            ], $locale);
        }

        if ($oldAssignedIds !== $newAssignedIds) {
            $messages[] = trans('tasks.system.task_assignees_changed', [
                'user' => $actorLabel,
                'from' => $this->formatAuditAssignees($oldAssignedIds, $locale),
                'to' => $this->formatAuditAssignees($newAssignedIds, $locale),
            ], $locale);
        }

        return $messages;
    }

    private function dateTimeChanged(?CarbonImmutable $oldValue, ?CarbonImmutable $newValue): bool
    {
        if ($oldValue === null && $newValue === null) {
            return false;
        }

        if ($oldValue === null || $newValue === null) {
            return true;
        }

        return $oldValue->equalTo($newValue) === false;
    }

    /**
     * @param array<int, int> $ids
     */
    private function formatAuditAssignees(array $ids, string $locale): string
    {
        if ($ids === []) {
            return trans('tasks.system.empty', [], $locale);
        }

        /** @var EloquentCollection<int, User> $users */
        $users = User::query()
            ->select(['id', 'username', 'first_name', 'last_name'])
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        $labels = [];
        foreach ($ids as $id) {
            /** @var User|null $record */
            $record = $users->get($id);
            if (! $record) {
                continue;
            }

            $displayName = trim(($record->first_name ?? '') . ' ' . ($record->last_name ?? ''));
            $labels[] = $displayName !== '' ? $displayName : ($record->username ?? ('User #' . $record->id));
        }

        return $labels === [] ? trans('tasks.system.empty', [], $locale) : implode(', ', $labels);
    }

    /**
     * Notify newly assigned users about responsibility assignment.
     *
     * @param array<int, int> $newlyAssignedUserIds
     */
    private function notifyTaskAssignedUsers(Task $task, User $actor, array $newlyAssignedUserIds): void
    {
        $recipientIds = array_values(array_filter(
            array_unique(array_map(fn ($id) => (int) $id, $newlyAssignedUserIds)),
            fn (int $id): bool => $id > 0 && $id !== (int) $actor->id
        ));
        if ($recipientIds === []) {
            return;
        }

        $actorData = $this->buildActorSummary($actor);
        $notification = new TaskActivityNotification(
            event: 'task_assigned',
            taskId: (int) $task->id,
            taskTitle: (string) $task->title,
            actor: $actorData,
        );

        User::query()
            ->whereIn('id', $recipientIds)
            ->get()
            ->each(function (User $recipient) use ($notification, $actorData, $task): void {
                $recipient->notify($notification);
                $this->pushService()->sendToUser($recipient, [
                    'title' => $this->translatePushTitle('task_assigned', $recipient),
                    'body' => $this->translatePushBody(
                        event: 'task_assigned',
                        recipient: $recipient,
                        actorData: $actorData,
                        taskTitle: (string) $task->title,
                        commentExcerpt: null
                    ),
                    'url' => '/dashboard/tasks/new',
                    'task_id' => (int) $task->id,
                    'event' => 'task_assigned',
                ]);
            });
    }

    /**
     * Notify task participants when a real user comment is posted.
     */
    private function notifyTaskCommentParticipants(Task $task, User $actor, string $commentText): void
    {
        // Participant set:
        // - task creator
        // - all assigned users
        // Actor is excluded to avoid self-notifications.
        $recipientIds = [(int) $task->created_by];
        foreach ($task->assignedUsers as $assignedUser) {
            $recipientIds[] = (int) $assignedUser->id;
        }
        $recipientIds = array_values(array_filter(
            array_unique($recipientIds),
            fn (int $id): bool => $id > 0 && $id !== (int) $actor->id
        ));
        if ($recipientIds === []) {
            return;
        }

        $excerpt = mb_substr($commentText, 0, 120);
        $actorData = $this->buildActorSummary($actor);
        $notification = new TaskActivityNotification(
            event: 'task_comment',
            taskId: (int) $task->id,
            taskTitle: (string) $task->title,
            actor: $actorData,
            commentExcerpt: $excerpt
        );

        User::query()
            ->whereIn('id', $recipientIds)
            ->get()
            ->each(function (User $recipient) use ($notification, $actorData, $task, $excerpt): void {
                $recipient->notify($notification);
                $this->pushService()->sendToUser($recipient, [
                    'title' => $this->translatePushTitle('task_comment', $recipient),
                    'body' => $this->translatePushBody(
                        event: 'task_comment',
                        recipient: $recipient,
                        actorData: $actorData,
                        taskTitle: (string) $task->title,
                        commentExcerpt: $excerpt
                    ),
                    'url' => '/dashboard/tasks/new',
                    'task_id' => (int) $task->id,
                    'event' => 'task_comment',
                ]);
            });
    }

    /**
     * Build compact actor payload used by notification entries.
     *
     * @return array<string, int|string>
     */
    private function buildActorSummary(User $actor): array
    {
        $name = trim(($actor->first_name ?? '') . ' ' . ($actor->last_name ?? ''));
        if ($name === '') {
            $name = $actor->username ?? ('User #' . $actor->id);
        }

        return [
            'id' => (int) $actor->id,
            'name' => $name,
            'username' => (string) ($actor->username ?? ''),
        ];
    }

    /**
     * Resolve push service from container.
     */
    private function pushService(): PushNotificationService
    {
        /** @var PushNotificationService $service */
        $service = app(PushNotificationService::class);

        return $service;
    }

    /**
     * Translate push title per recipient locale.
     */
    private function translatePushTitle(string $event, User $recipient): string
    {
        $locale = $this->userLocale($recipient);
        if ($event === 'task_assigned') {
            return trans('notifications.task_push.title.task_assigned', [], $locale);
        }

        if ($event === 'task_comment') {
            return trans('notifications.task_push.title.task_comment', [], $locale);
        }

        return trans('notifications.task_push.title.default', [], $locale);
    }

    /**
     * Build localized push body text.
     *
     * @param array<string, int|string> $actorData
     */
    private function translatePushBody(string $event, User $recipient, array $actorData, string $taskTitle, ?string $commentExcerpt): string
    {
        $locale = $this->userLocale($recipient);
        $actorLabel = trim((string) ($actorData['name'] ?? ''));
        if ($actorLabel === '') {
            $actorLabel = (string) ($actorData['username'] ?? trans('notifications.task_push.defaults.user', [], $locale));
        }

        if ($event === 'task_assigned') {
            return trans('notifications.task_push.body.task_assigned', [
                'actor' => $actorLabel,
                'task_title' => $taskTitle,
            ], $locale);
        }

        if ($event === 'task_comment') {
            if ($commentExcerpt !== null && trim($commentExcerpt) !== '') {
                return trans('notifications.task_push.body.task_comment_with_excerpt', [
                    'actor' => $actorLabel,
                    'task_title' => $taskTitle,
                    'comment_excerpt' => $commentExcerpt,
                ], $locale);
            }

            return trans('notifications.task_push.body.task_comment', [
                'actor' => $actorLabel,
                'task_title' => $taskTitle,
            ], $locale);
        }

        return $taskTitle;
    }

    /**
     * Resolve user language preference used in push copy.
     */
    private function userLocale(User $user): string
    {
        $locale = strtolower((string) ($user->admin_locale ?? 'fa'));
        return $locale === 'en' ? 'en' : 'fa';
    }

    /**
     * Build eager-load relation list with backward-compatible attachment fallback.
     *
     * Why:
     * - deployments may run newer code before running DB migrations
     * - when `photos` is missing, loading that relation would throw SQL 1146
     */
    private function taskRelations(): array
    {
        $relations = ['assignedUsers', 'creator', 'comments.user'];
        if (Schema::hasTable('photos')) {
            $relations[] = 'attachments.uploader';
        }

        return $relations;
    }
}


