<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceEvent;
use App\Models\Member;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    private function applyFilters($query, Request $request, $user): void
    {
        // Filter by branch based on role
        if ($user->role !== 'SUPER_ADMIN') {
            // Only show records where this branch was visited
            $query->where('visited_branch_id', $user->branch_id);
        } elseif ($request->branch && $request->branch !== 'all') {
            $query->where('visited_branch_id', $request->branch);
        }

        if ($request->date_from) {
            $query->where('attendance_date_time', '>=', Carbon::parse($request->date_from)->startOfDay());
        }
        if ($request->date_to) {
            $query->where('attendance_date_time', '<=', Carbon::parse($request->date_to)->endOfDay());
        }
        if ($request->status) {
            $query->where('status', $request->status);
        }
        if ($request->member_id) {
            $query->where('member_id', $request->member_id);
        }
        if ($request->member_query) {
            $query->whereHas('member', function ($q) use ($request) {
                $q->where('member_no', 'like', $request->member_query . '%')
                    ->orWhere('cif_key', 'like', $request->member_query . '%')
                    ->orWhere('full_name', 'like', '%' . $request->member_query . '%');
            });
        }
    }

    public function index(Request $request)
    {
        $user = Auth::user();
        $query = AttendanceEvent::with(['member', 'originBranch', 'visitedBranch', 'creator', 'approver']);
        $this->applyFilters($query, $request, $user);

        return response()->json($query->orderBy('attendance_date_time', 'desc')->paginate($request->per_page ?? 15));
    }

    /**
     * Lightweight endpoint for Log Attendance page.
     * Returns the latest attendance status for a member for today.
     */
    public function todayStatus(Request $request)
    {
        $request->validate([
            'member_id' => 'required|exists:members,id',
        ]);

        $startOfDay = Carbon::now()->startOfDay();
        $endOfDay = Carbon::now()->endOfDay();

        $latest = AttendanceEvent::query()
            ->where('member_id', $request->member_id)
            ->where('attendance_date_time', '>=', $startOfDay)
            ->where('attendance_date_time', '<=', $endOfDay)
            ->orderBy('attendance_date_time', 'desc')
            ->first(['id', 'status', 'attendance_date_time', 'origin_branch_id', 'visited_branch_id']);

        return response()->json([
            'status' => $latest?->status ?? 'NONE',
            'attendance_id' => $latest?->id,
            'attendance_date_time' => $latest?->attendance_date_time,
            'origin_branch_id' => $latest?->origin_branch_id,
            'visited_branch_id' => $latest?->visited_branch_id,
        ]);
    }

    public function clearHistory(Request $request)
    {
        $user = Auth::user();
        if ($user->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = AttendanceEvent::query();
        $this->applyFilters($query, $request, $user);

        $ids = $query->pluck('id');
        if ($ids->isEmpty()) {
            return response()->json(['message' => 'No records found to clear.'], 422);
        }

        AttendanceEvent::whereIn('id', $ids)->delete();

        AuditLog::create([
            'actor_user_id' => Auth::id(),
            'action_type' => 'CLEAR_ATTENDANCE_HISTORY',
            'entity_type' => 'AttendanceEvent',
            'entity_id' => (int) $ids->first(),
            'after' => [
                'deleted_count' => $ids->count(),
                'filters' => $request->only(['status', 'member_query', 'date_from', 'date_to', 'branch']),
            ],
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'created_at' => Carbon::now(),
        ]);

        return response()->json([
            'message' => 'Attendance history cleared successfully.',
            'deleted_count' => $ids->count(),
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'member_id' => 'required|exists:members,id',
            'notes' => 'nullable|string',
        ]);

        $user = Auth::user();
        $member = Member::findOrFail($request->member_id);
        $now = Carbon::now();

        $visited_branch_id = $user->branch_id;
        $origin_branch_id = $member->origin_branch_id;

        $startOfDay = $now->copy()->startOfDay();
        $endOfDay = $now->copy()->endOfDay();

        // Prevent duplicate on same day (PENDING or APPROVED)
        $pendingOrApprovedExists = AttendanceEvent::where('member_id', $member->id)
            ->where('attendance_date_time', '>=', $startOfDay)
            ->where('attendance_date_time', '<=', $endOfDay)
            ->whereIn('status', ['PENDING', 'APPROVED'])
            ->exists();

        if ($pendingOrApprovedExists) {
            return response()->json(['message' => 'Attendance already logged for this member today.'], 422);
        }

        // If there is a cancelled record today, revive it instead of creating a new row
        $cancelledToday = AttendanceEvent::where('member_id', $member->id)
            ->where('attendance_date_time', '>=', $startOfDay)
            ->where('attendance_date_time', '<=', $endOfDay)
            ->where('status', 'CANCELLED')
            ->latest('attendance_date_time')
            ->first();

        $status = 'PENDING';
        $approved_by = null;
        $approved_at = null;

        if ($visited_branch_id === $origin_branch_id || $user->role === 'SUPER_ADMIN') {
            $status = 'APPROVED';
            $approved_by = $user->id;
            $approved_at = $now;
        }

        if ($cancelledToday) {
            $cancelledToday->update([
                'status' => $status,
                'approved_by_user_id' => $approved_by,
                'approved_at' => $approved_at,
                'notes' => $request->notes,
                'visited_branch_id' => $visited_branch_id,
                'origin_branch_id' => $origin_branch_id,
                'attendance_date_time' => $now,
            ]);

            // $this->logAudit('REACTIVATE_ATTENDANCE', $cancelledToday);

            return response()->json($cancelledToday->load(['member', 'originBranch', 'visitedBranch']));
        }

        $attendance = AttendanceEvent::create([
            'member_id' => $member->id,
            'origin_branch_id' => $origin_branch_id,
            'visited_branch_id' => $visited_branch_id,
            'attendance_date_time' => $now,
            'status' => $status,
            'created_by_user_id' => $user->id,
            'approved_by_user_id' => $approved_by,
            'approved_at' => $approved_at,
            'notes' => $request->notes,
        ]);

        // $this->logAudit('CREATE_ATTENDANCE', $attendance);

        return response()->json($attendance->load(['member', 'originBranch', 'visitedBranch']));
    }

    public function pendingApprovals(Request $request)
    {
        $user = Auth::user();
        $query = AttendanceEvent::with(['member', 'originBranch', 'visitedBranch', 'creator'])
            ->where('status', 'PENDING');

        if ($user->role !== 'SUPER_ADMIN') {
            $query->where('origin_branch_id', $user->branch_id);
        }

        return response()->json($query->paginate());
    }

    public function approve(Request $request, $id)
    {
        $attendance = AttendanceEvent::findOrFail($id);
        $this->authorize('approve', $attendance);

        if ($attendance->status !== 'PENDING') {
            return response()->json(['message' => 'Record is not pending'], 422);
        }

        $attendance->update([
            'status' => 'APPROVED',
            'approved_by_user_id' => Auth::id(),
            'approved_at' => Carbon::now(),
        ]);

        // $this->logAudit('APPROVE_ATTENDANCE', $attendance);

        return response()->json($attendance);
    }

    public function reject(Request $request, $id)
    {
        $request->validate(['rejection_reason' => 'required|string']);

        $attendance = AttendanceEvent::findOrFail($id);
        $this->authorize('reject', $attendance);

        if ($attendance->status !== 'PENDING') {
            return response()->json(['message' => 'Record is not pending'], 422);
        }

        $attendance->update([
            'status' => 'REJECTED',
            'rejection_reason' => $request->rejection_reason,
            'approved_by_user_id' => Auth::id(),
            'approved_at' => Carbon::now(),
        ]);

        // $this->logAudit('REJECT_ATTENDANCE', $attendance);

        return response()->json($attendance);
    }

    public function cancel(Request $request, $id)
    {
        $attendance = AttendanceEvent::findOrFail($id);
        $user = Auth::user();

        // Only creator or admin can cancel
        if ($attendance->created_by_user_id !== $user->id && $user->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($attendance->status === 'APPROVED' && $user->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Cannot cancel an approved record'], 400);
        }

        $attendance->update([
            'status' => 'CANCELLED',
        ]);

        // $this->logAudit('CANCEL_ATTENDANCE', $attendance);

        return response()->json($attendance);
    }

    public function bulkDelete(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'exists:attendance_events,id',
        ]);

        $user = Auth::user();
        if ($user->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        AttendanceEvent::whereIn('id', $request->ids)->delete();

        return response()->json(null, 204);
    }

    private function logAudit($action, $attendance)
    {
        AuditLog::create([
            'actor_user_id' => Auth::id(),
            'action_type' => $action,
            'entity_type' => 'AttendanceEvent',
            'entity_id' => $attendance->id,
            'after' => $attendance->toArray(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'created_at' => Carbon::now(),
        ]);
    }
}
