<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Handles person profile endpoints.
 */
class PersonController extends Controller
{
    /**
     * Show a person profile.
     */
    public function show(int $id): JsonResponse
    {
        return response()->json(['data' => ['id' => $id]]);
    }

    /**
     * Update a person profile.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => ['id' => $id]]);
    }
}
