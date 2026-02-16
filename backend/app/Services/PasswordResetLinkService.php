<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Password;

/**
 * Builds password reset tokens + URLs for email and username-based flows.
 * Email resets use Laravel's broker, username resets use a short-lived cache token.
 */
class PasswordResetLinkService
{
    /**
     * Create a reset token for a user and return payload for URL building.
     *
     * @return array{token:string, login:string, type:string}
     */
    public function create(User $user): array
    {
        if ($user->email) {
            return [
                'token' => Password::broker()->createToken($user),
                'login' => $user->email,
                'type' => 'email',
            ];
        }

        $token = bin2hex(random_bytes(24));
        Cache::put($this->cacheKey($token), [
            'user_id' => $user->id,
        ], now()->addMinutes($this->ttlMinutes()));

        return [
            'token' => $token,
            'login' => $user->username,
            'type' => 'username',
        ];
    }

    /**
     * Build a frontend reset URL for the given login + token.
     */
    public function buildUrl(string $login, string $token): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $query = http_build_query([
            'login' => $login,
            'token' => $token,
        ]);

        return $baseUrl.'/reset-password?'.$query;
    }

    /**
     * Validate a username token and return the matching user.
     */
    public function validateUsernameToken(string $username, string $token): ?User
    {
        $payload = Cache::get($this->cacheKey($token));
        if (! is_array($payload) || empty($payload['user_id'])) {
            return null;
        }

        $user = User::query()->find($payload['user_id']);
        if (! $user || $user->username !== $username) {
            return null;
        }

        return $user;
    }

    /**
     * Remove a consumed username reset token.
     */
    public function forgetUsernameToken(string $token): void
    {
        Cache::forget($this->cacheKey($token));
    }

    private function ttlMinutes(): int
    {
        return (int) config('auth.passwords.users.expire', 60);
    }

    private function cacheKey(string $token): string
    {
        return 'password_reset_username:'.$token;
    }
}
