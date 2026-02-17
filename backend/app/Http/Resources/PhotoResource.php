<?php

namespace App\Http\Resources;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Photo
 */
class PhotoResource extends JsonResource
{
    /**
     * Transform attachment model into API payload.
     */
    public function toArray(Request $request): array
    {
        /** @var User|null $viewer */
        $viewer = $request->user();
        $isConfigManager = $viewer?->hasPermission('manage_system_configurations') ?? false;
        $isOwner = $viewer ? (int) $this->uploaded_by === (int) $viewer->id : false;

        return [
            'id' => (int) $this->id,
            'task_id' => $this->task_id !== null ? (int) $this->task_id : null,
            'album_key' => (string) ($this->album_key ?? 'tasks'),
            'reference_type' => $this->reference_type,
            'reference_id' => $this->reference_id,
            'title' => (string) $this->title,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => (int) $this->size_bytes,
            'uploaded_by' => (int) $this->uploaded_by,
            'uploader' => $this->whenLoaded('uploader', fn () => $this->uploader ? [
                'id' => (int) $this->uploader->id,
                'username' => (string) $this->uploader->username,
                'first_name' => (string) $this->uploader->first_name,
                'last_name' => (string) $this->uploader->last_name,
            ] : null),
            // File URL is protected by auth + permission checks in controller.
            'file_url' => url('/api/photos/' . $this->id . '/file'),
            'created_at' => $this->dbUtcToIso($this->getRawOriginal('created_at')),
            'updated_at' => $this->dbUtcToIso($this->getRawOriginal('updated_at')),
            'can_delete' => $isConfigManager || $isOwner,
            'can_edit' => $isConfigManager,
        ];
    }

    private function dbUtcToIso(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        return CarbonImmutable::parse($raw, 'UTC')->toISOString();
    }
}
