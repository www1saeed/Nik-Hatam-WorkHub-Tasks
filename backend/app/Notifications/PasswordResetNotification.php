<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token, private readonly string $login)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $url = $frontendUrl.'/reset-password?login='.urlencode($this->login).'&token='.urlencode($this->token);

        $logoPath = app()->getLocale() === 'fa'
            ? public_path('icons/logo_fa.png')
            : public_path('icons/logo_en.png');
        $logoUrl = app()->getLocale() === 'fa'
            ? asset('icons/logo_fa.png')
            : asset('icons/logo_en.png');

        return (new MailMessage())
            ->subject(__('notifications.password_reset.subject'))
            ->view([
                'html' => 'notifications.password-reset',
                'text' => 'notifications.password-reset-text',
            ], [
                'greeting' => __('notifications.password_reset.greeting', [
                    'name' => $notifiable->name ?? '',
                ]),
                'intro' => __('notifications.password_reset.intro'),
                'actionText' => __('notifications.password_reset.action'),
                'actionUrl' => $url,
                'linkFallbackLabel' => __('notifications.password_reset.link_fallback_label'),
                'linkFallbackUrl' => $url,
                'ignoreLine' => __('notifications.password_reset.ignore'),
                'salutation' => __('notifications.password_reset.salutation', [
                    'name' => __('notifications.password_reset.salutation_name'),
                ]),
                'brandName' => config('app.name'),
                'brandLogoPath' => $logoPath,
                'brandLogoUrl' => $logoUrl,
                'isRtl' => app()->getLocale() === 'fa',
            ]);
    }
}
