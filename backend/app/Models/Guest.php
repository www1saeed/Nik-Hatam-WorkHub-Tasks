<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Class Guest
 *
 * Represents a guest profile used for bookings.
 *
 * @property int $id
 * @property int $person_id
 * @property int|null $rating
 * @property float $discount_percent
 */
class Guest extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $fillable = [
        'person_id',
        'rating',
        'discount_percent',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'discount_percent' => 'decimal:2',
    ];

    /**
     * Proxy full name from person.
     *
     * @return \Illuminate\Database\Eloquent\Casts\Attribute<string, string>
     */
    protected function fullName(): Attribute
    {
        return Attribute::get(fn () => $this->person?->full_name ?? '');
    }

    /**
     * Guest belongs to person.
     */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /**
     * Get companions for the guest.
     */
    public function companions(): HasMany
    {
        return $this->hasMany(Companion::class);
    }

    /**
     * Get booking requests for the guest.
     */
    public function bookingRequests(): HasMany
    {
        return $this->hasMany(BookingRequest::class);
    }

    /**
     * Get bookings for the guest.
     */
    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    /**
     * Get voucher redemptions for the guest.
     */
    public function voucherRedemptions(): HasMany
    {
        return $this->hasMany(VoucherRedemption::class);
    }
}
