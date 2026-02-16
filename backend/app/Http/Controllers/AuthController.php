<?php

namespace App\Http\Controllers;

use App\Models\SocialAccount;
use App\Models\User;
use App\Notifications\EmailVerificationCodeNotification;
use App\Services\TelegramAuthService;
use App\Services\PasswordResetLinkService;
use App\Services\VerificationCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Handles authentication endpoints.
 */
class AuthController extends Controller
{
    /**
     * Authenticate a user and return a Sanctum token.
     */
    public function login(Request $request): JsonResponse
    {
        // Accept login as username/email in a single field for UX simplicity.
        // The API also supports explicit username/email fields for flexibility.
        $validated = $request->validate([
            'login' => ['required_without_all:username,email', 'string'],
            'username' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
        ]);

        // Resolve the identifier from any of the supported fields.
        $identifier = $validated['login']
            ?? $validated['username']
            ?? $validated['email']
            ?? null;

        if (! $identifier) {
            // A concrete, field-scoped error keeps the UI mapped to the input.
            throw ValidationException::withMessages([
                'login' => ['Username or email is required.'],
            ]);
        }

        // Find user by username or email.
        $user = User::query()
            ->where('username', $identifier)
            ->orWhere('email', $identifier)
            ->first();

        // Validate credentials and guard against empty passwords (social accounts).
        // Social accounts can exist without a password, so fail fast.
        if (! $user || ! $user->password || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Block login until email is verified (if email exists).
        if ($user->email && ! $user->email_verified_at) {
            throw ValidationException::withMessages([
                'login' => ['Please verify your email address before logging in.'],
            ]);
        }

        // Issue a Sanctum token for the UI.
        // Use device_name if provided to allow token management later.
        $tokenName = $validated['device_name'] ?? $request->userAgent() ?? 'api-token';
        $token = $user->createToken($tokenName)->plainTextToken;
        // Eagerly include roles + permissions to render menus without extra calls.
        $roles = $user->roles()->get(['roles.id', 'roles.name', 'roles.slug']);
        $permissions = $user->permissions()->map(fn ($permission) => [
            'id' => $permission->id,
            'name' => $permission->name,
            'slug' => $permission->slug,
        ]);

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'roles' => $roles,
                'permissions' => $permissions,
                'avatar_url' => $user->avatar_path
                    ? \Illuminate\Support\Facades\Storage::disk('public')->url($user->avatar_path)
                    : null,
            ],
        ]);
    }

    /**
     * Register a new user and send verification code.
     */
    public function register(Request $request, VerificationCodeService $verificationCodeService): JsonResponse
    {
        // Registration requires explicit locale to send localized mail copy.
        $validated = $request->validate([
            'locale' => ['required', 'string', Rule::in(['fa', 'en'])],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'username' => ['nullable', 'string', 'max:255', Rule::unique('users', 'username')],
            'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$/'],
        ]);

        // Use provided username, otherwise fallback to email for a readable default.
        $username = $validated['username'] ?? null;
        if (! $username && $validated['email']) {
            $username = $validated['email'];
        }

        // Persist the user in a pending verification state.
        $user = User::create([
            'username' => $username,
            'password' => Hash::make($validated['password']),
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'admin_locale' => $validated['locale'],
        ]);

        // New users are always guests until elevated by an admin.
        $guestRole = \App\Models\Role::query()->where('slug', 'guest')->first();
        if ($guestRole) {
            $user->roles()->syncWithoutDetaching([$guestRole->id]);
        }

        // Send verification code in the requested locale.
        app()->setLocale($validated['locale']);
        $code = $verificationCodeService->createForUser($user, 'email', $validated['email']);
        $user->notify((new EmailVerificationCodeNotification($code, $validated['email']))->locale(app()->getLocale()));

        return response()->json([
            'message' => 'Registration received. Please verify your email to continue.',
            'verification_channel' => 'email',
        ], 201);
    }

    /**
     * Verify email using activation code.
     */
    public function verifyEmail(Request $request, VerificationCodeService $verificationCodeService): JsonResponse
    {
        // Verification consumes email + code, and marks the user verified.
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string'],
        ]);

        // Confirm that the code is valid and not expired.
        $record = $verificationCodeService->verify('email', $validated['email'], $validated['code']);

        if (! $record) {
            throw ValidationException::withMessages([
                'code' => ['Invalid or expired verification code.'],
            ]);
        }

        // Hydrate the user from the verification record.
        $user = $record->user;

        if (! $user) {
            abort(404, 'User not found.');
        }

        // Mark verification timestamp so login is allowed.
        $user->forceFill([
            'email_verified_at' => now(),
        ])->save();

        return response()->json([
            'message' => 'Email verified successfully.',
        ]);
    }

    /**
     * Resend email verification code.
     */
    public function resendVerification(Request $request, VerificationCodeService $verificationCodeService): JsonResponse
    {
        // If the email exists, send a new code; otherwise return a generic response.
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'locale' => ['nullable', 'string', Rule::in(['fa', 'en'])],
        ]);

        // Find the user if the email exists; keep behavior opaque to callers.
        $user = User::query()->where('email', $validated['email'])->first();

        if (! $user) {
            return response()->json(['message' => 'If the email exists, a code was sent.']);
        }

        // If already verified, do not regenerate codes.
        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email already verified.']);
        }

        // Choose locale in order: request -> user preference.
        if (! empty($validated['locale'])) {
            app()->setLocale($validated['locale']);
        } elseif ($user->admin_locale) {
            app()->setLocale($user->admin_locale);
        }

        // Issue and send the new verification code.
        $code = $verificationCodeService->createForUser($user, 'email', $validated['email']);
        $user->notify((new EmailVerificationCodeNotification($code, $validated['email']))->locale(app()->getLocale()));

        return response()->json(['message' => 'Verification code sent.']);
    }

    /**
     * Send password reset link email.
     */
    public function requestPasswordReset(Request $request): JsonResponse
    {
        // Always return a generic response to avoid account enumeration.
        $validated = $request->validate([
            'login' => ['required_without_all:email,username', 'string'],
            'email' => ['nullable', 'email'],
            'username' => ['nullable', 'string'],
            'locale' => ['nullable', 'string', Rule::in(['fa', 'en'])],
        ]);

        $identifier = $validated['login']
            ?? $validated['email']
            ?? $validated['username']
            ?? null;

        // Resolve the user if the email exists.
        $user = $identifier
            ? User::query()
                ->where('email', $identifier)
                ->orWhere('username', $identifier)
                ->first()
            : null;

        if ($user) {
            // Select locale before sending the reset email.
            if (! empty($validated['locale'])) {
                app()->setLocale($validated['locale']);
            } elseif ($user->admin_locale) {
                app()->setLocale($user->admin_locale);
            }

            // Generate a reset token and notify via standard Laravel mail.
            if ($user->email) {
                $token = Password::broker()->createToken($user);
                $user->sendPasswordResetNotification($token);
            }
        }

        return response()->json([
            'message' => 'If the email exists, a reset link was sent.',
        ]);
    }

    /**
     * Reset password using token.
     */
    public function resetPassword(Request $request, PasswordResetLinkService $passwordResetLinkService): JsonResponse
    {
        // Validate the reset token + new password.
        $validated = $request->validate([
            'login' => ['required_without_all:email,username', 'string'],
            'email' => ['nullable', 'email'],
            'username' => ['nullable', 'string'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$/'],
            'password_confirmation' => ['required', 'string'],
        ]);

        $identifier = $validated['login']
            ?? $validated['email']
            ?? $validated['username']
            ?? null;

        if (! $identifier) {
            throw ValidationException::withMessages([
                'login' => ['Username or email is required.'],
            ]);
        }

        $isEmail = filter_var($identifier, FILTER_VALIDATE_EMAIL) !== false;

        if ($isEmail) {
            // Let the broker validate the token and update the password.
            $status = Password::broker()->reset(
                [
                    'email' => $identifier,
                    'token' => $validated['token'],
                    'password' => $validated['password'],
                    'password_confirmation' => $validated['password_confirmation'],
                ],
                function (User $user, string $password): void {
                    $user->forceFill([
                        'password' => Hash::make($password),
                        'remember_token' => Str::random(60),
                    ])->save();
                }
            );

            if ($status !== Password::PASSWORD_RESET) {
                // Map broker failure to a validation error for UI consistency.
                throw ValidationException::withMessages([
                    'token' => ['Invalid or expired reset token.'],
                ]);
            }

            // Mark email as verified after successful reset.
            $user = User::query()->where('email', $identifier)->first();
            if ($user && ! $user->email_verified_at) {
                $user->forceFill([
                    'email_verified_at' => now(),
                ])->save();
            }
        } else {
            // Validate username-based token for accounts without email.
            $user = $passwordResetLinkService->validateUsernameToken($identifier, $validated['token']);
            if (! $user) {
                throw ValidationException::withMessages([
                    'token' => ['Invalid or expired reset token.'],
                ]);
            }

            $user->forceFill([
                'password' => Hash::make($validated['password']),
                'remember_token' => Str::random(60),
            ])->save();

            $passwordResetLinkService->forgetUsernameToken($validated['token']);
        }

        return response()->json([
            'message' => 'Password reset successfully.',
        ]);
    }

    /**
     * Logout the authenticated user.
     */
    public function logout(Request $request): JsonResponse
    {
        // Only revoke the current access token.
        $token = $request->user()?->currentAccessToken();

        if ($token) {
            $token->delete();
        }

        return response()->json(['message' => 'Logged out']);
    }

    /**
     * Return the authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        // Use the auth token to resolve the current user.
        $user = $request->user();

        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        // Include roles + permissions for permission-based UI.
        $roles = $user->roles()->get(['roles.id', 'roles.name', 'roles.slug']);
        $permissions = $user->permissions()->map(fn ($permission) => [
            'id' => $permission->id,
            'name' => $permission->name,
            'slug' => $permission->slug,
        ]);

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'admin_locale' => $user->admin_locale,
                'roles' => $roles,
                'permissions' => $permissions,
                'avatar_url' => $user->avatar_path
                    ? \Illuminate\Support\Facades\Storage::disk('public')->url($user->avatar_path)
                    : null,
            ],
        ]);
    }

    /**
     * Telegram login/registration.
     */
    public function telegram(Request $request, TelegramAuthService $telegramAuthService): JsonResponse
    {
        // Accept the Telegram login widget payload.
        $validated = $request->validate([
            'id' => ['required'],
            'auth_date' => ['required', 'integer'],
            'hash' => ['required', 'string'],
            'first_name' => ['nullable', 'string'],
            'last_name' => ['nullable', 'string'],
            'username' => ['nullable', 'string'],
            'photo_url' => ['nullable', 'string'],
        ]);

        // Normalize Telegram id to string for consistent storage.
        $validated['id'] = (string) $validated['id'];

        // Validate the Telegram signature and auth time window.
        $botToken = config('services.telegram.bot_token');
        $ttlSeconds = (int) config('services.telegram.login_ttl', 86400);

        if (! $botToken || ! $telegramAuthService->isValid($validated, $botToken, $ttlSeconds)) {
            throw ValidationException::withMessages([
                'hash' => ['Invalid Telegram authentication data.'],
            ]);
        }

        // Load (or refresh) existing social account if it exists.
        $user = DB::transaction(function () use ($validated): ?User {
            $account = SocialAccount::query()
                ->where('provider', 'telegram')
                ->where('provider_user_id', $validated['id'])
                ->first();

            if ($account) {
                $account->forceFill([
                    'provider_username' => $validated['username'] ?? null,
                    'provider_name' => trim(($validated['first_name'] ?? '').' '.($validated['last_name'] ?? '')) ?: null,
                    'data' => $validated,
                ])->save();

                return $account->user;
            }

            return null;
        });

        // If account is missing or incomplete, request a profile completion flow.
        if (! $user || $this->needsProfileCompletion($user)) {
            $token = bin2hex(random_bytes(24));

            Cache::put('social_login:'.$token, [
                'provider' => 'telegram',
                'provider_user_id' => $validated['id'],
                'provider_email' => null,
                'provider_username' => $validated['username'] ?? null,
                'provider_name' => trim(($validated['first_name'] ?? '').' '.($validated['last_name'] ?? '')) ?: null,
                'data' => $validated,
                'user_id' => $user?->id,
            ], now()->addMinutes(30));

            return response()->json([
                'message' => 'Profile completion required.',
                'completion_token' => $token,
            ], 409);
        }

        // If email exists but is not verified, block login.
        if ($user->email && ! $user->email_verified_at) {
            return response()->json([
                'message' => 'Please verify your email address before logging in.',
            ], 403);
        }

        // Issue token and return user profile.
        $tokenName = $request->userAgent() ?? 'api-token';
        $token = $user->createToken($tokenName)->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'avatar_url' => $user->avatar_path
                    ? \Illuminate\Support\Facades\Storage::disk('public')->url($user->avatar_path)
                    : null,
            ],
        ]);
    }

    /**
     * Return Telegram widget configuration for the frontend.
     */
    public function telegramConfig(): JsonResponse
    {
        $botToken = config('services.telegram.bot_token');
        $botUsername = config('services.telegram.bot_username');

        return response()->json([
            'bot_username' => $botToken && $botUsername ? $botUsername : null,
        ]);
    }

    /**
     * Complete social profile (Telegram).
     */
    public function completeSocialProfile(Request $request): JsonResponse
    {
        // Completion is required when Telegram data lacks local profile fields.
        $validated = $request->validate([
            'completion_token' => ['required', 'string'],
            'locale' => ['required', 'string', Rule::in(['fa', 'en'])],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'username' => ['required', 'string', 'max:255'],
        ]);

        // Keep locale aligned with the UI initiating the completion flow.
        app()->setLocale($validated['locale']);

        // Load pending social payload from cache.
        $pending = Cache::get('social_login:'.$validated['completion_token']);

        if (! $pending) {
            throw ValidationException::withMessages([
                'completion_token' => ['Invalid or expired completion token.'],
            ]);
        }

        $userId = $pending['user_id'] ?? null;

        // Email is optional; if provided, enforce uniqueness.
        if (! empty($validated['email'])) {
            $emailExists = User::query()
                ->where('email', $validated['email'])
                ->when($userId, fn ($query) => $query->where('id', '!=', $userId))
                ->exists();

            if ($emailExists) {
                throw ValidationException::withMessages([
                    'email' => ['The email has already been taken.'],
                ]);
            }
        }

        // Ensure username does not collide with another user.
        $username = $validated['username'];

        $usernameExists = User::query()
            ->where('username', $username)
            ->when($userId, fn ($query) => $query->where('id', '!=', $userId))
            ->exists();

        if ($usernameExists) {
            $username = $username.'_'.substr(bin2hex(random_bytes(3)), 0, 6);
        }

        // Create or update user + social account atomically.
        $user = DB::transaction(function () use ($validated, $pending, $username): User {
            $account = SocialAccount::query()
                ->where('provider', $pending['provider'])
                ->where('provider_user_id', $pending['provider_user_id'])
                ->first();

            $user = $account?->user;

            if (! $user) {
                // Create new social-only user (password is intentionally null).
                $user = User::create([
                    'username' => $username,
                    'password' => null,
                    'first_name' => $validated['first_name'],
                    'last_name' => $validated['last_name'],
                    'email' => $validated['email'] ?? null,
                ]);
                // Newly created users always receive guest role.
                $guestRole = \App\Models\Role::query()->where('slug', 'guest')->first();
                if ($guestRole) {
                    $user->roles()->syncWithoutDetaching([$guestRole->id]);
                }
            } else {
                // Update the existing user profile for completion.
                $user->forceFill([
                    'username' => $username ?? $user->username,
                    'first_name' => $validated['first_name'],
                    'last_name' => $validated['last_name'],
                    'email' => $validated['email'] ?? $user->email,
                ])->save();
            }

            // Persist locale and mark the account verified for social flows.
            $user->forceFill([
                'admin_locale' => $validated['locale'],
                'email_verified_at' => now(),
            ])->save();

            // Ensure social account record exists.
            if (! $account) {
                SocialAccount::create([
                    'user_id' => $user->id,
                    'provider' => $pending['provider'],
                    'provider_user_id' => $pending['provider_user_id'],
                    'provider_email' => $pending['provider_email'] ?? null,
                    'provider_username' => $pending['provider_username'] ?? null,
                    'provider_name' => $pending['provider_name'] ?? null,
                    'data' => $pending['data'] ?? null,
                ]);
            }

            return $user;
        });

        // Clear the cached completion payload once processed.
        Cache::forget('social_login:'.$validated['completion_token']);

        return response()->json([
            'message' => 'Profile completed successfully.',
        ], 201);
    }

    /**
     * Link social account to an existing user.
     */
    public function linkSocialAccount(Request $request): JsonResponse
    {
        // Link an existing local account with Telegram identity.
        $validated = $request->validate([
            'completion_token' => ['required', 'string'],
            'locale' => ['required', 'string', Rule::in(['fa', 'en'])],
            'merge_login' => ['required', 'string'],
            'merge_password' => ['required', 'string'],
        ]);

        // Keep locale aligned with the UI initiating the merge flow.
        app()->setLocale($validated['locale']);

        // Read and validate the completion token from cache.
        $pending = Cache::get('social_login:'.$validated['completion_token']);

        if (! $pending) {
            throw ValidationException::withMessages([
                'completion_token' => ['Invalid or expired completion token.'],
            ]);
        }

        // Authenticate the user that will own the social account.
        $mergeUser = User::query()
            ->where('username', $validated['merge_login'])
            ->orWhere('email', $validated['merge_login'])
            ->first();

        if (! $mergeUser || ! $mergeUser->password || ! Hash::check($validated['merge_password'], $mergeUser->password)) {
            throw ValidationException::withMessages([
                'merge_password' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Update locale + verification in the linked account.
        $mergeUser->forceFill([
            'admin_locale' => $validated['locale'] ?? $mergeUser->admin_locale,
            'email_verified_at' => now(),
        ])->save();

        // Upsert the social account record.
        SocialAccount::updateOrCreate(
            [
                'provider' => $pending['provider'],
                'provider_user_id' => $pending['provider_user_id'],
            ],
            [
                'user_id' => $mergeUser->id,
                'provider_email' => $pending['provider_email'] ?? null,
                'provider_username' => $pending['provider_username'] ?? null,
                'provider_name' => $pending['provider_name'] ?? null,
                'data' => $pending['data'] ?? null,
            ]
        );

        Cache::forget('social_login:'.$validated['completion_token']);

        return response()->json([
            'message' => 'Profile linked successfully.',
        ], 201);
    }

    private function needsProfileCompletion(User $user): bool
    {
        // Require first/last name before allowing full login.
        return ! (filled($user->first_name) && filled($user->last_name));
    }
}
