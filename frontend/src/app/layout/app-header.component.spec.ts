import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { AppHeaderComponent } from './app-header.component';
import { AuthService } from '../core/services/auth.service';
import { LanguageService } from '../core/services/language.service';
import { SidebarService } from '../core/services/sidebar.service';
import { NotificationsService } from '../core/services/notifications.service';
import { ThemeService } from '../core/services/theme.service';

class BreakpointObserverStub {
  observe() {
    return of({ matches: false });
  }
}

describe('AppHeaderComponent', () => {
  let fixture: ComponentFixture<AppHeaderComponent>;
  let component: AppHeaderComponent;
  let router: {
    url: string;
    events: BehaviorSubject<NavigationEnd>;
    navigate: ReturnType<typeof vi.fn>;
    navigateByUrl: ReturnType<typeof vi.fn>;
  };
  let notificationsService: { markRead: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; refreshUnreadCount: ReturnType<typeof vi.fn>; unreadCount$: BehaviorSubject<number> };

  beforeEach(async () => {
    router = {
      url: '/dashboard',
      events: new BehaviorSubject(new NavigationEnd(1, '/dashboard', '/dashboard')),
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    notificationsService = {
      markRead: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      refreshUnreadCount: vi.fn().mockResolvedValue(0),
      unreadCount$: new BehaviorSubject(0),
    };

    await TestBed.configureTestingModule({
      imports: [AppHeaderComponent],
      providers: [
        { provide: BreakpointObserver, useClass: BreakpointObserverStub },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated$: of(true),
            currentUser$: of({ id: 1, first_name: 'Saeed', last_name: 'Hatami' }),
            currentUserValue: vi.fn().mockReturnValue({ id: 1 }),
            logout: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: LanguageService, useValue: { current$: of('en'), getLanguage: vi.fn().mockReturnValue('en'), setLanguage: vi.fn() } },
        { provide: SidebarService, useValue: { toggle: vi.fn() } },
        { provide: Router, useValue: router },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ThemeService, useValue: { current$: of('light'), setTheme: vi.fn(), getTheme: vi.fn().mockReturnValue('light') } },
        { provide: TranslocoService, useValue: { translate: vi.fn((key: string) => key) } },
      ],
    })
      .overrideComponent(AppHeaderComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AppHeaderComponent);
    component = fixture.componentInstance;
  });

  it('opens task detail deep-link when notification has task_id', async () => {
    await component.openNotification({
      id: 'n-1',
      event: 'task_assigned',
      task_id: 44,
      task_title: 'Task',
      actor: null,
      comment_excerpt: null,
      is_read: false,
      read_at: null,
      created_at: null,
    });

    expect(notificationsService.markRead).toHaveBeenCalledWith('n-1');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/tasks/new'], {
      queryParams: { open_task: 44 },
    });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to notifications page when notification has no task_id', async () => {
    await component.openNotification({
      id: 'n-2',
      event: 'other_event',
      task_id: null,
      task_title: 'Info',
      actor: null,
      comment_excerpt: null,
      is_read: true,
      read_at: null,
      created_at: null,
    });

    expect(notificationsService.markRead).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/notifications');
  });
});

