@php
    $direction = $isRtl ? 'rtl' : 'ltr';
    $align = $isRtl ? 'right' : 'left';
    $fontFamily = $isRtl ? 'Tahoma, Arial, sans-serif' : 'Arial, sans-serif';
@endphp

<div dir="ltr" style="background-color:#f6f9fc; padding:24px 0; font-family:{{ $fontFamily }};">
    @php
        $logoSrc = isset($message, $brandLogoPath) && $brandLogoPath
            ? $message->embed($brandLogoPath)
            : ($brandLogoUrl ?? null);
    @endphp
    <table dir="{{ $direction }}" align="center" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:10px; border:1px solid #e5e7eb;">
        <tr>
            <td style="padding:24px; text-align:center;">
                @if ($logoSrc)
                    <img src="{{ $logoSrc }}" alt="{{ $brandName }}" style="height:48px; width:auto; margin:0 auto 8px;">
                @endif
            </td>
        </tr>
        <tr>
            <td style="padding:0 24px 24px; text-align:{{ $align }}; color:#111827; font-size:14px; line-height:1.7;">
                @if (! empty($greeting))
                    <div style="font-size:18px; font-weight:bold; margin-bottom:12px;">{{ $greeting }}</div>
                @endif

                <div style="margin-bottom:16px;">{{ $intro }}</div>

                <div style="text-align:center; margin:20px 0;">
                    <a href="{{ $actionUrl }}" style="background:#2563eb; color:#ffffff; text-decoration:none; padding:10px 18px; border-radius:6px; display:inline-block;">
                        {{ $actionText }}
                    </a>
                </div>

                <div style="margin-bottom:6px;">{{ $linkFallbackLabel }}</div>
                <div style="margin-bottom:12px; color:#2563eb;">{{ $linkFallbackUrl }}</div>
                <div style="margin-bottom:12px;">{{ $ignoreLine }}</div>

                @if (! empty($salutation))
                    <div style="margin-top:16px;">{{ $salutation }}</div>
                @endif
            </td>
        </tr>
    </table>
    <div style="max-width:600px; margin:12px auto 0; color:#9ca3af; font-size:12px; text-align:center;">
        (c) 2026 Nik Hatam WorkHub. All rights reserved.
        <div style="margin-top:6px;">
            <a href="{{ config('app.url') }}" style="color:#2563eb; text-decoration:none;">
                {{ config('app.url') }}
            </a>
        </div>
    </div>
</div>

