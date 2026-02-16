<?php

namespace Tests\Feature;

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_profile_show_requires_authentication(): void
    {
        $this->getJson('/api/profile')
            ->assertStatus(401)
            ->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_profile_show_non_json_request_does_not_redirect_to_login_route(): void
    {
        $this->get('/api/profile')
            ->assertStatus(401);
    }

    public function test_profile_show_returns_serialized_profile_payload(): void
    {
        $user = User::factory()->create([
            'username' => 'profile-user',
            'first_name' => 'Saeed',
            'last_name' => 'Hatami',
            'email' => 'saeed.profile@example.test',
            'birth_date' => '1990-07-12',
            'phone_numbers' => [['type' => 'mobile', 'number' => '09120000000']],
            'addresses' => [['type' => 'home', 'address' => 'Tehran']],
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.username', 'profile-user')
            ->assertJsonPath('data.first_name', 'Saeed')
            ->assertJsonPath('data.last_name', 'Hatami')
            ->assertJsonPath('data.email', 'saeed.profile@example.test')
            ->assertJsonPath('data.birth_date', '1990-07-12')
            ->assertJsonPath('data.email_required', true);
    }

    public function test_profile_update_updates_profile_fields(): void
    {
        $user = User::factory()->create([
            'username' => 'before-update',
            'email' => 'before@example.test',
            'password' => Hash::make('Secret123'),
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/profile', [
            'username' => 'After_Update',
            'first_name' => 'New',
            'last_name' => 'Name',
            'email' => 'after@example.test',
            'birth_date' => '1992-01-05',
            'id_number' => '0084575948',
            'iban' => 'IR820540102680020817909002',
            'phone_numbers' => [['type' => 'mobile', 'number' => '09121112222']],
            'addresses' => [['type' => 'home', 'address' => 'Shiraz']],
            'locale' => 'en',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.username', 'after_update')
            ->assertJsonPath('data.first_name', 'New')
            ->assertJsonPath('data.last_name', 'Name')
            ->assertJsonPath('data.email', 'after@example.test');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'username' => 'after_update',
            'first_name' => 'New',
            'last_name' => 'Name',
            'email' => 'after@example.test',
            'birth_date' => '1992-01-05',
            'id_number' => '0084575948',
            'iban' => 'IR820540102680020817909002',
        ]);
    }

    public function test_profile_update_rejects_duplicate_email(): void
    {
        $user = User::factory()->create(['email' => 'owner@example.test']);
        User::factory()->create(['email' => 'taken@example.test', 'username' => 'taken-user']);

        Sanctum::actingAs($user);

        $this->postJson('/api/profile', [
            'first_name' => 'Owner',
            'last_name' => 'User',
            'email' => 'taken@example.test',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_profile_update_rejects_invalid_birth_date_format(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/profile', [
            'first_name' => 'User',
            'last_name' => 'Test',
            'email' => 'valid@example.test',
            'birth_date' => '1403/05/20',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['birth_date']);
    }

    public function test_profile_update_requires_current_password_when_new_password_is_provided(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('Secret123'),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/profile', [
            'first_name' => 'User',
            'last_name' => 'Test',
            'email' => 'user@test.example',
            'new_password' => 'NewSecret123',
            'new_password_confirmation' => 'NewSecret123',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);
    }

    public function test_profile_update_allows_missing_email_for_users_with_social_accounts(): void
    {
        $user = User::factory()->create([
            'email' => 'social@example.test',
            'password' => Hash::make('Secret123'),
        ]);

        SocialAccount::query()->create([
            'user_id' => $user->id,
            'provider' => 'telegram',
            'provider_user_id' => '123456',
            'provider_username' => 'social_user',
            'provider_email' => null,
            'provider_name' => 'Social User',
            'data' => [],
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/profile', [
            'first_name' => 'Social',
            'last_name' => 'User',
            'email' => null,
        ])->assertOk()
            ->assertJsonPath('data.email', null)
            ->assertJsonPath('data.email_required', false);
    }

    public function test_profile_availability_detects_username_and_email_conflicts(): void
    {
        $user = User::factory()->create([
            'username' => 'owner_user',
            'email' => 'owner@example.test',
        ]);
        User::factory()->create([
            'username' => 'taken_user',
            'email' => 'taken@example.test',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/profile/availability?username=taken_user&email=taken@example.test')
            ->assertOk()
            ->assertJson([
                'username_available' => false,
                'email_available' => false,
            ]);
    }
}

