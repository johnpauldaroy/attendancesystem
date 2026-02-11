<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\AttendanceEvent;
use App\Models\Member;
use App\Models\Branch;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
// Removed missing PhpOffice library

class MemberController extends Controller
{
    private function normalizeValue($value, $isNumeric = false)
    {
        if ($value === null)
            return null;

        $v = trim((string) $value);
        $upper = strtoupper($v);

        if ($upper === 'NULL' || $upper === 'N/A' || $upper === '' || $upper === '-') {
            return null;
        }

        if ($isNumeric) {
            return is_numeric($v) ? (int) $v : null;
        }

        return $v;
    }

    private function resolveBranchId($value)
    {
        $val = $this->normalizeValue($value);
        if ($val === null) {
            return null;
        }

        // Allow "all" to mean no filtering
        if (is_string($val) && strtolower(trim($val)) === 'all') {
            return null;
        }

        if (is_numeric($val)) {
            return (int) $val;
        }

        $branch = Branch::where('name', $val)
            ->orWhere('code', $val)
            ->first();

        if (!$branch) {
            throw ValidationException::withMessages([
                'origin_branch_id' => ['Branch not found'],
            ]);
        }

        return $branch->id;
    }

    public function search(Request $request)
    {
        $q = $request->query('q');
        $branchId = $this->resolveBranchId($request->query('branch_id'));
        $perPage = $request->query('per_page', 15);

        $query = Member::with('originBranch');

        if ($q) {
            $query->where(function ($query) use ($q) {
                $query->where('cif_key', 'like', $q . '%')
                    ->orWhere('member_no', 'like', $q . '%')
                    ->orWhere('full_name', 'like', '%' . $q . '%');
            });
        }

        if ($branchId && $branchId !== 'all') {
            $query->where('origin_branch_id', $branchId);
        }

        // Members are visible across branches; explicit branch filter is optional.

        $members = $query->latest()->paginate($perPage);

        return response()->json($members);
    }

    public function show($id)
    {
        $member = Member::with('originBranch')->findOrFail($id);
        return response()->json($member);
    }

    public function store(Request $request)
    {
        $request->merge([
            'origin_branch_id' => $this->resolveBranchId($request->origin_branch_id),
        ]);

        $validated = $request->validate([
            'cif_key' => 'required|string|unique:members,cif_key',
            'full_name' => 'required|string',
            'origin_branch_id' => 'required|exists:branches,id',
            'status' => 'nullable|string',
            'birth_date' => 'nullable|date',
            'age' => 'nullable|integer',
            'sex' => 'nullable|string',
            'civil_status' => 'nullable|string',
            'spouse_name' => 'nullable|string',
            'educational_attainment' => 'nullable|string',
            'contact_no' => 'nullable|string',
            'telephone_no' => 'nullable|string',
            'address' => 'nullable|string',
            'unit_house_no' => 'nullable|string',
            'barangay_village' => 'nullable|string',
            'city_town' => 'nullable|string',
            'province' => 'nullable|string',
            'date_of_membership' => 'nullable|date',
            'classification' => 'nullable|string',
            'membership_type' => 'nullable|string',
            'membership_status' => 'nullable|string',
            'membership_update' => 'nullable|string',
            'position' => 'nullable|string',
            'segmentation' => 'nullable|string',
            'attendance_status' => 'nullable|string',
            'representatives_status' => 'nullable|string',
            'attend_ra' => 'nullable|string',
            'annual_income' => 'nullable|string',
            'tin_no' => 'nullable|string',
            'sss_no' => 'nullable|string',
            'gsis_no' => 'nullable|string',
            'is_temporary' => 'nullable|boolean',
        ]);

        $member = Member::create($validated);

        $actionType = $request->is_temporary ? 'MEMBER_CREATE_QUICK' : 'MEMBER_CREATE';
        $note = $request->is_temporary ? 'Quick registration via attendance page' : null;
        AuditLog::record($member, $actionType, null, $member->toArray(), $note);

        return response()->json($member, 201);
    }

