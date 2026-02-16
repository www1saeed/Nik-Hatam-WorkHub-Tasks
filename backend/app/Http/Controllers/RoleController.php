<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Handles role management endpoints.
 */
class RoleController extends Controller
{
    /**
     * List roles.
     */
    public function index(Request $request): JsonResponse
    {
        $this->ensureAnyPermission($request, ['manage_roles', 'manage_users']);

        $roles = \App\Models\Role::query()
            ->with(['permissions'])
            ->orderBy('name')
            ->get()
            ->map(fn ($role) => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'permissions' => $role->permissions->map(fn ($permission) => [
                    'id' => $permission->id,
                    'name' => $permission->name,
                    'slug' => $permission->slug,
                ]),
            ]);

        return response()->json(['data' => $roles]);
    }

    /**
     * Create a role.
     */
    public function store(Request $request): JsonResponse
    {
        $this->ensurePermission($request, 'manage_roles');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', Rule::unique('roles', 'slug')],
            'permission_ids' => ['nullable', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role = \App\Models\Role::create([
            'name' => $validated['name'],
            'slug' => $validated['slug'],
        ]);

        if (! empty($validated['permission_ids'])) {
            $role->permissions()->sync($validated['permission_ids']);
        }

        return response()->json([
            'data' => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
            ],
        ], 201);
    }

    /**
     * Show a role.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_roles');

        $role = \App\Models\Role::query()
            ->with(['permissions'])
            ->findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'permissions' => $role->permissions->map(fn ($permission) => [
                    'id' => $permission->id,
                    'name' => $permission->name,
                    'slug' => $permission->slug,
                ]),
            ],
        ]);
    }

    /**
     * Update a role.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_roles');

        $role = \App\Models\Role::findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', Rule::unique('roles', 'slug')->ignore($role->id)],
            'permission_ids' => ['nullable', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role->forceFill([
            'name' => $validated['name'],
            'slug' => $validated['slug'],
        ])->save();

        if (array_key_exists('permission_ids', $validated)) {
            $role->permissions()->sync($validated['permission_ids'] ?? []);
        }

        return response()->json([
            'data' => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
            ],
        ]);
    }

    /**
     * Delete a role.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_roles');

        $role = \App\Models\Role::findOrFail($id);
        $role->permissions()->detach();
        $role->delete();

        return response()->json([], 204);
    }

    private function ensurePermission(Request $request, string $permission): void
    {
        $user = $request->user();
        if (! $user || ! $user->hasPermission($permission)) {
            abort(403, 'Forbidden.');
        }
    }

    private function ensureAnyPermission(Request $request, array $permissions): void
    {
        $user = $request->user();
        if (! $user) {
            abort(403, 'Forbidden.');
        }
        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return;
            }
        }
        abort(403, 'Forbidden.');
    }
}
