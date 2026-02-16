import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AdminUsersService } from '../../../../core/services/admin-users.service';
import { AdminRolesService } from '../../../../core/services/admin-roles.service';
import { UsersPageComponent } from './users-page.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Pipe({ name: 'transloco', standalone: true })
class MockTranslocoPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('UsersPageComponent', () => {
  let fixture: ComponentFixture<UsersPageComponent>;
  let component: UsersPageComponent;
  const usersService = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    sendPasswordReset: vi.fn(),
    createPasswordResetLink: vi.fn(),
  };
  const rolesService = {
    list: vi.fn(),
  };
  const transloco = {
    langChanges$: of('en'),
    getActiveLang: vi.fn(() => 'en'),
    translate: vi.fn((key: string) => key),
    selectTranslation: vi.fn(() => of({ admin: { roles: { labels: { guest: 'Guest' } } } })),
  };
  const router = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    usersService.list.mockResolvedValue([
      {
        id: 1,
        username: 'unverified',
        first_name: 'A',
        last_name: 'B',
        email: 'u@test.dev',
        email_verified_at: null,
        social_providers: ['telegram'],
        roles: [{ id: 4, name: 'Guest', slug: 'guest' }],
      },
      {
        id: 2,
        username: 'verified',
        first_name: 'C',
        last_name: 'D',
        email: 'v@test.dev',
        email_verified_at: '2026-01-01',
        roles: [{ id: 4, name: 'Guest', slug: 'guest' }],
      },
    ]);
    rolesService.list.mockResolvedValue([
      { id: 4, name: 'Guest', slug: 'guest', permissions: [] },
    ]);
    usersService.create.mockResolvedValue({
      id: 3,
      username: 'newuser',
      first_name: 'New',
      last_name: 'User',
      roles: [],
    });

    await TestBed.configureTestingModule({
      imports: [UsersPageComponent],
      providers: [
        { provide: AdminUsersService, useValue: usersService },
        { provide: AdminRolesService, useValue: rolesService },
        { provide: TranslocoService, useValue: transloco },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(UsersPageComponent, {
        remove: { imports: [TranslocoPipe] },
        add: { imports: [MockTranslocoPipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UsersPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(false);
    await fixture.whenStable();
    fixture.detectChanges(false);
  });

  it('filters unverified users', () => {
    component.setVerificationFilter('unverified');
    fixture.detectChanges(false);
    expect(component.filteredUsers.length).toBe(1);
    expect(component.filteredUsers[0].username).toBe('unverified');
  });

  it('renders user rows and social provider icon', () => {
    const rows = fixture.nativeElement.querySelectorAll('.admin-table__row');
    expect(rows.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.admin-table__social.pi-telegram')).toBeTruthy();
  });

  it('renders action cells with data labels for mobile table mode', () => {
    const actionCell = fixture.nativeElement.querySelector('.admin-table__actions.admin-table__cell') as HTMLElement;
    expect(actionCell).toBeTruthy();
    expect(actionCell.getAttribute('data-label')).toBe('admin.actions.title');
  });

  it('does not render legacy page-level error banner in normal state', () => {
    expect(fixture.nativeElement.querySelector('.admin-page__error')).toBeFalsy();
  });

  it('creates user with lowercased username', async () => {
    component.startCreate();
    component.form.patchValue({
      username: 'UPPER.USER',
      first_name: 'New',
      last_name: 'User',
      email: 'new@test.dev',
      password: 'Secret123A!',
      role_ids: [4],
    });

    await component.save();

    expect(usersService.create).toHaveBeenCalledWith({
      username: 'upper.user',
      first_name: 'New',
      last_name: 'User',
      email: 'new@test.dev',
      password: 'Secret123A!',
      role_ids: [4],
      locale: 'en',
    });
  });

  it('toggles sorting and updates page size', () => {
    component.setSort('username');
    expect(component.sortDir).toBe('desc');
    component.setSort('name');
    expect(component.sortKey).toBe('name');
    expect(component.sortDir).toBe('asc');

    component.page = 3;
    component.updatePageSize('5');
    expect(component.pageSize).toBe(5);
    expect(component.page).toBe(1);
  });

  it('falls back to all verification filter for unknown values', () => {
    component.setVerificationFilter('x');
    expect(component.verificationFilter).toBe('all');
  });

  it('opens and resets password reset email modal state', async () => {
    const user = component.users[0];
    component.openResetEmail(user);
    expect(component.resetMode).toBe('email');
    expect(component.resetEmailNeedsConfirm).toBe(true);

    usersService.sendPasswordReset.mockResolvedValue(undefined);
    await component.confirmSendResetEmail();
    expect(usersService.sendPasswordReset).toHaveBeenCalledWith(user.id, 'en');
    expect(component.resetSuccessMessage).toBe('admin.users.reset_email_sent');

    component.closeResetModal();
    expect(component.resetTarget).toBeNull();
    expect(component.resetMode).toBeNull();
  });

  it('navigates to profile from list action', () => {
    component.goToProfile(component.users[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/users', 1, 'profile']);
  });

  it('maps load failure to page error and clears loading flag', async () => {
    usersService.list.mockRejectedValueOnce(new Error('boom'));
    rolesService.list.mockResolvedValueOnce([]);

    await component.load();
    expect(component.errorMessage).toBe('auth.errors.unknown');
    expect(component.isLoading).toBe(false);
  });

  it('sets verified filter branch and page formatting in fa', () => {
    transloco.getActiveLang.mockReturnValue('fa');
    component.setVerificationFilter('verified');
    expect(component.filteredUsers.length).toBe(1);
    expect(component.filteredUsers[0].username).toBe('verified');
    expect(component.formatPageNumber(12)).not.toBe('12');
  });

  it('returns early when save is invalid', async () => {
    const callsBefore = usersService.create.mock.calls.length;
    component.startCreate();
    component.form.patchValue({
      username: '',
      first_name: '',
      last_name: '',
      email: 'invalid-email',
      password: '',
      role_ids: [],
    });

    await component.save();
    expect(usersService.create.mock.calls.length).toBe(callsBefore);
  });

  it('maps duplicate field errors into modal errors on save', async () => {
    component.startCreate();
    component.form.patchValue({
      username: 'dup',
      first_name: 'A',
      last_name: 'B',
      email: 'dup@test.dev',
      password: 'Secret123A!',
      role_ids: [4],
    });
    usersService.create.mockRejectedValueOnce(new Error('save failed'));

    await component.save();
    expect(component.formErrorMessage).toBe('auth.errors.unknown');
  });

  it('handles delete branches (no target and failure)', async () => {
    const callsBefore = usersService.remove.mock.calls.length;
    await component.removeConfirmed();
    expect(usersService.remove.mock.calls.length).toBe(callsBefore);

    component.confirmDelete(component.users[0]);
    usersService.remove.mockRejectedValueOnce(new Error('delete failed'));
    await component.removeConfirmed();
    expect(component.deleteErrorMessage).toBe('auth.errors.unknown');
  });

  it('handles reset email and qr failures inside reset modal', async () => {
    const user = component.users[0];

    component.openResetEmail(user);
    usersService.sendPasswordReset.mockRejectedValueOnce(new Error('failed'));
    await component.confirmSendResetEmail();
    expect(component.resetErrorMessage).toBe('auth.errors.unknown');
    expect(component.isResetBusy).toBe(false);

    usersService.createPasswordResetLink.mockRejectedValueOnce(new Error('failed'));
    await component.openResetQr(user);
    expect(component.resetErrorMessage).toBe('auth.errors.unknown');
    expect(component.isResetBusy).toBe(false);
  });

  it('toggles password form and helper actions', () => {
    component.togglePasswordForm();
    expect(component.showPasswordForm).toBe(true);

    component.generatePassword();
    const generated = component.form.get('password')?.value ?? '';
    expect(generated.length).toBe(12);

    component.togglePasswordVisibility();
    expect(component.showPasswordText).toBe(true);

    component.form.patchValue({ email: 'new.user@test.dev', first_name: 'New', last_name: 'User' });
    component.generateUsername();
    expect(component.form.get('username')?.value).toBe('new.user');
  });
});
