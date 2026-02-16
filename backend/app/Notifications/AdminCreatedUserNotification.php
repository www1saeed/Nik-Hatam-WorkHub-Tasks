<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AdminCreatedUserNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $username,
        private readonly string $password,
        private readonly string $loginUrl
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $logoPath = app()->getLocale() === 'fa'
            ? public_path('icons/logo_fa.png')
            : public_path('icons/logo_en.png');
        $logoUrl = app()->getLocale() === 'fa'
            ? asset('icons/logo_fa.png')
            : asset('icons/logo_en.png');

        return (new MailMessage())
            ->subject(__('notifications.admin_created_user.subject'))
            ->view([
                'html' => 'notifications.admin-created-user',
                'text' => 'notifications.admin-created-user-text',
            ], [
                'greeting' => __('notifications.admin_created_user.greeting', [
                    'name' => $notifiable->name ?? '',
                ]),
                'intro' => __('notifications.admin_created_user.intro'),
                'usernameLabel' => __('notifications.admin_created_user.username'),
                'passwordLabel' => __('notifications.admin_created_user.password'),
                'usernameValue' => $this->username,
                'passwordValue' => $this->password,
                'passwordHint' => __('notifications.admin_created_user.password_hint'),
                'actionText' => __('notifications.admin_created_user.action'),
                'actionUrl' => $this->loginUrl,
                'linkFallbackLabel' => __('notifications.admin_created_user.link_fallback_label'),
                'linkFallbackUrl' => $this->loginUrl,
                'salutation' => __('notifications.admin_created_user.salutation', [
                    'name' => __('notifications.admin_created_user.salutation_name'),
                ]),
                'brandName' => config('app.name'),
                'brandLogoPath' => $logoPath,
                'brandLogoUrl' => $logoUrl,
                'isRtl' => app()->getLocale() === 'fa',
            ]);
    }
}
