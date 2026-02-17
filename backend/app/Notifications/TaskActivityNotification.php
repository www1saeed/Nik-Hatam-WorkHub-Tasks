<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class TaskActivityNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $event,
        private readonly int $taskId,
        private readonly string $taskTitle,
        private readonly ?array $actor,
        private readonly ?string $commentExcerpt = null
    ) {
    }

    /**
     * Persist as database notification so the UI can list/read items.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * Serialize notification payload.
     *
     * We store neutral event metadata (not translated full text) so the
     * frontend can render language-specific messages at runtime (FA/EN).
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'event' => $this->event,
            'task_id' => $this->taskId,
            'task_title' => $this->taskTitle,
            'actor' => $this->actor,
            'comment_excerpt' => $this->commentExcerpt,
        ];
    }
}

