<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EmailVerificationCodeNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $code, private readonly string $email)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $url = $frontendUrl.'/verify-email?email='.urlencode($this->email).'&code='.urlencode($this->code);

        $actionText = __('notifications.email_verification.action');
        $salutationName = __('notifications.email_verification.salutation_name');

        $logoPath = app()->getLocale() === 'fa'
            ? public_path('icons/logo_fa.png')
            : public_path('icons/logo_en.png');
        $logoUrl = app()->getLocale() === 'fa'
            ? asset('icons/logo_fa.png')
            : asset('icons/logo_en.png');

        return (new MailMessage())
            ->subject(__('notifications.email_verification.subject'))
            ->view([
                'html' => 'notifications.email-verification',
                'text' => 'notifications.email-verification-text',
            ], [
                'greeting' => __('notifications.email_verification.greeting', [
                    'name' => $notifiable->name ?? '',
                ]),
                'thanks' => __('notifications.email_verification.thanks'),
                'intro' => __('notifications.email_verification.intro'),
                'codeLine' => __('notifications.email_verification.code', ['code' => $this->code]),
                'actionText' => $actionText,
                'actionUrl' => $url,
                'linkFallbackLabel' => __('notifications.email_verification.link_fallback_label'),
                'linkFallbackUrl' => $url,
                'ignoreLine' => __('notifications.email_verification.ignore'),
                'salutation' => __('notifications.email_verification.salutation', [
                    'name' => $salutationName,
                ]),
                'brandName' => config('app.name'),
                'brandLogoPath' => $logoPath,
                'brandLogoUrl' => $logoUrl,
                'isRtl' => app()->getLocale() === 'fa',
            ]);
    }
}
