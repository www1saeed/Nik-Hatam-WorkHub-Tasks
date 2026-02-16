<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            'manage_users' => 'Manage Users',
            'manage_roles' => 'Manage Roles',
            'manage_permissions' => 'Manage Permissions',
            'manage_system_configurations' => 'Manage System Configurations',
            'manage_staffs' => 'Manage Staffs',
            'manage_tasks' => 'Manage Tasks',
        ];

        foreach ($permissions as $slug => $name) {
            Permission::updateOrCreate(['slug' => $slug], ['name' => $name, 'slug' => $slug]);
        }
    }
}
