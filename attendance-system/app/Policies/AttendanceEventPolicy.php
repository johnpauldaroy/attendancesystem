<?php

namespace App\Policies;

use App\Models\AttendanceEvent;
use App\Models\User;

class AttendanceEventPolicy
{
    /**
     * Determine whether the user can approve the model.
     */
    public function approve(User $user, AttendanceEvent $attendance): bool
    {
        if ($user->role === 'SUPER_ADMIN') {
            return true;
        }

        return in_array($user->role, ['APPROVER', 'BRANCH_ADMIN']) && $user->branch_id === $attendance->origin_branch_id;
    }

    /**
     * Determine whether the user can reject the model.
     */
    public function reject(User $user, AttendanceEvent $attendance): bool
    {
        return $this->approve($user, $attendance);
    }
}
