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
        Schema::create('members', function (Blueprint $table) {
            $table->id();
            $table->string('cif_key')->unique();
            $table->string('member_no')->nullable(); // Keeping for compatibility, usually same as cif_key
            $table->string('full_name')->index();
            $table->foreignId('origin_branch_id')->constrained('branches')->index();
            $table->string('status')->default('ACTIVE')->index();
            
            // Personal Info
            $table->date('birth_date')->nullable();
            $table->integer('age')->nullable();
            $table->string('sex')->nullable();
            $table->string('civil_status')->nullable();
            $table->string('spouse_name')->nullable();
            $table->string('educational_attainment')->nullable();

            // Contact & Address
            $table->string('contact_no')->nullable();
            $table->string('telephone_no')->nullable();
            $table->string('address')->nullable();
            $table->string('unit_house_no')->nullable();
            $table->string('barangay_village')->nullable();
            $table->string('city_town')->nullable();
            $table->string('province')->nullable();

            // Membership Details
            $table->date('date_of_membership')->nullable();
            $table->string('classification')->nullable();
            $table->string('membership_type')->nullable();
            $table->string('membership_status')->nullable();
            $table->string('membership_update')->nullable();
            $table->string('position')->nullable();
            $table->string('segmentation')->nullable();
            $table->string('attendance_status')->nullable();
            $table->string('representatives_status')->nullable();
            $table->string('attend_ra')->nullable();

            // Financial & Gov
            $table->string('annual_income')->nullable();
            $table->string('tin_no')->nullable();
            $table->string('sss_no')->nullable();
            $table->string('gsis_no')->nullable();

            // System Flags
            $table->boolean('is_temporary')->default(false);
            
            $table->timestamps();

            if (config('database.default') === 'mysql') {
                $table->fullText('full_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};
