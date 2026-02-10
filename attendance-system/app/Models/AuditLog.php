<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'actor_user_id',
        'action_type',
        'entity_type',
        'entity_id',
        'before',
        'after',
        'ip_address',
        'user_agent',
        'created_at',
    ];

    protected $casts = [
        'before' => 'json',
        'after' => 'json',
        'created_at' => 'datetime',
    ];

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    public static function record($entity, $actionType, $before = null, $after = null, $note = null)
    {
        $actorId = \Illuminate\Support\Facades\Auth::id();
        $entityType = class_basename($entity);

        // Logic to consolidate MEMBER_UPDATE within 1 hour for the same actor and member
        if ($actionType === 'MEMBER_UPDATE') {
            $existing = self::where('action_type', 'MEMBER_UPDATE')
                ->where('entity_type', $entityType)
                ->where('entity_id', $entity->id)
                ->where('actor_user_id', $actorId)
                ->where('created_at', '>=', now()->subHour())
                ->latest()
                ->first();

            if ($existing) {
                // Keep the original 'before' if it already exists in the log
                // Update 'after' to the current state
                $existing->update([
                    'after' => $after ? array_merge($after, ['note' => $note]) : ($note ? ['note' => $note] : null),
                    'created_at' => now(), // Move to top of history
                ]);
                return $existing;
            }
        }

        return self::create([
            'actor_user_id' => $actorId,
            'action_type' => $actionType,
            'entity_type' => $entityType,
            'entity_id' => $entity->id,
            'before' => $before,
            'after' => $after ? array_merge($after, ['note' => $note]) : ($note ? ['note' => $note] : null),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'created_at' => now(),
        ]);
    }
}
