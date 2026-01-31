<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Member extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_no',
        'full_name',
        'origin_branch_id',
        'status',
        'contact',
        'address',
        'birthdate',
    ];

    public function originBranch()
    {
        return $this->belongsTo(Branch::class, 'origin_branch_id');
    }

    public function attendanceEvents()
    {
        return $this->hasMany(AttendanceEvent::class);
    }
}
