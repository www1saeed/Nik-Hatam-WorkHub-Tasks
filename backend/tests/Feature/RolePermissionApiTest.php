<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolePermissionApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_roles_index_allows_manage_users_permission(): void
    {
        $user = $this->createUserWithPermission('manage_users');
        Sanctum::actingAs($user);

        $this->getJson('/api/roles')->assertOk();
    }

    public function test_permissions_index_allows_manage_roles_permission(): void
    {
        $user = $this->createUserWithPermission('manage_roles');
        Sanctum::actingAs($user);

        $this->getJson('/api/permissions')->assertOk();
    }

    public function test_permissions_store_requires_manage_permissions(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/permissions', [
            'name' => 'Manage X',
            'slug' => 'manage_x',
        ])->assertStatus(403);
    }

    public function test_roles_store_and_update_validation(): void
    {
        $user = $this->createUserWithPermission('manage_roles');
        Sanctum::actingAs($user);
        $slug = 'reception-'.uniqid();

        $create = $this->postJson('/api/roles', [
            'name' => 'Reception',
            'slug' => $slug,
        ]);
        $create->assertStatus(201);

        $roleId = $create->json('data.id');
        $this->putJson("/api/roles/{$roleId}", [
            'name' => 'Reception 2',
            'slug' => $slug,
        ])->assertOk();
    }

    public function test_roles_index_forbidden_without_permissions(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/roles')->assertStatus(403);
    }

    public function test_permissions_index_forbidden_without_permissions(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/permissions')->assertStatus(403);
    }

    public function test_role_and_permission_show_return_404_for_missing_resource(): void
    {
        $roleManager = $this->createUserWithPermission('manage_roles');
        Sanctum::actingAs($roleManager);
        $this->getJson('/api/roles/999999')->assertStatus(404);

        $permissionManager = $this->createUserWithPermission('manage_permissions');
        Sanctum::actingAs($permissionManager);
        $this->getJson('/api/permissions/999999')->assertStatus(404);
    }

    private function createUserWithPermission(string $permissionSlug): User
    {
        $permission = Permission::query()->firstOrCreate(
            ['slug' => $permissionSlug],
            ['name' => ucfirst(str_replace('_', ' ', $permissionSlug))]
        );
        $role = Role::query()->firstOrCreate(
            ['slug' => 'role-'.$permissionSlug],
            ['name' => 'Role '.ucfirst($permissionSlug)]
        );
        $role->permissions()->sync([$permission->id]);

        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
