<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\AttendanceEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $user = Auth::user();
        $now = Carbon::now();
        $branchId = $user->branch_id;

        $membersQuery = Member::query();
        $attendanceQuery = AttendanceEvent::query();
        $pendingQuery = AttendanceEvent::where('status', 'PENDING');

        if ($user->role !== 'SUPER_ADMIN') {
            $membersQuery->where('origin_branch_id', $branchId);
            $attendanceQuery->where('visited_branch_id', $branchId);
            $pendingQuery->where('origin_branch_id', $branchId);
        }

        $totalMembers = $membersQuery->count();
        $presentToday = $attendanceQuery->whereDate('attendance_date_time', $now->toDateString())
            ->where('status', 'APPROVED')
            ->count();
        $pendingApprovals = $pendingQuery->count();

        // Segmentation counts for today's attendance
        $attendanceToday = (clone $attendanceQuery)
            ->whereDate('attendance_date_time', $now->toDateString())
            ->with('member')
            ->get();

        $segmentation = [
            'Bronze' => 0,
            'Silver' => 0,
            'Gold' => 0,
            'Diamond' => 0,
            'Not Segmented' => 0,
        ];

        $segMap = [
            'BRONZE' => 'Bronze',
            'SILVER' => 'Silver',
            'GOLD' => 'Gold',
            'DIAMOND' => 'Diamond',
        ];

        foreach ($attendanceToday as $event) {
            $rawSeg = $event->member->segmentation ?? null;
            $normalized = strtoupper(trim((string) $rawSeg));

            if (isset($segMap[$normalized])) {
                $segmentation[$segMap[$normalized]]++;
            } else {
                $segmentation['Not Segmented']++;
            }
        }

        $recentAttendance = (clone $attendanceQuery)
            ->with(['member', 'visitedBranch'])
            ->latest('attendance_date_time')
            ->limit(5)
            ->get();

        return response()->json([
            'total_members' => $totalMembers,
            'present_today' => $presentToday,
            'pending_approvals' => $pendingApprovals,
            'recent_attendance' => $recentAttendance,
            'segmentation' => $segmentation,
        ]);
    }
}
