<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Class Person
 *
 * Stores personal identity data shared by guest and booking workflows.
 *
 * @property int $id
 * @property string $first_name
 * @property string $last_name
 * @property string|null $email
 * @property string|null $birth_date
 * @property string|null $birth_place
 * @property string|null $father_name
 * @property string|null $residence
 * @property array $phone_numbers
 * @property array $addresses
 * @property string|null $avatar_path
 * @property string|null $id_number
 * @property string|null $passport_number
 * @property string|null $id_card_path
 * @property bool $is_confirmed
 */
class Person extends Model
{
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'birth_date',
        'birth_place',
        'father_name',
        'residence',
        'phone_numbers',
        'addresses',
        'avatar_path',
        'id_number',
        'passport_number',
        'id_card_path',
        'is_confirmed',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'phone_numbers' => 'array',
        'addresses' => 'array',
        'birth_date' => 'date',
        'is_confirmed' => 'boolean',
    ];

    /**
     * @return \Illuminate\Database\Eloquent\Casts\Attribute<string, string>
     */
    protected function fullName(): Attribute
    {
        return Attribute::get(fn () => trim("{$this->first_name} {$this->last_name}"));
    }

    /**
     * Get guests for the person.
     */
    public function guests(): HasMany
    {
        return $this->hasMany(Guest::class);
    }
}
