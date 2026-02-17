import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { NotificationsPageComponent } from './notifications-page.component';
import { NotificationsService } from '../../core/services/notifications.service';
import { LanguageService } from '../../core/services/language.service';
import { DevicePushService } from '../../core/services/device-push.service';

interface NotificationsPagePrototype {
  loadNotifications: (silent?: boolean) => Promise<void>;
  refreshPushState: () => Promise<void>;
}

describe('NotificationsPageComponent', () => {
  let fixture: ComponentFixture<NotificationsPageComponent>;
  let component: NotificationsPageComponent;
  let router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let notificationsService: {
    getCachedNotifications: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const prototype = NotificationsPageComponent.prototype as unknown as NotificationsPagePrototype;

    vi.spyOn(prototype, 'loadNotifications').mockResolvedValue(
      undefined,
    );
    vi.spyOn(prototype, 'refreshPushState').mockResolvedValue(
      undefined,
    );

    router = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    notificationsService = {
      getCachedNotifications: vi.fn().mockReturnValue([]),
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationsPageComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: LanguageService,
          useValue: { getLanguage: vi.fn().mockReturnValue('en'), current$: of('en') },
        },
        {
          provide: DevicePushService,
          useValue: {
            isSupported: vi.fn().mockReturnValue(false),
            permission: vi.fn().mockReturnValue('default'),
            isEnabled: vi.fn().mockResolvedValue(false),
            enable: vi.fn().mockResolvedValue(undefined),
            disable: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TranslocoService,
          useValue: { translate: vi.fn((key: string) => key) },
        },
      ],
    })
      .overrideComponent(NotificationsPageComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(NotificationsPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to task detail deep-link when task_id exists', async () => {
    await component.openTask({
      id: 'n-1',
      event: 'task_assigned',
      task_id: 77,
      task_title: 'Task',
      actor: null,
      comment_excerpt: null,
      is_read: false,
      read_at: null,
      created_at: null,
    });

    expect(notificationsService.markRead).toHaveBeenCalledWith('n-1');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/tasks/new'], {
      queryParams: { open_task: 77 },
    });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to tasks page when task_id is missing', async () => {
    await component.openTask({
      id: 'n-2',
      event: 'task_comment',
      task_id: null,
      task_title: 'Task',
      actor: null,
      comment_excerpt: null,
      is_read: true,
      read_at: '2026-02-17T10:00:00Z',
      created_at: '2026-02-17T09:59:00Z',
    });

    expect(notificationsService.markRead).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/tasks/new');
  });
});
