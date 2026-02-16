<?php

namespace App\Services;

use App\Models\User;
use App\Models\VerificationCode;
use Illuminate\Support\Facades\Hash;

class VerificationCodeService
{
    public function createForUser(User $user, string $channel, string $destination): string
    {
        $code = (string) random_int(100000, 999999);

        VerificationCode::create([
            'user_id' => $user->id,
            'channel' => $channel,
            'destination' => $destination,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes($this->ttlMinutes()),
        ]);

        return $code;
    }

    public function verify(string $channel, string $destination, string $code): ?VerificationCode
    {
        $record = VerificationCode::query()
            ->where('channel', $channel)
            ->where('destination', $destination)
            ->whereNull('consumed_at')
            ->orderByDesc('id')
            ->first();

        if (! $record || $record->expires_at->isPast()) {
            return null;
        }

        if (! Hash::check($code, $record->code_hash)) {
            return null;
        }

        $record->forceFill([
            'consumed_at' => now(),
        ])->save();

        return $record;
    }

    private function ttlMinutes(): int
    {
        return (int) config('auth.verification_code_ttl', 15);
    }
}
