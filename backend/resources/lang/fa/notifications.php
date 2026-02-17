<?php

return [
    'email_verification' => [
        'greeting' => 'سلام :name!',
        'thanks' => 'از ثبت‌نام شما در هتل نیک حاتم سپاسگزاریم.',
        'subject' => 'تایید آدرس ایمیل',
        'intro' => 'برای تایید ایمیل خود از کد زیر استفاده کنید.',
        'code' => 'کد تایید: :code',
        'action' => 'تایید ایمیل',
        'link_fallback_label' => 'اگر دکمه کار نکرد، این لینک را باز کنید:',
        'ignore' => 'اگر این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.',
        'salutation_name' => 'مدیریت هتل نیک حاتم',
        'salutation' => 'با احترام، :name',
    ],
    'password_reset' => [
        'greeting' => 'سلام :name!',
        'subject' => 'بازنشانی رمز عبور',
        'intro' => 'برای بازنشانی رمز عبور روی لینک زیر کلیک کنید.',
        'action' => 'بازنشانی رمز عبور',
        'link_fallback_label' => 'اگر دکمه کار نکرد، این لینک را باز کنید:',
        'ignore' => 'اگر این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.',
        'salutation_name' => 'مدیریت هتل نیک حاتم',
        'salutation' => 'با احترام، :name',
    ],
    'admin_created_user' => [
        'greeting' => 'سلام :name!',
        'subject' => 'حساب کاربری شما ایجاد شد',
        'intro' => 'حساب کاربری شما در سامانه مدیریت هتل نیک حاتم ایجاد شده است.',
        'username' => 'نام کاربری:',
        'password' => 'رمز عبور:',
        'password_hint' => 'برای امنیت بیشتر بعد از ورود، رمز عبور خود را تغییر دهید.',
        'action' => 'ورود به سامانه',
        'link_fallback_label' => 'اگر دکمه کار نکرد، این لینک را باز کنید:',
        'salutation_name' => 'مدیریت هتل نیک حاتم',
        'salutation' => 'با احترام، :name',
    ],
    'task_push' => [
        'title' => [
            'task_assigned' => 'مسئولیت روزانه جدید',
            'task_comment' => 'کامنت جدید روی مسئولیت',
            'default' => 'اعلان',
        ],
        'body' => [
            'task_assigned' => ':actor این مسئولیت را به شما واگذار کرد: :task_title',
            'task_comment' => ':actor برای «:task_title» کامنت گذاشت',
            'task_comment_with_excerpt' => ':actor برای «:task_title» کامنت گذاشت: :comment_excerpt',
        ],
        'defaults' => [
            'user' => 'کاربر',
        ],
    ],
];
