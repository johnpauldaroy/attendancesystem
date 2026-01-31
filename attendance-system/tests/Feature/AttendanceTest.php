<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Member;
use App\Models\User;
use App\Models\AttendanceEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Laravel\Sanctum\Sanctum;

class AttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected $branchA;
    protected $branchB;
    protected $staffA;
    protected $approverB;
    protected $memberA;
    protected $memberB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branchA = Branch::create(['name' => 'Branch A', 'code' => 'BA01']);
        $this->branchB = Branch::create(['name' => 'Branch B', 'code' => 'BB01']);

        $this->staffA = User::create([
            'name' => 'Staff A',
            'email' => 'staffA@test.com',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'branch_id' => $this->branchA->id,
        ]);

        $this->approverB = User::create([
            'name' => 'Approver B',
            'email' => 'approverB@test.com',
            'password' => bcrypt('password'),
            'role' => 'APPROVER',
            'branch_id' => $this->branchB->id,
        ]);

        $this->memberA = Member::create([
            'member_no' => 'M001',
            'full_name' => 'Member A',
            'origin_branch_id' => $this->branchA->id,
        ]);

        $this->memberB = Member::create([
            'member_no' => 'M002',
            'full_name' => 'Member B',
            'origin_branch_id' => $this->branchB->id,
        ]);
    }

    public function test_auto_approves_if_same_branch()
    {
        Sanctum::actingAs($this->staffA);

        $response = $this->postJson('/api/attendance', [
            'member_id' => $this->memberA->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('status', 'APPROVED');

        $this->assertDatabaseHas('attendance_events', [
            'member_id' => $this->memberA->id,
            'status' => 'APPROVED',
            'approved_by_user_id' => $this->staffA->id,
        ]);
    }

    public function test_pending_if_different_branch()
    {
        Sanctum::actingAs($this->staffA);

        $response = $this->postJson('/api/attendance', [
            'member_id' => $this->memberB->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('status', 'PENDING');

        $this->assertDatabaseHas('attendance_events', [
            'member_id' => $this->memberB->id,
            'status' => 'PENDING',
        ]);
    }

    public function test_prevent_duplicate_attendance_same_day()
    {
        Sanctum::actingAs($this->staffA);

        // First log
        $this->postJson('/api/attendance', ['member_id' => $this->memberA->id]);

        // Second log same day
        $response = $this->postJson('/api/attendance', ['member_id' => $this->memberA->id]);

        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'Attendance already logged for this member today.']);
    }

    public function test_approver_can_approve_own_branch_member()
    {
        // Create pending attendance for member B (origin Branch B)
        $attendance = AttendanceEvent::create([
            'member_id' => $this->memberB->id,
            'origin_branch_id' => $this->branchB->id,
            'visited_branch_id' => $this->branchA->id,
            'attendance_date_time' => now(),
            'status' => 'PENDING',
            'created_by_user_id' => $this->staffA->id,
        ]);

        Sanctum::actingAs($this->approverB);

        $response = $this->postJson("/api/attendance/{$attendance->id}/approve");

        $response->assertStatus(200);
        $this->assertEquals('APPROVED', $attendance->fresh()->status);
    }

    public function test_approver_cannot_approve_other_branch_member()
    {
        // Create pending attendance for member A (origin Branch A)
        $attendance = AttendanceEvent::create([
            'member_id' => $this->memberA->id,
            'origin_branch_id' => $this->branchA->id,
            'visited_branch_id' => $this->branchB->id,
            'attendance_date_time' => now(),
            'status' => 'PENDING',
            'created_by_user_id' => $this->approverB->id,
        ]);

        Sanctum::actingAs($this->approverB); // Approver is in Branch B, but member is Branch A

        $response = $this->postJson("/api/attendance/{$attendance->id}/approve");

        $response->assertStatus(403);
    }
}
