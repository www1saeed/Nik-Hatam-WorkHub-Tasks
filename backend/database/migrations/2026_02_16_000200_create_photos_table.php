<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('photos')) {
            return;
        }

        Schema::create('photos', function (Blueprint $table): void {
            $table->id();
            // Optional task link for current task feature usage.
            // Nullable by design so the album can store photos from future modules too.
            $table->foreignId('task_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            // Album namespace enables one shared photos table for multiple modules.
            // Current task uploads use: album_key = "tasks".
            $table->string('album_key', 80)->default('tasks');
            // Generic module reference placeholders for future non-task integrations.
            $table->string('reference_type', 120)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            // Editable display title in album/task detail UIs.
            $table->string('title', 255);
            $table->string('disk', 40)->default('local');
            $table->string('path', 1000);
            $table->string('original_name', 255)->nullable();
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();

            $table->index('task_id');
            $table->index('uploaded_by');
            $table->index('album_key');
            $table->index(['reference_type', 'reference_id']);
            $table->index('title');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('photos');
    }
};
