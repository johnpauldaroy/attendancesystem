<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\Request;

class MemberController extends Controller
{
    public function search(Request $request)
    {
        $q = $request->query('q');
        $perPage = $request->query('per_page', 15);

        $query = Member::with('originBranch');

        if ($q) {
            $query->where(function ($query) use ($q) {
                $query->where('member_no', 'like', $q . '%')
                    ->orWhere('full_name', 'like', '%' . $q . '%');
            });
        }

        $members = $query->paginate($perPage);

        return response()->json($members);
    }

    public function show($id)
    {
        $member = Member::with('originBranch')->findOrFail($id);
        return response()->json($member);
    }
}