    public function update(Request $request, $id)
    {
        $member = Member::findOrFail($id);

        $request->merge([
            'origin_branch_id' => $this->resolveBranchId($request->origin_branch_id),
        ]);

        $validated = $request->validate([
            'cif_key' => 'required|string|unique:members,cif_key,' . $id,
            'full_name' => 'required|string',
            'origin_branch_id' => 'required|exists:branches,id',
            'status' => 'nullable|string',
            'birth_date' => 'nullable|date',
            'age' => 'nullable|integer',
            'sex' => 'nullable|string',
            'civil_status' => 'nullable|string',
            'spouse_name' => 'nullable|string',
            'educational_attainment' => 'nullable|string',
            'contact_no' => 'nullable|string',
            'telephone_no' => 'nullable|string',
            'address' => 'nullable|string',
            'unit_house_no' => 'nullable|string',
            'barangay_village' => 'nullable|string',
            'city_town' => 'nullable|string',
            'province' => 'nullable|string',
            'date_of_membership' => 'nullable|date',
            'classification' => 'nullable|string',
            'membership_type' => 'nullable|string',
            'membership_status' => 'nullable|string',
            'membership_update' => 'nullable|string',
            'position' => 'nullable|string',
            'segmentation' => 'nullable|string',
            'attendance_status' => 'nullable|string',
            'representatives_status' => 'nullable|string',
            'attend_ra' => 'nullable|string',
            'annual_income' => 'nullable|string',
            'tin_no' => 'nullable|string',
            'sss_no' => 'nullable|string',
            'gsis_no' => 'nullable|string',
            'is_temporary' => 'nullable|boolean',
        ]);

        $before = $member->toArray();
        $member->update($validated);
        AuditLog::record($member, 'MEMBER_UPDATE', $before, $member->refresh()->toArray());

        return response()->json($member);
    }

    public function destroy($id)
    {
        $user = Auth::user();
        if ($user->role === 'STAFF') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $member = Member::findOrFail($id);

        if ($member->attendanceEvents()->exists()) {
            return response()->json([
                'message' => 'Cannot delete member with attendance history. You can keep the record for audit or mark it as deactivated.'
            ], 422);
        }

        $before = $member->toArray();
        $member->delete();
        AuditLog::record($member, 'MEMBER_DELETE', $before, null);

        return response()->json(null, 204);
    }

