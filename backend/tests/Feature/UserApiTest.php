<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_users_index_requires_authentication(): void
    {
        $this->getJson('/api/users')->assertStatus(401);
    }

    public function test_users_index_requires_manage_users_permission(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/users')->assertStatus(403);
    }

    public function test_users_index_returns_data_for_authorized_user(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        User::factory()->create(['username' => 'normal-user']);

        Sanctum::actingAs($authUser);
        $response = $this->getJson('/api/users');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'username', 'first_name', 'last_name', 'email', 'email_verified_at', 'roles']
                ]
            ]);
    }

    public function test_users_store_creates_user_with_guest_role_by_default(): void
    {
        $guest = Role::query()->firstOrCreate(
            ['slug' => 'guest'],
            ['name' => 'Guest']
        );
        $authUser = $this->createUserWithPermission('manage_users');
        Sanctum::actingAs($authUser);

        $response = $this->postJson('/api/users', [
            'first_name' => 'New',
            'last_name' => 'User',
            'email' => 'new-user@example.test',
            'password' => 'Secret123',
            'locale' => 'en',
        ]);

        $response->assertStatus(201);
        $created = User::where('email', 'new-user@example.test')->firstOrFail();
        $this->assertTrue($created->roles()->where('roles.id', $guest->id)->exists());
    }

    public function test_users_store_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'dup@example.test', 'username' => 'dup1']);
        $authUser = $this->createUserWithPermission('manage_users');
        Sanctum::actingAs($authUser);

        $this->postJson('/api/users', [
            'first_name' => 'Dup',
            'last_name' => 'User',
            'email' => 'dup@example.test',
            'password' => 'Secret123',
            'locale' => 'en',
        ])->assertStatus(422);
    }

    public function test_users_update_rejects_duplicate_username(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        $existing = User::factory()->create(['username' => 'existing-user']);
        $target = User::factory()->create(['username' => 'target-user']);
        Sanctum::actingAs($authUser);

        $this->putJson("/api/users/{$target->id}", [
            'username' => $existing->username,
            'first_name' => 'T',
            'last_name' => 'User',
            'email' => $target->email,
        ])->assertStatus(422);
    }

    public function test_users_destroy_deletes_resource(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        $target = User::factory()->create();
        Sanctum::actingAs($authUser);

        $this->deleteJson("/api/users/{$target->id}")->assertStatus(204);
        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }

    public function test_users_update_returns_404_for_missing_user(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        Sanctum::actingAs($authUser);

        $this->putJson('/api/users/999999', [
            'username' => 'no-user',
            'first_name' => 'No',
            'last_name' => 'User',
        ])->assertStatus(404);
    }

    public function test_users_password_reset_requires_email(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        $target = User::factory()->create(['email' => null]);
        Sanctum::actingAs($authUser);

        $this->postJson("/api/users/{$target->id}/password/reset", [
            'locale' => 'en',
        ])->assertStatus(422);
    }

    public function test_users_availability_detects_conflicts(): void
    {
        $authUser = $this->createUserWithPermission('manage_users');
        $target = User::factory()->create(['username' => 'target_1', 'email' => 'target@example.test']);
        User::factory()->create(['username' => 'taken_user', 'email' => 'taken@example.test']);
        Sanctum::actingAs($authUser);

        $this->getJson("/api/users/{$target->id}/profile/availability?username=taken_user&email=taken@example.test")
            ->assertOk()
            ->assertJson([
                'username_available' => false,
                'email_available' => false,
            ]);
    }

    private function createUserWithPermission(string $permissionSlug): User
    {
        $permission = Permission::query()->firstOrCreate(
            ['slug' => $permissionSlug],
            ['name' => ucfirst(str_replace('_', ' ', $permissionSlug))]
        );

        $role = Role::query()->firstOrCreate(
            ['slug' => 'manager-'.$permissionSlug],
            ['name' => 'Manager '.ucfirst($permissionSlug)]
        );
        $role->permissions()->sync([$permission->id]);

        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
