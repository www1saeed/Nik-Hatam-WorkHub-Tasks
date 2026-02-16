<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;
use App\Notifications\PasswordResetNotification;
use App\Models\Permission;
use App\Models\Role;

/**
 * Class User
 *
 * Represents an application user (admin or web), storing identity,
 * authentication, and profile data.
 *
 * @property int $id
 * @property string $username
 * @property string $first_name
 * @property string $last_name
 * @property string|null $email
 * @property string|null $birth_date
 * @property array $phone_numbers
 * @property array $addresses
 * @property string|null $id_number
 * @property string|null $iban
 * @property string|null $avatar_path
 * @property string|null $admin_locale
 */
class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    /**
     * @var array<int, string>
     */
    protected $fillable = [
        'username',
        'first_name',
        'last_name',
        'email',
        'birth_date',
        'phone_numbers',
        'addresses',
        'id_number',
        'iban',
        'avatar_path',
        'admin_locale',
        'password',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'phone_numbers' => 'array',
        'addresses' => 'array',
        'birth_date' => 'date',
    ];

    /**
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Bootstrap model events.
     */
    protected static function booted(): void
    {
        static::updating(function (self $user): void {
            if ($user->isDirty('avatar_path')) {
                $original = $user->getOriginal('avatar_path');
                if ($original) {
                    Storage::disk('public')->delete($original);
                }
            }
        });
    }

    /**
     * Get the tasks assigned to the user.
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    /**
     * Get the tasks created by the user.
     */
    public function createdTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'created_by');
    }

    /**
     * Get the shifts for the user.
     */
    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    /**
     * Get the time entries for the user.
     */
    public function timeEntries(): HasMany
    {
        return $this->hasMany(TimeEntry::class);
    }

    /**
     * Get the leave requests for the user.
     */
    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    /**
     * Get linked social accounts.
     */
    public function socialAccounts(): HasMany
    {
        return $this->hasMany(SocialAccount::class);
    }

    /**
     * Normalize usernames to lowercase for consistent uniqueness checks.
     *
     * @param string|null $value
     */
    public function setUsernameAttribute(?string $value): void
    {
        $this->attributes['username'] = $value !== null ? Str::lower($value) : null;
    }

    /**
     * User roles.
     */
    public function roles(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withTimestamps();
    }

    /**
     * User permissions via roles.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Permission>
     */
    public function permissions(): \Illuminate\Support\Collection
    {
        $roleIds = $this->roles()->pluck('roles.id');

        return Permission::query()
            ->whereHas('roles', fn ($query) => $query->whereIn('roles.id', $roleIds))
            ->get();
    }

    /**
     * Check if user has a role.
     */
    public function hasRole(string $slug): bool
    {
        return $this->roles()->where('slug', $slug)->exists();
    }

    /**
     * Check if user has a permission via roles (admin bypass).
     */
    public function hasPermission(string $slug): bool
    {
        if ($this->hasRole('admin')) {
            return true;
        }

        $roleIds = $this->roles()->pluck('roles.id');

        return Permission::query()
            ->where('slug', $slug)
            ->whereHas('roles', fn ($query) => $query->whereIn('roles.id', $roleIds))
            ->exists();
    }

    /**
     * Get verification codes for the user.
     */
    public function verificationCodes(): HasMany
    {
        return $this->hasMany(VerificationCode::class);
    }

    /**
     * Full display name for notifications.
     */
    public function getNameAttribute(): string
    {
        return trim(($this->first_name ?? '').' '.($this->last_name ?? ''));
    }

    /**
     * Send the password reset notification.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new PasswordResetNotification($token, $this->email ?? $this->username));
    }
}
