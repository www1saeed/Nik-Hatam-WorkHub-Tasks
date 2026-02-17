<?php

namespace App\Http\Controllers;

use App\Http\Resources\TaskResource;
use App\Models\Photo;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskPhotoController extends Controller
{
    /**
     * Upload one or many images for a task.
     *
     * Permission:
     * - task must be visible/editable for current user (creator/assigned/manage_staffs)
     * - image files only
     */
    public function store(Request $request, Task $task): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load(['assignedUsers', 'creator', 'comments.user', 'attachments.uploader']);
        $this->ensureCanEdit($user, $task);

        $locale = $this->resolveLocale($request);

        $validated = $request->validate([
            'images' => ['required', 'array', 'min:1', 'max:10'],
            'images.*' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:8192'],
        ], [
            // "uploaded" is raised when PHP itself rejects the file
            // (e.g. php.ini upload_max_filesize/post_max_size or temp dir issues).
            'images.*.uploaded' => trans('tasks.validation.image_upload_failed', [], $locale),
            'images.*.max' => trans('tasks.validation.image_too_large', [], $locale),
        ]);

        /** @var array<int, UploadedFile> $files */
        $files = $validated['images'];
        foreach ($files as $file) {
            // Store on private local disk to prevent anonymous direct access.
            $extension = strtolower((string) $file->getClientOriginalExtension());
            $basename = Str::uuid()->toString();
            $path = $file->storeAs(
                'task-attachments/' . $task->id,
                $basename . ($extension !== '' ? ".{$extension}" : ''),
                'local'
            );

            $task->attachments()->create([
                'uploaded_by' => $user->id,
                'album_key' => 'tasks',
                'reference_type' => 'task',
                'reference_id' => (int) $task->id,
                'title' => (string) $task->title,
                'disk' => 'local',
                'path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size_bytes' => (int) $file->getSize(),
            ]);
        }

        $task->comments()->create([
            'user_id' => $user->id,
            'comment' => trans('tasks.system.task_attachments_uploaded', [
                'user' => $this->resolveActorLabel($user),
                'count' => count($files),
            ], $locale),
            'is_system' => true,
        ]);

        $task->load(['assignedUsers', 'creator', 'comments.user', 'attachments.uploader']);

        return response()->json([
            'data' => new TaskResource($task),
        ], 201);
    }

    /**
     * Delete one task attachment.
     *
     * Permission:
     * - owner of the image
     * - OR user with manage_system_configurations
     */
    public function destroy(Request $request, Task $task, Photo $attachment): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureTaskAccess($user);

        $task->load(['assignedUsers', 'creator', 'comments.user', 'attachments.uploader']);
        $this->ensureCanView($user, $task);

        if ((int) $attachment->task_id !== (int) $task->id || (string) $attachment->album_key !== 'tasks') {
            abort(404);
        }

        $isConfigManager = $user->hasPermission('manage_system_configurations');
        $isOwner = (int) $attachment->uploaded_by === (int) $user->id;
        if (! $isConfigManager && ! $isOwner) {
            abort(403, 'Forbidden.');
        }

        Storage::disk((string) $attachment->disk)->delete((string) $attachment->path);
        $attachment->delete();

        $locale = $this->resolveLocale($request);
        $task->comments()->create([
            'user_id' => $user->id,
            'comment' => trans('tasks.system.task_attachment_deleted', [
                'user' => $this->resolveActorLabel($user),
                'title' => (string) $attachment->title,
            ], $locale),
            'is_system' => true,
        ]);

        $task->load(['assignedUsers', 'creator', 'comments.user', 'attachments.uploader']);

        return response()->json([
            'data' => new TaskResource($task),
        ]);
    }

    /**
     * Serve attachment file bytes through authenticated endpoint.
     *
     * Access policy:
     * - strictly task permission based (`manage_tasks` OR `manage_staffs`)
     * - no extra config-manager bypass for direct file reads
     *
     * Why:
     * - business rule requires task photos to stay inside task permission scope
     * - this endpoint is the single controlled read gateway for private storage
     *
     * Delivery strategy:
     * - local disk: prefer BinaryFileResponse (`response()->file`) for robust
     *   browser image decoding and stable header handling
     * - non-local disks: fallback to streamed response
     *
     * Output-buffer guard:
     * - we clear active output buffers before sending binary bytes
     * - prevents stray buffered output from corrupting JPEG/PNG payloads
     */
    public function file(Request $request, Photo $attachment): StreamedResponse|BinaryFileResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        // Enforce exact task-scope access rule:
        // `canAccessTasks()` maps to manage_tasks/manage_staffs only.
        if (! $user->canAccessTasks()) {
            abort(403, 'Forbidden.');
        }

        $disk = Storage::disk((string) $attachment->disk);
        $path = (string) $attachment->path;
        if (! $disk->exists($path)) {
            abort(404);
        }

        $mime = (string) ($attachment->mime_type ?: $disk->mimeType($path) ?: 'application/octet-stream');
        $name = $attachment->original_name ?: ('task-image-' . $attachment->id);
        $headers = [
            'Content-Type' => $mime,
            // Inline keeps UX smooth for thumbnail/preview rendering in browser.
            'Content-Disposition' => 'inline; filename="' . addslashes((string) $name) . '"',
            // Private caching is safe for authenticated users and reduces repeat fetch cost.
            'Cache-Control' => 'private, max-age=600',
            // Prevent content sniffing inconsistencies across browsers.
            'X-Content-Type-Options' => 'nosniff',
        ];

        // Local disk path: return native file response where possible.
        if ((string) $attachment->disk === 'local') {
            try {
                $absolutePath = $disk->path($path);
                if (is_string($absolutePath) && $absolutePath !== '' && file_exists($absolutePath)) {
                    while (ob_get_level() > 0) {
                        ob_end_clean();
                    }
                    return response()->file($absolutePath, $headers);
                }
            } catch (\Throwable) {
                // Fall through to stream-based delivery.
            }
        }

        $stream = $disk->readStream($path);
        if (! is_resource($stream)) {
            abort(404);
        }

        return response()->stream(function () use ($stream): void {
            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            fpassthru($stream);
            fclose($stream);
        }, 200, $headers);
    }

    private function ensureTaskAccess(User $user): void
    {
        if (! $user->canAccessTasks()) {
            abort(403, 'Forbidden.');
        }
    }

    private function ensureCanView(User $user, Task $task): void
    {
        if ($user->canManageStaffTasks()) {
            return;
        }

        if ((int) $task->created_by === (int) $user->id) {
            return;
        }

        $isAssigned = $task->assignedUsers->contains(fn ($assigned) => $assigned->id === $user->id);
        if (! $isAssigned) {
            abort(403, 'Forbidden.');
        }
    }

    private function ensureCanEdit(User $user, Task $task): void
    {
        if ($user->canManageStaffTasks()) {
            return;
        }

        if ((int) $task->created_by === (int) $user->id) {
            return;
        }

        $isAssigned = $task->assignedUsers->contains(fn ($assigned) => $assigned->id === $user->id);
        if (! $isAssigned) {
            abort(403, 'Forbidden.');
        }
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
}
