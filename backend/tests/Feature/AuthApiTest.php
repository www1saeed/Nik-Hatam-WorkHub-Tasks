<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\VerificationCodeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_auth_me_returns_401_for_unauthenticated_requests(): void
    {
        $this->getJson('/api/auth/me')
            ->assertStatus(401)
            ->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_auth_me_non_json_request_does_not_redirect_to_login_route(): void
    {
        $this->get('/api/auth/me')
            ->assertStatus(401);
    }

    public function test_register_creates_user_and_returns_201(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/auth/register', [
            'locale' => 'en',
            'first_name' => 'Saeed',
            'last_name' => 'Hatami',
            'email' => 'saeed@example.test',
            'password' => 'Secret123',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', [
            'email' => 'saeed@example.test',
            'first_name' => 'Saeed',
            'last_name' => 'Hatami',
        ]);
    }

    public function test_register_rejects_duplicate_email(): void
    {
        User::factory()->create([
            'email' => 'duplicate@example.test',
            'username' => 'duplicate',
        ]);

        $this->postJson('/api/auth/register', [
            'locale' => 'en',
            'first_name' => 'Saeed',
            'last_name' => 'Hatami',
            'email' => 'duplicate@example.test',
            'password' => 'Secret123',
        ])->assertStatus(422);
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        $username = 'admin-'.uniqid();
        User::factory()->create([
            'username' => $username,
            'password' => Hash::make('Secret123'),
        ]);

        $this->postJson('/api/auth/login', [
            'login' => $username,
            'password' => 'Wrong123',
        ])->assertStatus(422);
    }

    public function test_login_rejects_unverified_email(): void
    {
        User::factory()->create([
            'username' => 'pending',
            'email' => 'pending@example.test',
            'email_verified_at' => null,
            'password' => Hash::make('Secret123'),
        ]);

        $this->postJson('/api/auth/login', [
            'login' => 'pending',
            'password' => 'Secret123',
        ])->assertStatus(422);
    }

    public function test_register_rejects_invalid_and_malicious_input(): void
    {
        $this->postJson('/api/auth/register', [
            'locale' => 'en',
            'first_name' => '<script>alert(1)</script>',
            'last_name' => 'User',
            'email' => 'not-an-email',
            'username' => "' OR 1=1 --",
            'password' => 'short',
        ])->assertStatus(422);
    }

    public function test_verify_email_marks_user_verified(): void
    {
        $user = User::factory()->create([
            'email' => 'verify@example.test',
            'email_verified_at' => null,
        ]);

        $service = app(VerificationCodeService::class);
        $code = $service->createForUser($user, 'email', 'verify@example.test');

        $this->postJson('/api/auth/verify-email', [
            'email' => 'verify@example.test',
            'code' => $code,
        ])->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
