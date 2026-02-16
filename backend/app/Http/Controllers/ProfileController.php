<?php

namespace App\Http\Controllers;

use App\Support\JalaliDates;
use App\Support\Validators;
use App\Services\ProfilePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
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
    public function show(Request $request): JsonResponse
    {
        // Return the authenticated user's profile (Gregorian birth_date).
        $user = $request->user();

        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        // Locale is only used for UI hints; backend stores Gregorian dates.
        $locale = $request->query('locale')
            ?? $request->getPreferredLanguage(['fa', 'en'])
            ?? $user->admin_locale
            ?? app()->getLocale();

        return response()->json([
            'data' => $this->profilePresenter->serialize($user),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        // Update profile fields + optional avatar and password change.
        $user = $request->user();

        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        // Allow JSON arrays sent via multipart/form-data.
        $this->normalizeArrayInputs($request, ['phone_numbers', 'addresses']);

        // Locale is used for client display only.
        $locale = $request->input('locale')
            ?? $request->getPreferredLanguage(['fa', 'en'])
            ?? $user->admin_locale
            ?? app()->getLocale();
        // Ensure validation messages and responses use the requested locale.
        app()->setLocale($locale);

        // Email is required for normal users; optional if social login exists.
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
            'current_password' => ['nullable', 'string'],
            'new_password' => ['nullable', 'string', 'min:8', 'confirmed', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$/'],
            'locale' => ['nullable', 'in:fa,en'],
        ]);

        // Backend accepts only Gregorian format (YYYY-MM-DD).
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

        // Require current password when changing to a new one.
        if (! empty($validated['new_password'])) {
            if (empty($validated['current_password']) || ! Hash::check($validated['current_password'], $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => ['Current password is incorrect.'],
                ]);
            }

            $user->password = Hash::make($validated['new_password']);
        }

        // Store avatar to public disk if provided.
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
            'username' => ($validated['username'] ?? null) ?: $user->username,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'] ?? ($hasSocialAccounts ? null : $user->email),
            'id_number' => $validated['id_number'] ?? null,
            'iban' => $validated['iban'] ?? null,
            // Store as Gregorian date string.
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

    public function availability(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

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

    private function normalizeArrayInputs(Request $request, array $keys): void
    {
        // Convert JSON strings to arrays for multipart payloads.
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
}
