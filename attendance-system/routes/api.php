<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\LocationController;
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
    Route::get('members/export', [MemberController::class, 'export']);
    Route::get('members/{id}', [MemberController::class, 'show']);
    Route::post('members', [MemberController::class, 'store']);
    Route::put('members/{id}', [MemberController::class, 'update']);
    Route::delete('members/bulk', [MemberController::class, 'bulkDelete']);
    Route::delete('members/{id}', [MemberController::class, 'destroy']);
    Route::post('members/import', [MemberController::class, 'import']);

    // Branches
    Route::get('branches', [BranchController::class, 'index']);

    // Locations
    Route::get('locations/provinces', [LocationController::class, 'provinces']);
    Route::get('locations/cities', [LocationController::class, 'cities']);
    Route::get('locations/barangays', [LocationController::class, 'barangays']);

    // Attendance
    Route::get('attendance', [AttendanceController::class, 'index']);
    Route::get('attendance/today-status', [AttendanceController::class, 'todayStatus']);
    Route::post('attendance', [AttendanceController::class, 'store']);
    Route::get('attendance/pending-approvals', [AttendanceController::class, 'pendingApprovals']);
    Route::post('attendance/{id}/approve', [AttendanceController::class, 'approve']);
    Route::post('attendance/{id}/reject', [AttendanceController::class, 'reject']);
    Route::post('attendance/{id}/cancel', [AttendanceController::class, 'cancel']);
    Route::post('attendance/bulk-delete', [AttendanceController::class, 'bulkDelete']);
    Route::post('attendance/clear-history', [AttendanceController::class, 'clearHistory']);

    // Audit Logs
    Route::get('audit-logs', [\App\Http\Controllers\Api\AuditLogController::class, 'index']);
    Route::get('audit-logs/export', [\App\Http\Controllers\Api\AuditLogController::class, 'export']);

    // Dashboard
    Route::get('dashboard/stats', [DashboardController::class, 'stats']);

    // Users
    Route::get('users', [\App\Http\Controllers\Api\UserController::class, 'index']);
    Route::post('users', [\App\Http\Controllers\Api\UserController::class, 'store']);
    Route::post('users/import', [\App\Http\Controllers\Api\UserController::class, 'import']);
    Route::put('users/{id}', [\App\Http\Controllers\Api\UserController::class, 'update']);
    Route::delete('users/{id}', [\App\Http\Controllers\Api\UserController::class, 'destroy']);
});
