<?php

namespace App\Http\Controllers;

use App\Http\Resources\PhotoResource;
use App\Models\Photo;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhotoAlbumController extends Controller
{
    /**
     * List/search/sort general photo album entries.
     *
     * Access:
     * - restricted to manage_system_configurations
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageAlbum($user);

        $validated = $request->validate([
            'query' => ['nullable', 'string', 'max:255'],
            'album_key' => ['nullable', 'string', 'max:80'],
            'sort_by' => ['nullable', 'in:created_at,size_bytes,title'],
            'sort_dir' => ['nullable', 'in:asc,desc'],
        ]);

        $queryText = trim((string) ($validated['query'] ?? ''));
        $albumKey = trim((string) ($validated['album_key'] ?? ''));
        $sortBy = (string) ($validated['sort_by'] ?? 'created_at');
        $sortDir = (string) ($validated['sort_dir'] ?? 'desc');

        $builder = Photo::query()
            ->with('uploader')
            ->select([
                'id',
                'task_id',
                'uploaded_by',
                'album_key',
                'reference_type',
                'reference_id',
                'title',
                'disk',
                'path',
                'original_name',
                'mime_type',
                'size_bytes',
                'created_at',
                'updated_at',
            ]);

        if ($queryText !== '') {
            $builder->where(function ($inner) use ($queryText): void {
                $like = '%' . $queryText . '%';
                $inner->where('title', 'like', $like)
                    ->orWhere('album_key', 'like', $like)
                    ->orWhere('original_name', 'like', $like);
            });
        }

        if ($albumKey !== '') {
            $builder->where('album_key', $albumKey);
        }

        $items = $builder
            ->orderBy($sortBy, $sortDir)
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        return response()->json([
            'data' => PhotoResource::collection($items),
        ]);
    }

    /**
     * Show one album entry.
     */
    public function show(Request $request, Photo $photo): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageAlbum($user);

        $photo->load('uploader');

        return response()->json([
            'data' => new PhotoResource($photo),
        ]);
    }

    /**
     * Edit album entry metadata.
     */
    public function update(Request $request, Photo $photo): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageAlbum($user);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $photo->title = trim((string) $validated['title']);
        $photo->save();
        $photo->load('uploader');

        return response()->json([
            'data' => new PhotoResource($photo),
        ]);
    }

    /**
     * Delete one album entry.
     */
    public function destroy(Request $request, Photo $photo): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageAlbum($user);

        \Illuminate\Support\Facades\Storage::disk((string) $photo->disk)
            ->delete((string) $photo->path);
        $photo->delete();

        return response()->json([], 204);
    }

    private function ensureCanManageAlbum(User $user): void
    {
        if (! $user->hasPermission('manage_system_configurations')) {
            abort(403, 'Forbidden.');
        }
    }
}
