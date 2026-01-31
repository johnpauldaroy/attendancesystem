<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\AttendanceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

Route::post('login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);

    // Members
    Route::get('members/search', [MemberController::class, 'search']);
    Route::get('members/{id}', [MemberController::class, 'show']);

    // Attendance
    Route::get('attendance', [AttendanceController::class, 'index']);
    Route::post('attendance', [AttendanceController::class, 'store']);
    Route::get('attendance/pending-approvals', [AttendanceController::class, 'pendingApprovals']);
    Route::post('attendance/{id}/approve', [AttendanceController::class, 'approve']);
    Route::post('attendance/{id}/reject', [AttendanceController::class, 'reject']);
});
