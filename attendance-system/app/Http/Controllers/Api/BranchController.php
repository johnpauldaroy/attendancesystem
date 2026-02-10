<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;

class BranchController extends Controller
{
    /**
     * Return all branches (id, name, code).
     */
    public function index(): JsonResponse
    {
        return response()->json(
            Branch::select('id', 'name', 'code')
                ->orderBy('name')
                ->get()
        );
    }
}
