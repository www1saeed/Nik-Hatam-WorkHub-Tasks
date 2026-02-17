<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use DatabaseTransactions;

    public function test_assigned_user_sees_task_in_index_and_unassigned_user_does_not(): void
    {
        $assigned = User::factory()->create();
        $unassigned = User::factory()->create();
        $creator = User::factory()->create();

        $this->grantManageTasks($assigned);
        $this->grantManageTasks($unassigned);
        $this->grantManageTasks($creator);

        $task = Task::query()->create([
            'title' => 'Assigned visibility test',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $task->assignedUsers()->sync([$assigned->id]);

        Sanctum::actingAs($assigned);
        $this->getJson('/api/tasks')
            ->assertOk()
            ->assertJsonFragment(['id' => $task->id]);

        Sanctum::actingAs($unassigned);
        $this->getJson('/api/tasks')
            ->assertOk()
            ->assertJsonMissing(['id' => $task->id]);
    }

    public function test_assigned_user_can_add_comment_and_unassigned_user_cannot(): void
    {
        $assigned = User::factory()->create();
        $outsider = User::factory()->create();
        $creator = User::factory()->create();

        $this->grantManageTasks($assigned);
        $this->grantManageTasks($outsider);
        $this->grantManageTasks($creator);

        $task = Task::query()->create([
            'title' => 'Comment access test',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $task->assignedUsers()->sync([$assigned->id]);

        Sanctum::actingAs($outsider);
        $this->postJson("/api/tasks/{$task->id}/comments", ['comment' => 'outsider'])
            ->assertStatus(403);

        Sanctum::actingAs($assigned);
        $this->postJson("/api/tasks/{$task->id}/comments", ['comment' => 'assigned comment'])
            ->assertOk()
            ->assertJsonPath('data.comments.0.comment', 'assigned comment')
            ->assertJsonPath('data.comments.0.is_system', false)
            ->assertJsonPath('data.comments.0.user.id', $assigned->id);
    }

    public function test_assignees_endpoint_returns_only_staff_users(): void
    {
        $manager = User::factory()->create();
        $staff = User::factory()->create();
        $nonStaff = User::factory()->create();

        $this->grantManageStaffs($manager);
        $this->attachStaffRole($staff);

        Sanctum::actingAs($manager);
        $response = $this->getJson('/api/tasks/assignees')
            ->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();
        $this->assertContains($staff->id, $ids);
        $this->assertNotContains($nonStaff->id, $ids);
    }

    public function test_creator_cannot_delete_task_with_real_comment_but_manager_can(): void
    {
        $creator = User::factory()->create();
        $this->grantManageTasks($creator);

        $task = Task::query()->create([
            'title' => 'Delete gate by real comment',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $task->comments()->create([
            'user_id' => $creator->id,
            'comment' => 'real note',
            'is_system' => false,
        ]);

        Sanctum::actingAs($creator);
        $this->deleteJson("/api/tasks/{$task->id}")
            ->assertStatus(403);

        $manager = User::factory()->create();
        $this->grantManageStaffs($manager);

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/tasks/{$task->id}")
            ->assertNoContent();
    }

    public function test_manager_can_filter_tasks_by_assigned_user_and_staff_cannot_use_filter(): void
    {
        $manager = User::factory()->create();
        $this->grantManageStaffs($manager);

        $staffA = User::factory()->create();
        $staffB = User::factory()->create();
        $creator = User::factory()->create();
        $this->grantManageTasks($creator);

        $taskForA = Task::query()->create([
            'title' => 'Task for A',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $taskForA->assignedUsers()->sync([$staffA->id]);

        $taskForB = Task::query()->create([
            'title' => 'Task for B',
            'status' => 'open',
            'created_by' => $creator->id,
        ]);
        $taskForB->assignedUsers()->sync([$staffB->id]);

        Sanctum::actingAs($manager);
        $this->getJson("/api/tasks?assigned_user_id={$staffA->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $taskForA->id])
            ->assertJsonMissing(['id' => $taskForB->id]);

        $staffUser = User::factory()->create();
        $this->grantManageTasks($staffUser);
        Sanctum::actingAs($staffUser);
        $this->getJson("/api/tasks?assigned_user_id={$staffA->id}")
            ->assertStatus(403);
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
            ['slug' => 'test_' . $permissionSlug],
            ['name' => 'Test ' . ucfirst(str_replace('_', ' ', $permissionSlug))]
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
