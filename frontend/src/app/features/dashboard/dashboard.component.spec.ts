import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../core/services/auth.service';
import { AdminUsersService } from '../../core/services/admin-users.service';
import { TasksService } from '../../core/services/tasks.service';
import { LanguageService } from '../../core/services/language.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            hasPermission: vi.fn().mockReturnValue(false),
            currentUserValue: vi.fn().mockReturnValue(null),
          },
        },
        {
          provide: AdminUsersService,
          useValue: {
            list: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TasksService,
          useValue: {
            list: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: LanguageService,
          useValue: {
            getLanguage: vi.fn().mockReturnValue('en'),
          },
        },
      ],
    })
      .overrideComponent(DashboardComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('creates component instance', () => {
    expect(component).toBeTruthy();
  });
});
