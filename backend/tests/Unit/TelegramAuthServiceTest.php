<?php

namespace Tests\Unit;

use App\Services\TelegramAuthService;
use Tests\TestCase;

class TelegramAuthServiceTest extends TestCase
{
    public function test_rejects_payload_without_hash_or_auth_date(): void
    {
        $service = new TelegramAuthService();
        $this->assertFalse($service->isValid([], 'token', 3600));
    }

    public function test_rejects_expired_payload_by_ttl(): void
    {
        $service = new TelegramAuthService();
        $payload = [
            'id' => '1',
            'auth_date' => time() - 7200,
            'first_name' => 'Saeed',
            'hash' => 'invalid',
        ];

        $this->assertFalse($service->isValid($payload, 'token', 60));
    }

    public function test_accepts_valid_signature_payload(): void
    {
        $service = new TelegramAuthService();
        $botToken = 'sample-bot-token';
        $payload = [
            'id' => '123',
            'auth_date' => time(),
            'first_name' => 'Saeed',
            'username' => 'saeed',
        ];

        $data = $payload;
        ksort($data);
        $checkString = collect($data)->map(fn ($value, $key) => $key.'='.$value)->implode("\n");
        $secret = hash('sha256', $botToken, true);
        $payload['hash'] = hash_hmac('sha256', $checkString, $secret);

        $this->assertTrue($service->isValid($payload, $botToken, 3600));
    }
}

