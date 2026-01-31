<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('password123');

        // Super Admin
        User::create([
            'name' => 'HQ Super Admin',
            'email' => 'admin@coop.com',
            'password' => $password,
            'role' => 'SUPER_ADMIN',
            'branch_id' => null,
            'is_active' => true,
        ]);

        $north = Branch::where('code', 'BN01')->first();
        $south = Branch::where('code', 'BS01')->first();

        // Branch North
        User::create([
            'name' => 'North Branch Admin',
            'email' => 'manager_north@coop.com',
            'password' => $password,
            'role' => 'BRANCH_ADMIN',
            'branch_id' => $north->id,
        ]);

        User::create([
            'name' => 'North Staff',
            'email' => 'staff_north@coop.com',
            'password' => $password,
            'role' => 'STAFF',
            'branch_id' => $north->id,
        ]);

        User::create([
            'name' => 'North Approver',
            'email' => 'approver_north@coop.com',
            'password' => $password,
            'role' => 'APPROVER',
            'branch_id' => $north->id,
        ]);

        // Branch South
        User::create([
            'name' => 'South Staff',
            'email' => 'staff_south@coop.com',
            'password' => $password,
            'role' => 'STAFF',
            'branch_id' => $south->id,
        ]);

        User::create([
            'name' => 'South Approver',
            'email' => 'approver_south@coop.com',
            'password' => $password,
            'role' => 'APPROVER',
            'branch_id' => $south->id,
        ]);
    }
}
