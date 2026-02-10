<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Member;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class MemberSeeder extends Seeder
{
    public function run(): void
    {
        $branches = Branch::all();

        foreach ($branches as $branch) {
            for ($i = 1; $i <= 50; $i++) {
                Member::create([
                    'cif_key' => $branch->code . '-' . str_pad($i, 4, '0', STR_PAD_LEFT),
                    'member_no' => $branch->code . '-' . str_pad($i, 4, '0', STR_PAD_LEFT),
                    'full_name' => 'Member ' . $i . ' ' . $branch->name,
                    'origin_branch_id' => $branch->id,
                    'status' => 'ACTIVE',
                ]);
            }
        }
    }
}
