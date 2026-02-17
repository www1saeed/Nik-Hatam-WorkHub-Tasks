<?php

namespace App\Http\Controllers;

use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Search task templates for task capture autocomplete.
 */
class TaskTemplateController extends Controller
{
    /**
     * List/search task templates.
     *
     * Access:
     * - task operators (`manage_tasks` / `manage_staffs`) for autocomplete usage
     * - system configuration managers for CRUD workspace
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanReadTemplates($user);

        $validated = $request->validate([
            'query' => ['nullable', 'string', 'max:255'],
        ]);

        $query = trim((string) ($validated['query'] ?? ''));

        $templatesQuery = TaskTemplate::query()
            ->select(['id', 'title'])
            ->orderBy('title')
            ->limit(20);

        if ($query !== '') {
            $templatesQuery->where('title', 'like', '%' . $query . '%');
        }

        return response()->json([
            'data' => $templatesQuery->get(),
        ]);
    }

    /**
     * Create a new task template.
     *
     * Restricted to system configuration managers.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageTemplates($user);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255', Rule::unique('task_templates', 'title')],
        ]);

        $template = TaskTemplate::query()->create([
            'title' => trim((string) $validated['title']),
        ]);

        return response()->json([
            'data' => $template,
        ], 201);
    }

    /**
     * Update one task template title.
     *
     * Restricted to system configuration managers.
     */
    public function update(Request $request, TaskTemplate $taskTemplate): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageTemplates($user);

        $validated = $request->validate([
            'title' => [
                'required',
                'string',
                'max:255',
                Rule::unique('task_templates', 'title')->ignore($taskTemplate->id),
            ],
        ]);

        $taskTemplate->title = trim((string) $validated['title']);
        $taskTemplate->save();

        return response()->json([
            'data' => $taskTemplate,
        ]);
    }

    /**
     * Delete one task template.
     *
     * Restricted to system configuration managers.
     */
    public function destroy(Request $request, TaskTemplate $taskTemplate): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }
        $this->ensureCanManageTemplates($user);

        $taskTemplate->delete();

        return response()->json([], 204);
    }

    private function ensureCanReadTemplates(User $user): void
    {
        if (
            $user->hasPermission('manage_tasks')
            || $user->hasPermission('manage_staffs')
            || $user->hasPermission('manage_system_configurations')
        ) {
            return;
        }

        abort(403, 'Forbidden.');
    }

    private function ensureCanManageTemplates(User $user): void
    {
        if (! $user->hasPermission('manage_system_configurations')) {
            abort(403, 'Forbidden.');
        }
    }
}
