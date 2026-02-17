<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create web push subscriptions table.
     *
     * Each row represents one browser/device endpoint for one user.
     * A user can have multiple active subscriptions across devices.
     */
    public function up(): void
    {
        if (Schema::hasTable('push_subscriptions')) {
            return;
        }

        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // MySQL cannot create a UNIQUE index on TEXT without explicit key length.
            // We store endpoint as a bounded string so `unique()` remains portable.
            $table->string('endpoint', 512);
            $table->string('public_key', 512);
            $table->string('auth_token', 512);
            $table->string('content_encoding', 64)->nullable();
            $table->string('user_agent', 1024)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique('endpoint');
            $table->index(['user_id', 'last_seen_at']);
        });
    }

    /**
     * Drop push subscriptions table.
     */
    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
