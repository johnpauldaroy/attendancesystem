<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceEvent;
use App\Models\Member;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    public function index(Request $request)
    {
        $query = AttendanceEvent::with(['member', 'originBranch', 'visitedBranch', 'creator', 'approver']);

        if ($request->date_from) {
            $query->whereDate('attendance_date_time', '>=', $request->date_from);
        }
        if ($request->date_to) {
            $query->whereDate('attendance_date_time', '<=', $request->date_to);
        }
        if ($request->status) {
            $query->where('status', $request->status);
        }
        if ($request->branch) {
            $query->where('visited_branch_id', $request->branch);
        }
        if ($request->member_no) {
            $query->whereHas('member', function ($q) use ($request) {
                $q->where('member_no', $request->member_no);
            });
        }

        return response()->json($query->orderBy('attendance_date_time', 'desc')->paginate());
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

        // Prevent duplicate on same day (PENDING or APPROVED)
        $exists = AttendanceEvent::where('member_id', $member->id)
            ->whereDate('attendance_date_time', $now->toDateString())
            ->whereIn('status', ['PENDING', 'APPROVED'])
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Attendance already logged for this member today.'], 422);
        }

        $visited_branch_id = $user->branch_id;
        $origin_branch_id = $member->origin_branch_id;

        $status = 'PENDING';
        $approved_by = null;
        $approved_at = null;

        if ($visited_branch_id === $origin_branch_id || $user->role === 'SUPER_ADMIN') {
            $status = 'APPROVED';
            $approved_by = $user->id;
            $approved_at = $now;
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

        $this->logAudit('CREATE_ATTENDANCE', $attendance);

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

        $this->logAudit('APPROVE_ATTENDANCE', $attendance);

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

        $this->logAudit('REJECT_ATTENDANCE', $attendance);

        return response()->json($attendance);
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
