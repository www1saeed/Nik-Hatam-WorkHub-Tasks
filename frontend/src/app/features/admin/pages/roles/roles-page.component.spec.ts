import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { vi } from 'vitest';
import { AdminRolesService } from '../../../../core/services/admin-roles.service';
import { AdminPermissionsService } from '../../../../core/services/admin-permissions.service';
import { RolesPageComponent } from './roles-page.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Pipe({ name: 'transloco', standalone: true })
class MockTranslocoPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('RolesPageComponent', () => {
  let fixture: ComponentFixture<RolesPageComponent>;
  let component: RolesPageComponent;
  const rolesService = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const permissionsService = {
    list: vi.fn(),
  };
  const transloco = {
    langChanges$: of('en'),
    getActiveLang: vi.fn(() => 'en'),
    translate: vi.fn((key: string) => key),
    selectTranslation: vi.fn(() => of({ admin: { roles: { labels: { guest: 'Guest' } } } })),
  };

  beforeEach(async () => {
    rolesService.list.mockResolvedValue([
      {
        id: 1,
        name: 'Guest',
        slug: 'guest',
        permissions: [{ id: 2, name: 'Manage Users', slug: 'manage_users' }],
      },
    ]);
    rolesService.create.mockResolvedValue({ id: 2, name: 'Manager', slug: 'manager', permissions: [] });
    rolesService.update.mockResolvedValue({ id: 1, name: 'Guest', slug: 'guest', permissions: [] });
    rolesService.remove.mockResolvedValue(undefined);
    permissionsService.list.mockResolvedValue([
      { id: 2, name: 'Manage Users', slug: 'manage_users' },
      { id: 3, name: 'Manage Roles', slug: 'manage_roles' },
    ]);

    await TestBed.configureTestingModule({
      imports: [RolesPageComponent],
      providers: [
        { provide: AdminRolesService, useValue: rolesService },
        { provide: AdminPermissionsService, useValue: permissionsService },
        { provide: TranslocoService, useValue: transloco },
      ],
    })
      .overrideComponent(RolesPageComponent, {
        remove: { imports: [TranslocoPipe] },
        add: { imports: [MockTranslocoPipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RolesPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(false);
    await fixture.whenStable();
    fixture.detectChanges(false);
  });

  it('renders roles table rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('.admin-table__row');
    expect(rows.length).toBe(1);
  });

  it('filters available permissions by query', () => {
    component.permissionSearch = 'roles';
    fixture.detectChanges(false);
    expect(component.filteredPermissions.length).toBe(1);
    expect(component.filteredPermissions[0].slug).toBe('manage_roles');
  });

  it('toggles permission ids in form', () => {
    component.startCreate();
    component.togglePermission(2);
    expect(component.form.controls.permission_ids.value).toContain(2);
    component.togglePermission(2);
    expect(component.form.controls.permission_ids.value).not.toContain(2);
  });

  it('renders permissions pills in table rows', () => {
    const pills = fixture.nativeElement.querySelectorAll('.admin-table__pill');
    expect(pills.length).toBeGreaterThan(0);
  });

  it('toggles sorting and resets page on page-size change', () => {
    component.setSort('name');
    expect(component.sortDir).toBe('desc');
    component.setSort('slug');
    expect(component.sortKey).toBe('slug');
    expect(component.sortDir).toBe('asc');

    component.page = 3;
    component.updatePageSize('5');
    expect(component.page).toBe(1);
    expect(component.pageSize).toBe(5);
  });

  it('saves role in create and edit mode', async () => {
    component.startCreate();
    component.form.patchValue({ name: 'Manager', slug: 'manager', permission_ids: [2] });
    await component.save();
    expect(rolesService.create).toHaveBeenCalledWith({ name: 'Manager', slug: 'manager', permission_ids: [2] });

    const role = component.roles[0];
    component.startEdit(role);
    component.form.patchValue({ name: 'Guest', slug: 'guest', permission_ids: [] });
    await component.save();
    expect(rolesService.update).toHaveBeenCalledWith(role.id, { name: 'Guest', slug: 'guest', permission_ids: [] });
  });

  it('removes confirmed role', async () => {
    component.confirmDelete(component.roles[0]);
    await component.removeConfirmed();
    expect(rolesService.remove).toHaveBeenCalledWith(1);
  });

  it('maps load failure to page-level error', async () => {
    rolesService.list.mockRejectedValueOnce(new Error('boom'));

    await component.load();
    expect(component.errorMessage).toBe('auth.errors.unknown');
    expect(component.isLoading).toBe(false);
  });

  it('keeps role name when label translation is missing', () => {
    const role = { name: 'Custom', slug: 'custom' };
    expect(component.roleLabel(role)).toBe('Custom');
  });

  it('returns early on invalid save', async () => {
    const callsBefore = rolesService.create.mock.calls.length;
    component.startCreate();
    component.form.patchValue({ name: '', slug: '', permission_ids: [] });

    await component.save();
    expect(rolesService.create.mock.calls.length).toBe(callsBefore);
  });

  it('maps slug/name duplicate errors into modal field errors', async () => {
    component.startCreate();
    component.form.patchValue({ name: 'Guest', slug: 'guest', permission_ids: [] });
    rolesService.create.mockRejectedValueOnce(new Error('save failed'));

    await component.save();
    expect(component.formErrorMessage).toBe('auth.errors.unknown');

    rolesService.create.mockRejectedValueOnce(new Error('save failed 2'));
    await component.save();
    expect(component.formErrorMessage).toBe('auth.errors.unknown');
  });

  it('handles delete branch without target and delete errors', async () => {
    const callsBefore = rolesService.remove.mock.calls.length;
    await component.removeConfirmed();
    expect(rolesService.remove.mock.calls.length).toBe(callsBefore);

    component.confirmDelete(component.roles[0]);
    rolesService.remove.mockRejectedValueOnce(new Error('delete failed'));
    await component.removeConfirmed();
    expect(component.deleteErrorMessage).toBe('auth.errors.unknown');
  });
});
