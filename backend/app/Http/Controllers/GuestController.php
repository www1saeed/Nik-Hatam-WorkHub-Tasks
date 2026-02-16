<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Handles guest management endpoints.
 */
class GuestController extends Controller
{
    /**
     * List guests.
     */
    public function index(): JsonResponse
    {
        return response()->json(['data' => []]);
    }

    /**
     * Create a guest.
     */
    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => []], 201);
    }

    /**
     * Show a guest.
     */
    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => ['id' => $id]]);
    }

    /**
     * Update a guest.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => ['id' => $id]]);
    }

    /**
     * Delete a guest.
     */
    public function destroy(int $id): JsonResponse
    {
        return response()->json([], 204);
    }
}
