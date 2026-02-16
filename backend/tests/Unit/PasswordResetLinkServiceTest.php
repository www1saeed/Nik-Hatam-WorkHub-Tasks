<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\PasswordResetLinkService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PasswordResetLinkServiceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_create_returns_email_flow_for_users_with_email(): void
    {
        $service = app(PasswordResetLinkService::class);
        $user = User::factory()->create(['email' => 'email-user@example.test']);

        $payload = $service->create($user);

        $this->assertSame('email', $payload['type']);
        $this->assertSame('email-user@example.test', $payload['login']);
        $this->assertNotEmpty($payload['token']);
    }

    public function test_create_returns_username_flow_for_users_without_email(): void
    {
        $service = app(PasswordResetLinkService::class);
        $user = User::factory()->create(['email' => null, 'username' => 'no-email-user']);

        $payload = $service->create($user);

        $this->assertSame('username', $payload['type']);
        $this->assertSame('no-email-user', $payload['login']);
        $this->assertNotEmpty(Cache::get('password_reset_username:'.$payload['token']));
    }

    public function test_validate_and_forget_username_token(): void
    {
        $service = app(PasswordResetLinkService::class);
        $user = User::factory()->create(['email' => null, 'username' => 'username-reset']);
        $payload = $service->create($user);

        $resolved = $service->validateUsernameToken('username-reset', $payload['token']);
        $this->assertNotNull($resolved);
        $this->assertSame($user->id, $resolved?->id);

        $service->forgetUsernameToken($payload['token']);
        $this->assertNull($service->validateUsernameToken('username-reset', $payload['token']));
    }
}
