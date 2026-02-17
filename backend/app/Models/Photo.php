<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Photo extends Model
{
    use HasFactory;

    /**
     * Use shared general photo table.
     */
    protected $table = 'photos';

    /**
     * @var array<int, string>
     */
    protected $fillable = [
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
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'task_id' => 'integer',
        'reference_id' => 'integer',
        'size_bytes' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function freshTimestamp(): CarbonImmutable
    {
        // Keep model timestamps persisted in UTC regardless of app display timezone.
        return CarbonImmutable::now('UTC');
    }
}
