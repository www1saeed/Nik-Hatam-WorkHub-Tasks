<?php

namespace App\Services;

use App\Models\Guest;
use App\Models\Person;
use Illuminate\Database\Eloquent\ModelNotFoundException;

/**
 * Class GuestResolver
 *
 * Resolves a Guest by email, creating a Person + Guest when missing.
 */
class GuestResolver
{
    /**
     * Resolve or create a Guest by email.
     *
     * @param string $email
     * @param array<string, mixed> $personData
     * @param array<string, mixed> $guestData
     * @return Guest
     */
    public function resolve(string $email, array $personData = [], array $guestData = []): Guest
    {
        $person = Person::query()->where('email', $email)->first();

        if (! $person) {
            $person = Person::query()->create(array_merge($personData, ['email' => $email]));
        }

        $guest = $person->guests()->first();

        if (! $guest) {
            $guest = $person->guests()->create($guestData);
        }

        return $guest;
    }

    /**
     * Resolve an existing guest by email or throw if missing.
     *
     * @param string $email
     * @return Guest
     */
    public function requireGuest(string $email): Guest
    {
        $person = Person::query()->where('email', $email)->first();

        if (! $person) {
            throw new ModelNotFoundException('Person not found for email.');
        }

        $guest = $person->guests()->first();

        if (! $guest) {
            throw new ModelNotFoundException('Guest not found for email.');
        }

        return $guest;
    }
}
