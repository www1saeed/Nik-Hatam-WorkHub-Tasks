<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Photo;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskPhotoApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_photo_file_endpoint_requires_task_permissions_even_for_config_manager(): void
    {
        Storage::disk('local')->put('task-attachments/test/photo-access-test.jpg', 'fake-image');

        $creator = User::factory()->create();
        $taskUser = User::factory()->create();
        $configUser = User::factory()->create();
        $outsider = User::factory()->create();

        $this->grantManageTasks($taskUser);
        $this->grantPermission($configUser, 'manage_system_configurations');

        $task = Task::query()->create([
            'title' => 'Photo access test',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $task->assignedUsers()->sync([$taskUser->id]);

        $photo = Photo::query()->create([
            'task_id' => $task->id,
            'uploaded_by' => $creator->id,
            'album_key' => 'tasks',
            'reference_type' => 'task',
            'reference_id' => $task->id,
            'title' => 'test-image',
            'disk' => 'local',
            'path' => 'task-attachments/test/photo-access-test.jpg',
            'original_name' => 'photo-access-test.jpg',
            'mime_type' => 'image/jpeg',
            'size_bytes' => 10,
        ]);

        Sanctum::actingAs($outsider);
        $this->get("/api/photos/{$photo->id}/file")->assertStatus(403);

        Sanctum::actingAs($configUser);
        $this->get("/api/photos/{$photo->id}/file")->assertStatus(403);
    }

    private function grantManageTasks(User $user): void
    {
        $this->grantPermission($user, 'manage_tasks');
    }

    private function grantPermission(User $user, string $permissionSlug): void
    {
        $permission = Permission::query()->firstOrCreate(
            ['slug' => $permissionSlug],
            ['name' => ucfirst(str_replace('_', ' ', $permissionSlug))]
        );

        $role = Role::query()->firstOrCreate(
            ['slug' => 'test_' . $permissionSlug . '_photos'],
            ['name' => 'Test ' . ucfirst(str_replace('_', ' ', $permissionSlug)) . ' photos']
        );

        $role->permissions()->syncWithoutDetaching([$permission->id]);
        $user->roles()->syncWithoutDetaching([$role->id]);
    }
}
