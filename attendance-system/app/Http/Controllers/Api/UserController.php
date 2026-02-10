<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Validator;

class UserController extends Controller
{
    private function resolveBranchId($value)
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        $branch = Branch::where('name', $value)
            ->orWhere('code', $value)
            ->first();

        if (!$branch) {
            throw ValidationException::withMessages([
                'branch_id' => ['Branch not found'],
            ]);
        }

        return $branch->id;
    }

    public function index(Request $request)
    {
        $user = Auth::user();
        if ($user->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $users = User::with('branch')->latest()->get();
        return response()->json($users);
    }

    public function store(Request $request)
    {
        $request->merge([
            'branch_id' => $this->resolveBranchId($request->branch_id),
        ]);

        $request->validate([
            'name' => 'required|string',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => 'required|string',
            'branch_id' => 'required|exists:branches,id',
            'status' => 'nullable|string',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'branch_id' => $request->branch_id,
            'status' => $request->status ?? 'ACTIVE',
        ]);

        return response()->json($user, 201);
    }

    public function update(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $request->merge([
            'branch_id' => $this->resolveBranchId($request->branch_id),
        ]);

        $request->validate([
            'name' => 'required|string',
            'email' => 'required|email|unique:users,email,' . $id,
            'role' => 'required|string',
            'branch_id' => 'required|exists:branches,id',
            'status' => 'nullable|string',
        ]);

        $data = $request->only(['name', 'email', 'role', 'branch_id', 'status']);
        if ($request->password) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);

        return response()->json($user);
    }

    public function destroy($id)
    {
        $user = User::findOrFail($id);
        if ($user->id === Auth::id()) {
            return response()->json(['message' => 'Cannot delete yourself'], 400);
        }
        $user->delete();
        return response()->json(null, 204);
    }

    public function import(Request $request)
    {
        $current = Auth::user();
        if (!$current || $current->role !== 'SUPER_ADMIN') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'users' => 'required|array',
        ]);

        $success = 0;
        $errors = [];

        foreach ($request->users as $index => $row) {
            try {
                // Normalize keys (case/space insensitive)
                $norm = [];
                foreach ($row as $k => $v) {
                    $norm[strtolower(preg_replace('/\s+/', '_', trim((string) $k)))] = $v;
                }

                $payload = [
                    'name' => $norm['name'] ?? null,
                    'email' => $norm['email'] ?? null,
                    'password' => $norm['password'] ?? null,
                    'role' => $norm['role'] ?? 'STAFF',
                    'branch_id' => $this->resolveBranchId($norm['branch_id'] ?? $norm['branch'] ?? null),
                    'status' => $norm['status'] ?? 'ACTIVE',
                ];

                $validator = Validator::make($payload, [
                    'name' => 'required|string',
                    'email' => 'required|email',
                    'password' => 'required|string|min:6',
                    'role' => 'required|string',
                    'branch_id' => 'required|exists:branches,id',
                    'status' => 'nullable|string',
                ]);

                if ($validator->fails()) {
                    throw new \Exception(implode('; ', $validator->errors()->all()));
                }

                // Upsert by email
                $user = User::where('email', $payload['email'])->first();
                if ($user) {
                    $user->update([
                        'name' => $payload['name'],
                        'role' => $payload['role'],
                        'branch_id' => $payload['branch_id'],
                        'status' => $payload['status'] ?? 'ACTIVE',
                        'password' => Hash::make($payload['password']),
                    ]);
                } else {
                    User::create([
                        'name' => $payload['name'],
                        'email' => $payload['email'],
                        'password' => Hash::make($payload['password']),
                        'role' => $payload['role'],
                        'branch_id' => $payload['branch_id'],
                        'status' => $payload['status'] ?? 'ACTIVE',
                    ]);
                }
                $success++;
            } catch (\Exception $e) {
                $errors[] = "Row {$index}: " . $e->getMessage();
            }
        }

        return response()->json([
            'total_count' => count($request->users),
            'success_count' => $success,
            'error_count' => count($errors),
            'errors' => $errors,
        ]);
    }
}
