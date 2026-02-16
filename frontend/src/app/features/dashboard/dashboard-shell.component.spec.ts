import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { DashboardShellComponent } from './dashboard-shell.component';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { LanguageService } from '../../core/services/language.service';
import { UiLocale } from '../../core/utils/locale';

class BreakpointObserverStub {
  private readonly handset$ = new Subject<{ matches: boolean }>();
  private readonly compact$ = new Subject<{ matches: boolean }>();

  observe(query: string) {
    if (query.includes('max-width: 960px')) {
      return this.handset$.asObservable();
    }
    return this.compact$.asObservable();
  }

  emitHandset(matches: boolean): void {
    this.handset$.next({ matches });
  }

  emitCompact(matches: boolean): void {
    this.compact$.next({ matches });
  }
}

class AuthServiceStub {
  isAuthenticated$ = of(true);
  currentUser$ = of<AuthUser | null>({
    roles: [{ id: 1, name: 'Admin', slug: 'admin' }],
    permissions: []
  });
  logout = vi.fn().mockResolvedValue(undefined);
}

class SidebarServiceStub {
  private readonly subject = new Subject<void>();
  toggle$ = this.subject.asObservable();
  emitToggle(): void {
    this.subject.next();
  }
}

class LanguageServiceStub {
  current$ = of<UiLocale>('fa');
}

describe('DashboardShellComponent', () => {
  let fixture: ComponentFixture<DashboardShellComponent>;
  let component: DashboardShellComponent;
  let breakpoint: BreakpointObserverStub;
  let sidebar: SidebarServiceStub;
  let auth: AuthServiceStub;
  let router: Pick<Router, 'navigateByUrl'> & { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [DashboardShellComponent],
      providers: [
        { provide: BreakpointObserver, useClass: BreakpointObserverStub },
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: SidebarService, useClass: SidebarServiceStub },
        { provide: LanguageService, useClass: LanguageServiceStub },
        { provide: Router, useValue: router },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardShellComponent);
    component = fixture.componentInstance;
    breakpoint = TestBed.inject(BreakpointObserver) as unknown as BreakpointObserverStub;
    sidebar = TestBed.inject(SidebarService) as unknown as SidebarServiceStub;
    auth = TestBed.inject(AuthService) as unknown as AuthServiceStub;
  });

  it('toggles sidebar only on handset through sidebar service event', () => {
    breakpoint.emitHandset(false);
    sidebar.emitToggle();
    expect(component.isSidebarOpen).toBe(false);

    breakpoint.emitHandset(true);
    sidebar.emitToggle();
    expect(component.isSidebarOpen).toBe(true);
  });

  it('collapses manually only on non-handset', () => {
    breakpoint.emitHandset(true);
    component.toggleCollapse();
    expect(component.isCollapsed).toBe(false);

    breakpoint.emitHandset(false);
    component.toggleCollapse();
    expect(component.isCollapsed).toBe(true);
  });

  it('The sidebar folds down to compact desktop breakpoints.', () => {
    component.isCollapsed = false;
    breakpoint.emitCompact(true);
    expect(component.isCollapsed).toBe(true);
  });

  it('filters sections by permissions', () => {
    const user: AuthUser = {
      roles: [{ id: 2, name: 'Guest', slug: 'guest' }],
      permissions: [{ id: 1, name: 'Manage users', slug: 'manage_users' }]
    };
    const sections = component.getVisibleSections(user);
    const itemRoutes = sections.flatMap((section) => section.items.map((item) => item.route));
    expect(itemRoutes).toContain('/dashboard/users');
    expect(itemRoutes).not.toContain('/dashboard/roles');
    expect(itemRoutes).not.toContain('/dashboard/permissions');
  });

  it('logs out and navigates home', async () => {
    await component.logout();
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });
});
