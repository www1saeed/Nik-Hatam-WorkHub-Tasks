<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_task_assignment_creates_notification_with_task_payload_and_can_be_marked_read(): void
    {
        $manager = User::factory()->create([
            'first_name' => 'Manager',
            'last_name' => 'User',
            'username' => 'manager_user',
        ]);
        $assignee = User::factory()->create();
        $this->grantManageStaffs($manager);
        $this->attachStaffRole($assignee);

        Sanctum::actingAs($manager);
        $createResponse = $this->postJson('/api/tasks', [
            'title' => 'Assign notification test',
            'assigned_user_ids' => [$assignee->id],
            'status' => 'open',
        ])->assertCreated();

        $taskId = (int) $createResponse->json('data.id');

        Sanctum::actingAs($assignee);
        $listResponse = $this->getJson('/api/notifications?limit=10')
            ->assertOk()
            ->assertJsonPath('meta.unread_count', 1)
            ->assertJsonPath('data.0.event', 'task_assigned')
            ->assertJsonPath('data.0.task_id', $taskId);

        $notificationId = (string) $listResponse->json('data.0.id');

        $this->postJson("/api/notifications/{$notificationId}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true)
            ->assertJsonPath('meta.unread_count', 0);
    }

    public function test_task_comment_creates_notification_for_other_participants(): void
    {
        $creator = User::factory()->create();
        $assignee = User::factory()->create();
        $this->grantManageTasks($creator);
        $this->grantManageTasks($assignee);
        $this->attachStaffRole($assignee);

        $task = Task::query()->create([
            'title' => 'Comment notification test',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $task->assignedUsers()->sync([$assignee->id]);

        Sanctum::actingAs($creator);
        $this->postJson("/api/tasks/{$task->id}/comments", [
            'comment' => 'Please check this room quickly.',
        ])->assertOk();

        Sanctum::actingAs($assignee);
        $this->getJson('/api/notifications?limit=10')
            ->assertOk()
            ->assertJsonPath('data.0.event', 'task_comment')
            ->assertJsonPath('data.0.task_id', $task->id)
            ->assertJsonPath('meta.unread_count', 1);
    }

    public function test_mark_all_read_sets_unread_count_to_zero(): void
    {
        $manager = User::factory()->create();
        $staffA = User::factory()->create();
        $staffB = User::factory()->create();
        $this->grantManageStaffs($manager);
        $this->attachStaffRole($staffA);
        $this->attachStaffRole($staffB);

        Sanctum::actingAs($manager);
        $this->postJson('/api/tasks', [
            'title' => 'Bulk read test A',
            'assigned_user_ids' => [$staffA->id],
        ])->assertCreated();
        $this->postJson('/api/tasks', [
            'title' => 'Bulk read test B',
            'assigned_user_ids' => [$staffA->id, $staffB->id],
        ])->assertCreated();

        Sanctum::actingAs($staffA);
        $this->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 2);

        $this->postJson('/api/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('meta.unread_count', 0);

        $this->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);
    }

    private function grantManageTasks(User $user): void
    {
        $this->grantPermission($user, 'manage_tasks');
    }

    private function grantManageStaffs(User $user): void
    {
        $this->grantPermission($user, 'manage_staffs');
    }

    private function grantPermission(User $user, string $permissionSlug): void
    {
        $permission = Permission::query()->firstOrCreate(
            ['slug' => $permissionSlug],
            ['name' => ucfirst(str_replace('_', ' ', $permissionSlug))]
        );

        $role = Role::query()->firstOrCreate(
            ['slug' => 'test_' . $permissionSlug . '_notifications'],
            ['name' => 'Test ' . ucfirst(str_replace('_', ' ', $permissionSlug)) . ' notifications']
        );

        $role->permissions()->syncWithoutDetaching([$permission->id]);
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    private function attachStaffRole(User $user): void
    {
        $staffRole = Role::query()->firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff']
        );
        $user->roles()->syncWithoutDetaching([$staffRole->id]);
    }
}
