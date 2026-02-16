<?php

namespace Tests\Unit;

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\ProfilePresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ProfilePresenterTest extends TestCase
{
    use DatabaseTransactions;

    public function test_serialize_returns_expected_shape(): void
    {
        $user = User::factory()->create([
            'birth_date' => '2026-02-11',
            'phone_numbers' => [['type' => 'mobile', 'number' => '09120000000']],
            'addresses' => [['type' => 'home', 'address' => 'Tehran']],
        ]);
        SocialAccount::create([
            'user_id' => $user->id,
            'provider' => 'telegram',
            'provider_user_id' => 'tg-1',
            'data' => ['id' => 'tg-1'],
        ]);

        $payload = (new ProfilePresenter())->serialize($user);

        $this->assertSame($user->id, $payload['id']);
        $this->assertSame($user->username, $payload['username']);
        $this->assertSame('2026-02-11', $payload['birth_date']);
        $this->assertContains('telegram', $payload['social_providers']);
        $this->assertSame(false, $payload['email_required']);
        $this->assertIsArray($payload['phone_numbers']);
        $this->assertIsArray($payload['addresses']);
    }
}
