<?php

return [
    'email_verification' => [
        'greeting' => 'Hello :name!',
        'thanks' => 'Thank you for your interest and for registering with Nik Hatam Hotel.',
        'subject' => 'Verify your email address',
        'intro' => 'Use the verification code below to confirm your email address.',
        'code' => 'Verification code: :code',
        'action' => 'Verify email',
        'link_fallback_label' => 'If the button does not work, open this link:',
        'ignore' => 'If you did not request this, please ignore this email.',
        'salutation_name' => 'Nik Hatam Hotel Manager',
        'salutation' => 'Regards, :name',
    ],
    'password_reset' => [
        'greeting' => 'Hello :name!',
        'subject' => 'Reset your password',
        'intro' => 'Click the link below to reset your password.',
        'action' => 'Reset password',
        'link_fallback_label' => 'If the button does not work, open this link:',
        'ignore' => 'If you did not request this, please ignore this email.',
        'salutation_name' => 'Nik Hatam Hotel Manager',
        'salutation' => 'Regards, :name',
    ],
    'admin_created_user' => [
        'greeting' => 'Hello :name!',
        'subject' => 'Your account has been created',
        'intro' => 'An administrator created your account in Nik Hatam Hotel Manager.',
        'username' => 'Username:',
        'password' => 'Password:',
        'password_hint' => 'For security, please change your password after your first login.',
        'action' => 'Login to the dashboard',
        'link_fallback_label' => 'If the button does not work, open this link:',
        'salutation_name' => 'Nik Hatam Hotel Manager',
        'salutation' => 'Regards, :name',
    ],
    'task_push' => [
        'title' => [
            'task_assigned' => 'Daily responsibility assigned',
            'task_comment' => 'New comment on responsibility',
            'default' => 'Notification',
        ],
        'body' => [
            'task_assigned' => ':actor assigned this responsibility to you: :task_title',
            'task_comment' => ':actor commented on ":task_title"',
            'task_comment_with_excerpt' => ':actor commented on ":task_title": :comment_excerpt',
        ],
        'defaults' => [
            'user' => 'User',
        ],
    ],
];
