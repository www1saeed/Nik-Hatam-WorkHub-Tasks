<?php

use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('login', [\App\Http\Controllers\AuthController::class, 'login']);
    Route::post('register', [\App\Http\Controllers\AuthController::class, 'register']);
    Route::post('verify-email', [\App\Http\Controllers\AuthController::class, 'verifyEmail']);
    Route::post('resend-verification', [\App\Http\Controllers\AuthController::class, 'resendVerification']);
    Route::post('password/request', [\App\Http\Controllers\AuthController::class, 'requestPasswordReset']);
    Route::post('password/reset', [\App\Http\Controllers\AuthController::class, 'resetPassword']);
    Route::get('telegram/config', [\App\Http\Controllers\AuthController::class, 'telegramConfig']);
    Route::post('telegram', [\App\Http\Controllers\AuthController::class, 'telegram']);
    Route::post('social/complete', [\App\Http\Controllers\AuthController::class, 'completeSocialProfile']);
    Route::post('social/link', [\App\Http\Controllers\AuthController::class, 'linkSocialAccount']);
    Route::post('logout', [\App\Http\Controllers\AuthController::class, 'logout']);
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('auth/me', [\App\Http\Controllers\AuthController::class, 'me']);
    Route::get('profile', [\App\Http\Controllers\ProfileController::class, 'show']);
    Route::post('profile', [\App\Http\Controllers\ProfileController::class, 'update']);
    Route::get('profile/availability', [\App\Http\Controllers\ProfileController::class, 'availability']);
    Route::apiResource('users', \App\Http\Controllers\UserController::class);
    Route::get('users/{user}/profile', [\App\Http\Controllers\UserController::class, 'showProfile']);
    Route::post('users/{user}/profile', [\App\Http\Controllers\UserController::class, 'updateProfile']);
    Route::get('users/{user}/profile/availability', [\App\Http\Controllers\UserController::class, 'availability']);
    Route::post('users/{user}/password/reset', [\App\Http\Controllers\UserController::class, 'sendPasswordReset']);
    Route::post('users/{user}/password/reset-link', [\App\Http\Controllers\UserController::class, 'createPasswordResetLink']);
    Route::apiResource('roles', \App\Http\Controllers\RoleController::class);
    Route::apiResource('permissions', \App\Http\Controllers\PermissionController::class);
    Route::apiResource('guests', \App\Http\Controllers\GuestController::class);
    Route::apiResource('people', \App\Http\Controllers\PersonController::class)->only(['show', 'update']);
});
