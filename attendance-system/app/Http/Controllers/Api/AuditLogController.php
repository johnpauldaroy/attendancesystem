<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        if (!in_array($user->role, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'APPROVER'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = AuditLog::with('actor');

        if ($user->role !== 'SUPER_ADMIN') {
            $query->where('entity_type', 'Member')
                ->where('action_type', 'MEMBER_UPDATE')
                ->where(function ($q) use ($user) {
                    $q->where('after->origin_branch_id', $user->branch_id)
                        ->orWhere('before->origin_branch_id', $user->branch_id);
                });
        } elseif ($request->branch_id) {
            $branchId = $request->branch_id;
            $query->where('entity_type', 'Member')
                ->where('action_type', 'MEMBER_UPDATE')
                ->where(function ($q) use ($branchId) {
                    $q->where('after->origin_branch_id', $branchId)
                        ->orWhere('before->origin_branch_id', $branchId);
                });
        }

        if ($request->action_type) {
            $query->where('action_type', $request->action_type);
        }

        if ($request->date_from) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->date_to) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $logs = $query->latest()->paginate($request->per_page ?? 20);

        return response()->json($logs);
    }

    public function export(Request $request)
    {
        $user = Auth::user();
        if (!in_array($user->role, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'APPROVER'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $query = AuditLog::with('actor');

        if ($user->role !== 'SUPER_ADMIN') {
            $query->where('entity_type', 'Member')
                ->where(function ($q) use ($user) {
                    $q->where('after->origin_branch_id', $user->branch_id)
                        ->orWhere('before->origin_branch_id', $user->branch_id);
                });
        } elseif ($request->branch_id) {
            $branchId = $request->branch_id;
            $query->where('entity_type', 'Member')->where(function ($q) use ($branchId) {
                $q->where('after->origin_branch_id', $branchId)
                    ->orWhere('before->origin_branch_id', $branchId);
            });
        }

        // Only profile updates
        $query->where('action_type', 'MEMBER_UPDATE');

        if ($request->date_from) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->date_to) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $logs = $query->latest()->get();

        $headers = [
            "Content-type" => "text/csv",
            "Content-Disposition" => "attachment; filename=profile_update_history.csv",
            "Pragma" => "no-cache",
            "Cache-Control" => "must-revalidate, post-check=0, pre-check=0",
            "Expires" => "0"
        ];

        $columns = ['Timestamp', 'Member Name', 'Member ID', 'Updated By', 'Action', 'Changes'];

        $callback = function () use ($logs, $columns) {
            $file = fopen('php://output', 'w');
            fputcsv($file, $columns);

            foreach ($logs as $log) {
                $after = $log->after ?: [];
                $before = $log->before ?: [];
                $memberId = $after['cif_key'] ?? $before['cif_key'] ?? $after['member_no'] ?? $before['member_no'] ?? $log->entity_id;
                $memberName = $after['full_name'] ?? $before['full_name'] ?? '-';

                $changes = [];
                $ignoreFields = ['id', 'created_at', 'updated_at', 'note', 'is_temporary'];
                foreach ($after as $k => $newVal) {
                    if (in_array($k, $ignoreFields))
                        continue;
                    $oldVal = $before[$k] ?? '';
                    if (strval($oldVal) !== strval($newVal)) {
                        $changes[] = "{$k}: \"{$oldVal}\" -> \"{$newVal}\"";
                    }
                }
                $changeText = empty($changes) ? ($after['note'] ?? 'No detailed changes') : implode('; ', $changes);

                fputcsv($file, [
                    $log->created_at->format('Y-m-d H:i:s'),
                    $memberName,
                    $memberId,
                    $log->actor->name ?? 'System',
                    $log->action_type,
                    $changeText,
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }
}
