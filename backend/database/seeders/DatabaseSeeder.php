<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds the application with default data.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            PermissionSeeder::class,
        ]);

        $user = User::query()->firstOrCreate(
            ['username' => 'admin'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'email' => 'admin@example.com',
                'password' => Hash::make('Admin123!'),
                'admin_locale' => 'fa',
                'email_verified_at' => now(),
            ]
        );

        $adminRole = Role::query()->where('slug', 'admin')->first();

        if ($adminRole) {
            $adminRole->permissions()->syncWithoutDetaching(Permission::query()->pluck('id'));
            $user->roles()->syncWithoutDetaching([$adminRole->id]);
        }
    }
}
