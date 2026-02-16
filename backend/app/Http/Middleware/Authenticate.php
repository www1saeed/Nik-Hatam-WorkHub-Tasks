<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;

class Authenticate extends Middleware
{
    protected function redirectTo($request): ?string
    {
        // This project is API-first; unauthenticated requests must always return 401 JSON.
        return null;
    }
}
