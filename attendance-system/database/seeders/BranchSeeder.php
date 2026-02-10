<?php

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        $branches = [
            'Barbaza Main',
            'Culasi',
            'Sibalom',
            'San Jose',
            'Balasan',
            'Barotac Viejo',
            'Caticlan',
            'Molo',
            'Kalibo',
            'Janiuay',
            'Calinog',
            'Sara',
            'President Roxas',
        ];

        foreach ($branches as $name) {
            Branch::updateOrCreate(
                ['name' => $name],
                ['code' => strtoupper(str_replace(' ', '_', $name))]
            );
        }
    }
}
