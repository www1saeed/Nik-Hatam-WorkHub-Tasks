<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('people', function (Blueprint $table): void {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique()->nullable();
            $table->date('birth_date')->nullable();
            $table->string('birth_place')->nullable();
            $table->string('father_name')->nullable();
            $table->string('residence')->nullable();
            $table->json('phone_numbers')->nullable();
            $table->json('addresses')->nullable();
            $table->string('avatar_path')->nullable();
            $table->string('id_number')->unique()->nullable();
            $table->string('passport_number')->unique()->nullable();
            $table->string('id_card_path')->nullable();
            $table->boolean('is_confirmed')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};
