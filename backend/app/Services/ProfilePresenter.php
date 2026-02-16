<?php

namespace App\Services;

use App\Models\User;
use App\Support\JalaliDates;
use Illuminate\Support\Facades\Storage;

/**
 * ProfilePresenter
 *
 * Centralizes the profile payload shape for frontend consumption.
 * Keeps controllers thin and ensures admin/self profile responses stay aligned.
 */
class ProfilePresenter
{
    /**
     * Serialize a user into the profile payload used by the Angular app.
     *
     * @param User $user The user instance to serialize.
     * @return array<string, mixed> Normalized profile payload.
     */
    public function serialize(User $user): array
    {
        $socialProviders = $this->resolveSocialProviders($user);

        return [
            'id' => $user->id,
            'username' => $user->username,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'social_providers' => $socialProviders,
            // Always send Gregorian strings; client handles Jalali display.
            'birth_date' => JalaliDates::normalizeGregorian($user->birth_date),
            'id_number' => $user->id_number,
            'iban' => $user->iban,
            'phone_numbers' => $user->phone_numbers ?? [],
            'addresses' => $user->addresses ?? [],
            'admin_locale' => $user->admin_locale,
            'email_required' => count($socialProviders) === 0,
            'avatar_url' => $user->avatar_path
                ? Storage::disk('public')->url($user->avatar_path)
                : null,
        ];
    }

    /**
     * Return unique provider identifiers for linked social accounts.
     *
     * @param User $user
     * @return string[]
     */
    private function resolveSocialProviders(User $user): array
    {
        return $user->socialAccounts()
            ->pluck('provider')
            ->unique()
            ->values()
            ->all();
    }
}
