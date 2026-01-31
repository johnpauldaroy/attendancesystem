<?php

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        Branch::create(['name' => 'HQ Main Office', 'code' => 'HQ00']);
        Branch::create(['name' => 'Branch North', 'code' => 'BN01']);
        Branch::create(['name' => 'Branch South', 'code' => 'BS01']);
        Branch::create(['name' => 'Branch East', 'code' => 'BE01']);
    }
}
