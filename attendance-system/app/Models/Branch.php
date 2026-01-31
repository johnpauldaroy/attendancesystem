<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Branch extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function members()
    {
        return $this->hasMany(Member::class, 'origin_branch_id');
    }

    public function attendanceEvents()
    {
        return $this->hasMany(AttendanceEvent::class, 'origin_branch_id');
    }

    public function visitedEvents()
    {
        return $this->hasMany(AttendanceEvent::class, 'visited_branch_id');
    }
}