    public function bulkDelete(Request $request)
    {
        $user = Auth::user();
        if ($user->role === 'STAFF') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'exists:members,id',
        ]);

        $protectedIds = AttendanceEvent::whereIn('member_id', $request->ids)
            ->distinct()
            ->pluck('member_id')
            ->all();

        if (!empty($protectedIds)) {
            return response()->json([
                'message' => 'Some selected members have attendance history and cannot be deleted.',
                'protected_member_ids' => $protectedIds,
            ], 422);
        }

        $members = Member::whereIn('id', $request->ids)->get();
        foreach ($members as $m) {
            $before = $m->toArray();
            $m->delete();
            AuditLog::record($m, 'MEMBER_DELETE', $before, null, 'Bulk delete');
        }

        return response()->json(null, 204);
    }

    public function import(Request $request)
    {
        // Simple implementation for now, assuming JSON payload from frontend or multipart
        // In a real scenario, this would handle a CSV file stream
        $request->validate([
            'members' => 'required|array',
            'skip_audit' => 'nullable|boolean',
        ]);

        $success = 0;
        $errors = [];
        $skipAudit = $request->boolean('skip_audit', false);

        $user = Auth::user();

        $mapKeys = function (array $row) use ($user) {
            // Normalize headers: trim, collapse spaces, uppercase
            $normalized = [];
            foreach ($row as $key => $val) {
                $normKey = strtoupper(preg_replace('/\s+/', ' ', trim((string) $key)));
                $normalized[$normKey] = $val;
            }

            $get = function ($key, $fallback = null) use ($normalized) {
                return array_key_exists($key, $normalized) ? $normalized[$key] : $fallback;
            };

            $mapped = [
                'cif_key' => $this->cleanExcelFormula($get('CIFKEY', null) ?? $get('CIF KEY', null)),
                'full_name' => $this->normalizeValue($get('MEMBER NAME', null) ?? $get('FULL NAME', null)),
                'origin_branch_id' => $this->resolveBranchId($get('ORIGIN BRANCH', null) ?? $get('BRANCH ORIGIN', null) ?? $get('ORIGIN BRANCH ID', null) ?? $user->branch_id ?? 1),
                'status' => $this->normalizeValue($get('STATUS', 'ACTIVE')),
                'birth_date' => $this->parseDate($get('BIRTH DATE', null)),
                'age' => $this->normalizeValue($get('AGE', null), true),
                'sex' => $this->normalizeValue($get('SEX', null)),
                'civil_status' => $this->normalizeValue($get('CIVIL STATUS', null)),
                'spouse_name' => $this->normalizeValue($get('SPOUSE NAME', null) ?? $get('SPOUSENAME', null)),
                'educational_attainment' => $this->normalizeValue($get('EDUCATIONAL ATTAINMENT', null) ?? $get('EDUCATIONAL ATTAINTMENT', null) ?? $get('EDUCATTAINMENT', null) ?? $get('EDUC ATTAINMENT', null)),
                'contact_no' => $this->normalizeValue($get('CONTACT #', null) ?? $get('CONTACT NO', null)),
                'telephone_no' => $this->normalizeValue($get('TELEPHONE #', null) ?? $get('TELEPHONE NO', null)),
                'address' => $this->normalizeValue($get('ADDRESS', null)),
                'unit_house_no' => $this->normalizeValue($get('UNIT/HOUSE', null) ?? $get('UNIT/HOUSE NUMBER/STREET', null) ?? $get('UNIT NO', null)),
                'barangay_village' => $this->normalizeValue($get('BARANGAY', null) ?? $get('BARANGAY VILLAGE', null)),
                'city_town' => $this->normalizeValue($get('CITY/TOWN/MUNICIPALITY', null) ?? $get('CITY', null)),
                'province' => $this->normalizeValue($get('PROVINCE', null)),
                'date_of_membership' => $this->parseDate($get('DATE OF MEMBERSHIP', null)),
                'classification' => $this->normalizeValue($get('CLASSIFICATION', null)),
                'membership_type' => $this->normalizeValue($get('MEMBERS TYPE', null) ?? $get('MEMBERSHIP TYPE', null)),
                'membership_status' => $this->normalizeValue($get('MEMBERSHIP STATUS', null)),
                'membership_update' => $this->normalizeValue($get('MEMBERSHIP UPDATE', null)),
                'position' => $this->normalizeValue($get('POSITION', null)),
                'segmentation' => $this->normalizeValue($get('SEGMENTATION STATUS', null) ?? $get('SEGMENTATION', null)),
                'attendance_status' => $this->normalizeValue($get('ATTENDANCE STATUS', null)),
                'representatives_status' => $this->normalizeValue($get('REPRESENTATIVE STATUS', null)),
                'attend_ra' => $this->normalizeValue($get('ATTEND RA', null)),
                'annual_income' => $this->normalizeValue($get('ANNUAL INCOME', null) ?? $get('ANNUALINCOME', null)),
                'tin_no' => $this->normalizeValue($get('TIN', null)),
                'sss_no' => $this->normalizeValue($get('SSS', null)),
                'gsis_no' => $this->normalizeValue($get('GSIS', null)),
            ];

            return array_filter($mapped, function ($v) {
                return !is_null($v) && $v !== '';
            });
        };

        foreach ($request->members as $index => $memberData) {
            try {
                $payload = $mapKeys($memberData);
                if (empty($payload['cif_key']) || empty($payload['full_name'])) {
                    throw new \Exception('Missing required fields (CIF Key, Full Name)');
                }

                $before = Member::where('cif_key', $payload['cif_key'])->first()?->toArray();
                $member = Member::updateOrCreate(['cif_key' => $payload['cif_key']], $payload);

                if (!$skipAudit) {
                    AuditLog::record($member, $before ? 'MEMBER_UPDATE' : 'MEMBER_CREATE', $before, $member->toArray(), 'Imported via CSV');
                }
                $success++;
            } catch (\Exception $e) {
                $errors[] = "Row {$index}: " . $e->getMessage();
            }
        }

        return response()->json([
            'total_count' => count($request->members),
            'success_count' => $success,
            'error_count' => count($errors),
            'errors' => $errors
        ]);
    }

    private function parseDate($value)
    {
        if (!$value)
            return null;
        try {
            if (is_numeric($value)) {
                // Excel serial date conversion
                return (new \DateTime('1899-12-30'))->modify('+' . intval($value) . ' days')->format('Y-m-d');
            }
            return Carbon::parse($value)->format('Y-m-d');
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Clean Excel formula wrappers from CIF Key values.
     * Exported CSVs use ="00123" trick to preserve leading zeros in Excel.
     */
    private function cleanExcelFormula($value)
    {
        if ($value === null)
            return null;
        $v = trim((string) $value);
        // Strip ="..." wrapper
        if (preg_match('/^="(.*)"$/', $v, $m)) {
            return $m[1];
        }
        return $v;
    }
}
