<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use App\Notifications\AdminCreatedUserNotification;
use App\Notifications\PasswordResetNotification;
use App\Services\PasswordResetLinkService;
use App\Services\ProfilePresenter;
use App\Support\JalaliDates;
use App\Support\Validators;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

/**
 * Handles user management endpoints.
 */
class UserController extends Controller
{
    /**
     * @var ProfilePresenter
     */
    private ProfilePresenter $profilePresenter;

    /**
     * Inject shared profile presenter for consistent payloads.
     */
    public function __construct(ProfilePresenter $profilePresenter)
    {
        $this->profilePresenter = $profilePresenter;
    }
    /**
     * List users.
     */
    public function index(Request $request): JsonResponse
    {
        // Only allowed for users with manage_users (admin bypass handled in model).
        $this->ensurePermission($request, 'manage_users');

        // Load roles to render chips in the UI without extra requests.
        // Sorting is done on the server to keep the UI consistent.
        $users = \App\Models\User::query()
            ->with(['roles', 'socialAccounts'])
            ->orderBy('id', 'desc')
            ->get()
            ->map(fn ($user) => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'email_verified_at' => $user->email_verified_at,
                'social_providers' => $user->socialAccounts
                    ->pluck('provider')
                    ->unique()
                    ->values()
                    ->all(),
                'roles' => $user->roles->map(fn ($role) => [
                    'id' => $role->id,
                    'name' => $role->name,
                    'slug' => $role->slug,
                ]),
            ]);

