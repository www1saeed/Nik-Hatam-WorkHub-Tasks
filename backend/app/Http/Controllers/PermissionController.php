<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Handles permission management endpoints.
 */
class PermissionController extends Controller
{
    /**
     * List permissions.
     */
    public function index(Request $request): JsonResponse
    {
        $this->ensureAnyPermission($request, ['manage_permissions', 'manage_roles']);

        $permissions = \App\Models\Permission::query()
            ->orderBy('name')
            ->get()
            ->map(fn ($permission) => [
                'id' => $permission->id,
                'name' => $permission->name,
                'slug' => $permission->slug,
            ]);

        return response()->json(['data' => $permissions]);
    }

    /**
     * Create a permission.
     */
    public function store(Request $request): JsonResponse
    {
        $this->ensurePermission($request, 'manage_permissions');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', Rule::unique('permissions', 'slug')],
        ]);

        $permission = \App\Models\Permission::create($validated);

        return response()->json([
            'data' => [
                'id' => $permission->id,
                'name' => $permission->name,
                'slug' => $permission->slug,
            ],
        ], 201);
    }

    /**
     * Show a permission.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_permissions');

        $permission = \App\Models\Permission::findOrFail($id);

        return response()->json([
            'data' => [
                'id' => $permission->id,
                'name' => $permission->name,
                'slug' => $permission->slug,
            ],
        ]);
    }

    /**
     * Update a permission.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_permissions');

        $permission = \App\Models\Permission::findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', Rule::unique('permissions', 'slug')->ignore($permission->id)],
        ]);

        $permission->forceFill($validated)->save();

        return response()->json([
            'data' => [
                'id' => $permission->id,
                'name' => $permission->name,
                'slug' => $permission->slug,
            ],
        ]);
    }

    /**
     * Delete a permission.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->ensurePermission($request, 'manage_permissions');

        $permission = \App\Models\Permission::findOrFail($id);
        $permission->roles()->detach();
        $permission->delete();

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
