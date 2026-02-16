<?php

namespace App\Services;

class TelegramAuthService
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function isValid(array $payload, string $botToken, int $ttlSeconds): bool
    {
        if (! isset($payload['hash'], $payload['auth_date'])) {
            return false;
        }

        if ($ttlSeconds > 0 && (time() - (int) $payload['auth_date']) > $ttlSeconds) {
            return false;
        }

        $hash = $payload['hash'];
        $data = $payload;
        unset($data['hash']);

        ksort($data);

        $checkString = collect($data)
            ->map(fn ($value, $key) => $key.'='.$value)
            ->implode("\n");

        $secretKey = hash('sha256', $botToken, true);
        $signature = hash_hmac('sha256', $checkString, $secretKey);

        return hash_equals($signature, $hash);
    }
}