        return response()->json(['data' => $users]);
    }

    /**
     * Create a user.
     */
    public function store(Request $request): JsonResponse
    {
        // Only allowed for users with manage_users.
        $this->ensurePermission($request, 'manage_users');

        // Username is optional when email is provided; otherwise required.
        // Role ids are optional (guest role is assigned if missing).
        $validated = $request->validate([
            'username' => ['nullable', 'string', 'max:255', Rule::unique('users', 'username'), 'required_without:email'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$/'],
            'role_ids' => ['nullable', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
            'locale' => ['nullable', 'string', Rule::in(['fa', 'en'])],
        ]);

        // Auto-generate a unique username if missing.
        $username = $validated['username'] ?? null;
        if (! $username) {
            $username = $this->generateUniqueUsername(
                $validated['email'] ?? null,
                $validated['first_name'],
                $validated['last_name']
            );
        }

        // Persist user with hashed password.
        $user = \App\Models\User::create([
            'username' => $username,
            'password' => Hash::make($validated['password']),
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'] ?? null,
            'email_verified_at' => now(),
        ]);

        // Assign roles if provided; otherwise default to guest.
        if (! empty($validated['role_ids'])) {
            $user->roles()->sync($validated['role_ids']);
        } else {
            $guest = \App\Models\Role::query()->where('slug', 'guest')->first();
            if ($guest) {
                $user->roles()->sync([$guest->id]);
            }
        }

        // Send credentials email when an email address is provided.
        if ($user->email) {
            $locale = $validated['locale'] ?? $user->admin_locale ?? app()->getLocale();
            app()->setLocale($locale);
            $loginUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/').'/login';
            $user->notify(new AdminCreatedUserNotification($user->username, $validated['password'], $loginUrl));
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
            ],
        ], 201);
    }

    /**
     * Show a user.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        // Only allowed for users with manage_users.
        $this->ensurePermission($request, 'manage_users');

        // Load roles for editing.
        $user = \App\Models\User::query()
            ->with(['roles'])
            ->findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'roles' => $user->roles->map(fn ($role) => [
                    'id' => $role->id,
                    'name' => $role->name,
                    'slug' => $role->slug,
                ]),
            ],
        ]);
    }

    /**
     * Show a user's full profile (admin only).
     */
    public function showProfile(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_users');

        $user = \App\Models\User::findOrFail($id);

        $locale = $request->query('locale')
            ?? $request->getPreferredLanguage(['fa', 'en'])
            ?? $user->admin_locale
            ?? app()->getLocale();

        return response()->json([
            'data' => $this->profilePresenter->serialize($user),
        ]);
    }

    /**
     * Update a user.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        // Only allowed for users with manage_users.
        $this->ensurePermission($request, 'manage_users');

        // Load user or fail fast.
        $user = \App\Models\User::findOrFail($id);

        // Validate update payload; password is optional here.
        $validated = $request->validate([
            'username' => ['required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:8', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$/'],
            'role_ids' => ['nullable', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
        ]);

        // Update basic identity fields.
        $user->forceFill([
            'username' => $validated['username'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'] ?? null,
        ])->save();

        // Update password only if provided.
        if (! empty($validated['password'])) {
            $user->forceFill([
                'password' => Hash::make($validated['password']),
            ])->save();
        }

        // Sync roles only if field is present in payload.
        if (array_key_exists('role_ids', $validated)) {
            $user->roles()->sync($validated['role_ids'] ?? []);
        }

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
            ],
        ]);
    }

    /**
     * Update a user's full profile (admin only).
     */
    public function updateProfile(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_users');

        $user = \App\Models\User::findOrFail($id);

        $this->normalizeArrayInputs($request, ['phone_numbers', 'addresses']);

        $locale = $request->input('locale')
            ?? $request->getPreferredLanguage(['fa', 'en'])
            ?? $user->admin_locale
            ?? app()->getLocale();
        // Ensure validation messages and responses use the requested locale.
        app()->setLocale($locale);

        $hasSocialAccounts = $user->socialAccounts()->exists();

        $validated = $request->validate([
            'username' => ['nullable', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => [
                $hasSocialAccounts ? 'nullable' : 'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'birth_date' => ['nullable', 'string'],
            'id_number' => ['nullable', 'string', 'max:255'],
            'iban' => ['nullable', 'string', 'max:255'],
            'phone_numbers' => ['nullable', 'array'],
            'addresses' => ['nullable', 'array'],
            'avatar' => ['nullable', 'image', 'max:2048'],
            'remove_avatar' => ['nullable', 'boolean'],
            'locale' => ['nullable', 'in:fa,en'],
        ]);

        if (! Validators::isValidBirthDateFormat($validated['birth_date'] ?? null)) {
            throw ValidationException::withMessages([
                'birth_date' => ['Birth date format is invalid.'],
            ]);
        }

        if (! empty($validated['id_number']) && ! Validators::isValidIranianIdNumber($validated['id_number'])) {
            throw ValidationException::withMessages([
                'id_number' => ['ID number is invalid.'],
            ]);
        }

        if (! empty($validated['iban']) && ! Validators::isValidIban($validated['iban'])) {
            throw ValidationException::withMessages([
                'iban' => ['IBAN is invalid.'],
            ]);
        }

        $avatarPath = $user->avatar_path;
        $removeAvatar = (bool) ($validated['remove_avatar'] ?? false);

        if ($removeAvatar && $avatarPath) {
            Storage::disk('public')->delete($avatarPath);
            $avatarPath = null;
        }

        if ($request->hasFile('avatar')) {
            if ($avatarPath) {
                Storage::disk('public')->delete($avatarPath);
            }
            $avatarPath = $request->file('avatar')->store('avatars', 'public');
        }

        $user->forceFill([
            'username' => $validated['username'] ?: $user->username,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'] ?? ($hasSocialAccounts ? null : $user->email),
            'id_number' => $validated['id_number'] ?? null,
            'iban' => $validated['iban'] ?? null,
            'birth_date' => JalaliDates::normalizeGregorian($validated['birth_date'] ?? null),
            'phone_numbers' => array_values(array_filter(
                $validated['phone_numbers'] ?? [],
                fn ($item) => ! empty($item['number'])
            )),
            'addresses' => array_values(array_filter(
                $validated['addresses'] ?? [],
                fn ($item) => ! empty($item['address'])
            )),
            'avatar_path' => $avatarPath,
        ])->save();

        return response()->json([
            'message' => 'Profile updated.',
            'data' => $this->profilePresenter->serialize($user->fresh()),
        ]);
    }

    /**
     * Check username/email availability for a specific user (admin only).
     */
    public function availability(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_users');

        $user = \App\Models\User::findOrFail($id);

        $validated = $request->validate([
            'username' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        $username = $validated['username'] ?? null;
        $email = $validated['email'] ?? null;

        $usernameAvailable = true;
        if ($username !== null && $username !== '' && $username !== $user->username) {
            $usernameAvailable = ! \App\Models\User::query()
                ->where('username', $username)
                ->where('id', '!=', $user->id)
                ->exists();
        }

        $emailAvailable = true;
        if ($email !== null && $email !== '' && $email !== $user->email) {
            $emailAvailable = ! \App\Models\User::query()
                ->where('email', $email)
                ->where('id', '!=', $user->id)
                ->exists();
        }

        return response()->json([
            'username_available' => $usernameAvailable,
            'email_available' => $emailAvailable,
        ]);
    }

    /**
     * Delete a user.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        // Only allowed for users with manage_users.
        $this->ensurePermission($request, 'manage_users');

        // Detach roles to keep pivot table clean.
        $user = \App\Models\User::findOrFail($id);
        $user->roles()->detach();
        $user->delete();

        return response()->json([], 204);
    }

    /**
     * Send a password reset email for a user (admin action).
     */
    public function sendPasswordReset(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_users');

        $validated = $request->validate([
            'locale' => ['nullable', 'string', Rule::in(['fa', 'en'])],
        ]);

        $user = \App\Models\User::findOrFail($id);

        if (! $user->email) {
            return response()->json([
                'message' => 'User does not have an email address.',
            ], 422);
        }

        $locale = $validated['locale'] ?? $user->admin_locale ?? app()->getLocale();
        app()->setLocale($locale);

        $token = Password::broker()->createToken($user);
        $user->notify(new PasswordResetNotification($token, $user->email));

        return response()->json([
            'message' => 'Password reset email sent.',
        ]);
    }

    /**
     * Create a password reset link (admin action), used for QR codes.
     */
    public function createPasswordResetLink(
        Request $request,
        int $id,
        PasswordResetLinkService $passwordResetLinkService
    ): JsonResponse {
        $this->ensurePermission($request, 'manage_users');

        $user = \App\Models\User::findOrFail($id);
        $payload = $passwordResetLinkService->create($user);
        $url = $passwordResetLinkService->buildUrl($payload['login'], $payload['token']);

        return response()->json([
            'data' => [
                'url' => $url,
                'token' => $payload['token'],
            ],
        ]);
    }

    /**
     * Abort with 403 when the current user lacks a permission.
     */
    private function ensurePermission(Request $request, string $permission): void
    {
        // Centralized permission gate for admin endpoints.
        $user = $request->user();
        if (! $user || ! $user->hasPermission($permission)) {
            abort(403, 'Forbidden.');
        }
    }

    private function normalizeArrayInputs(Request $request, array $keys): void
    {
        foreach ($keys as $key) {
            $value = $request->input($key);
            if (is_string($value)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $request->merge([$key => $decoded]);
                }
            }
        }
    }

    // Serialization now lives in ProfilePresenter to avoid duplication.

    /**
     * Generate a unique username from email or name.
     * Sanitizes the value and ensures collision-free output.
     */
    private function generateUniqueUsername(?string $email, string $firstName, string $lastName): string
    {
        $base = '';
        if ($email) {
            $base = Str::before($email, '@');
        } elseif ($firstName || $lastName) {
            $base = trim($firstName.' '.$lastName);
        }

        // Normalize to safe, lowercase characters.
        $base = Str::of($base)
            ->lower()
            ->replaceMatches('/[^a-z0-9._-]+/', '')
            ->trim('.-')
            ->limit(24, '')
            ->toString();

        // Fallback base when everything is filtered out.
        if ($base === '') {
            $base = 'user';
        }

        // Append numeric suffix until unique.
        $candidate = $base;
        $suffix = 1;
        while (\App\Models\User::where('username', $candidate)->exists()) {
            $candidate = $base.$suffix;
            $suffix++;
            if ($suffix > 9999) {
                // Last-resort random suffix to break long collisions.
                $candidate = $base.Str::random(4);
                if (! \App\Models\User::where('username', $candidate)->exists()) {
                    break;
                }
            }
        }

        return $candidate;
    }
}
