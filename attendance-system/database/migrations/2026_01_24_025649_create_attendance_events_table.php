<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('attendance_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('member_id');
            $table->unsignedBigInteger('origin_branch_id')->index();
            $table->unsignedBigInteger('visited_branch_id');
            $table->dateTime('attendance_date_time');
            $table->enum('status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])->default('PENDING');
            $table->unsignedBigInteger('created_by_user_id');
            $table->unsignedBigInteger('approved_by_user_id')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            // Explicit Foreign Keys with short, unique names
            $table->foreign('member_id', 'ae_mem_fk')->references('id')->on('members');
            $table->foreign('origin_branch_id', 'ae_ob_fk')->references('id')->on('branches');
            $table->foreign('visited_branch_id', 'ae_vb_fk')->references('id')->on('branches');
            $table->foreign('created_by_user_id', 'ae_c_fk')->references('id')->on('users');
            $table->foreign('approved_by_user_id', 'ae_a_fk')->references('id')->on('users');

            $table->index(['origin_branch_id', 'status', 'attendance_date_time'], 'ae_obsd_idx');
            $table->index(['visited_branch_id', 'attendance_date_time'], 'ae_vbd_idx');
            $table->index(['member_id', 'attendance_date_time'], 'ae_md_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance_events');
    }
};
