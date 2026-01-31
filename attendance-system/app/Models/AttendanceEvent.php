<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'origin_branch_id',
        'visited_branch_id',
        'attendance_date_time',
        'status',
        'created_by_user_id',
        'approved_by_user_id',
        'approved_at',
        'rejection_reason',
        'notes',
        'metadata',
    ];

    protected $casts = [
        'attendance_date_time' => 'datetime',
        'approved_at' => 'datetime',
        'metadata' => 'json',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function originBranch()
    {
        return $this->belongsTo(Branch::class, 'origin_branch_id');
    }

    public function visitedBranch()
    {
        return $this->belongsTo(Branch::class, 'visited_branch_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }
}
