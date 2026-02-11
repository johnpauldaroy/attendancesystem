<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Member extends Model
{
    use HasFactory;

    protected $fillable = [
        'cif_key',
        'member_no',
        'full_name',
        'origin_branch_id',
        'status',
        'birth_date',
        'age',
        'sex',
        'civil_status',
        'spouse_name',
        'educational_attainment',
        'contact_no',
        'telephone_no',
        'address',
        'unit_house_no',
        'barangay_village',
        'city_town',
        'province',
        'date_of_membership',
        'classification',
        'membership_type',
        'membership_status',
        'membership_update',
        'position',
        'segmentation',
        'attendance_status',
        'representatives_status',
        'attend_ra',
        'annual_income',
        'tin_no',
        'sss_no',
        'gsis_no',
        'is_temporary',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'date_of_membership' => 'date',
        'is_temporary' => 'boolean',
        'age' => 'integer',
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
