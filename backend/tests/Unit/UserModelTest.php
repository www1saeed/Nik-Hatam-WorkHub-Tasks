<?php

namespace Tests\Unit;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class UserModelTest extends TestCase
{
    use DatabaseTransactions;

    public function test_username_mutator_normalizes_to_lowercase(): void
    {
        $user = User::factory()->create(['username' => 'MixedCaseUser']);
        $this->assertSame('mixedcaseuser', $user->username);
    }

    public function test_has_role_checks_role_slug(): void
    {
        $role = Role::query()->firstOrCreate(
            ['slug' => 'reception'],
            ['name' => 'Reception']
        );
        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        $this->assertTrue($user->hasRole('reception'));
        $this->assertFalse($user->hasRole('admin'));
    }

    public function test_has_permission_uses_roles_permissions_mapping(): void
    {
        $permission = Permission::query()->firstOrCreate(
            ['slug' => 'manage_users'],
            ['name' => 'Manage users']
        );
        $role = Role::query()->firstOrCreate(
            ['slug' => 'manager'],
            ['name' => 'Manager']
        );
        $role->permissions()->sync([$permission->id]);

        $user = User::factory()->create();
        $user->roles()->sync([$role->id]);

        $this->assertTrue($user->hasPermission('manage_users'));
        $this->assertFalse($user->hasPermission('manage_roles'));
    }

    public function test_admin_role_has_permission_bypass(): void
    {
        $adminRole = Role::query()->firstOrCreate(
            ['slug' => 'admin'],
            ['name' => 'Admin']
        );
        $user = User::factory()->create();
        $user->roles()->sync([$adminRole->id]);

        $this->assertTrue($user->hasPermission('any_permission'));
    }
}
