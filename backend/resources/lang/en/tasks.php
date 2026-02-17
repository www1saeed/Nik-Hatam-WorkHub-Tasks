<?php

return [
    'validation' => [
        'image_upload_failed' => 'Image upload failed. Try a smaller image or check PHP upload limits.',
        'image_too_large' => 'Image is too large. Maximum allowed size is 8 MB.',
    ],
    'system' => [
        'task_title_changed' => ':user changed the daily responsibility title from ":from" to ":to".',
        'task_status_changed' => ':user changed the status from :from to :to.',
        'task_starts_at_changed' => ':user changed the start time from :from to :to.',
        'task_ends_at_changed' => ':user changed the end time from :from to :to.',
        'task_assignees_changed' => ':user changed assignees from :from to :to.',
        'task_attachments_uploaded' => ':user added :count image(s) to this daily responsibility.',
        'task_attachment_deleted' => ':user deleted image ":title".',
        'status_open' => 'open',
        'status_done' => 'done',
        'empty' => 'empty',
    ],
];
