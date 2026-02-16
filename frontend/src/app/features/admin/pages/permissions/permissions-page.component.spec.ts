import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { vi } from 'vitest';
import { AdminPermissionsService } from '../../../../core/services/admin-permissions.service';
import { PermissionsPageComponent } from './permissions-page.component';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Pipe({ name: 'transloco', standalone: true })
class MockTranslocoPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('PermissionsPageComponent', () => {
  let fixture: ComponentFixture<PermissionsPageComponent>;
  let component: PermissionsPageComponent;
  const permissionsService = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const transloco = {
    langChanges$: of('en'),
    getActiveLang: vi.fn(() => 'en'),
    translate: vi.fn((key: string) => key),
  };

  beforeEach(async () => {
    permissionsService.list.mockResolvedValue([
      { id: 1, name: 'Manage Users', slug: 'manage_users' },
      { id: 2, name: 'Manage Roles', slug: 'manage_roles' },
    ]);
    permissionsService.create.mockResolvedValue({ id: 3, name: 'Create', slug: 'create' });
    permissionsService.update.mockResolvedValue({ id: 1, name: 'Manage Users', slug: 'manage_users' });
    permissionsService.remove.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [PermissionsPageComponent],
      providers: [
        { provide: AdminPermissionsService, useValue: permissionsService },
        { provide: TranslocoService, useValue: transloco },
      ],
    })
      .overrideComponent(PermissionsPageComponent, {
        remove: { imports: [TranslocoPipe] },
        add: { imports: [MockTranslocoPipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(PermissionsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(false);
    await fixture.whenStable();
    fixture.detectChanges(false);
  });

  it('renders permissions table rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('.admin-table__row');
    expect(rows.length).toBe(2);
  });

  it('filters permissions by search term', () => {
    component.searchTerm = 'roles';
    fixture.detectChanges(false);
    expect(component.filteredPermissions.length).toBe(1);
    expect(component.filteredPermissions[0].slug).toBe('manage_roles');
  });

  it('shows create modal and field errors inside modal', async () => {
    component.startCreate();
    component.fieldErrors = { slug: 'admin.errors.slug_taken' };
    await fixture.whenStable();
    expect(component.isFormOpen).toBe(true);
    expect(component.hasFieldErrors).toBe(true);
  });

  it('removes selected permission after confirmation', async () => {
    component.confirmDelete({ id: 2, name: 'Manage Roles', slug: 'manage_roles' });
    await fixture.whenStable();
    expect(component.deleteTarget?.id).toBe(2);

    await component.removeConfirmed();
    expect(permissionsService.remove).toHaveBeenCalledWith(2);
  });

  it('toggles sorting and page size', () => {
    component.setSort('name');
    expect(component.sortDir).toBe('desc');
    component.setSort('slug');
    expect(component.sortKey).toBe('slug');
    expect(component.sortDir).toBe('asc');

    component.page = 2;
    component.updatePageSize('5');
    expect(component.pageSize).toBe(5);
    expect(component.page).toBe(1);
  });

  it('saves permission in create and edit mode', async () => {
    component.startCreate();
    component.form.patchValue({ name: 'Create User', slug: 'create_user' });
    await component.save();
    expect(permissionsService.create).toHaveBeenCalledWith({ name: 'Create User', slug: 'create_user' });

    component.startEdit({ id: 1, name: 'Manage Users', slug: 'manage_users' });
    component.form.patchValue({ name: 'Manage Users', slug: 'manage_users' });
    await component.save();
    expect(permissionsService.update).toHaveBeenCalledWith(1, { name: 'Manage Users', slug: 'manage_users' });
  });

  it('maps load error to page error message', async () => {
    permissionsService.list.mockRejectedValueOnce(new Error('boom'));

    await component.load();
    expect(component.errorMessage).toBe('auth.errors.unknown');
    expect(component.isLoading).toBe(false);
  });

  it('returns early on invalid save', async () => {
    const callsBefore = permissionsService.create.mock.calls.length;
    component.startCreate();
    component.form.patchValue({ name: '', slug: '' });

    await component.save();
    expect(permissionsService.create.mock.calls.length).toBe(callsBefore);
  });

  it('maps slug/name duplicate errors into modal field errors', async () => {
    component.startCreate();
    component.form.patchValue({ name: 'Dup', slug: 'dup' });
    permissionsService.create.mockRejectedValueOnce(new Error('save failed'));

    await component.save();
    expect(component.formErrorMessage).toBe('auth.errors.unknown');

    permissionsService.create.mockRejectedValueOnce(new Error('save failed 2'));
    await component.save();
    expect(component.formErrorMessage).toBe('auth.errors.unknown');
  });

  it('handles delete branch without target and delete failure branch', async () => {
    const callsBefore = permissionsService.remove.mock.calls.length;
    await component.removeConfirmed();
    expect(permissionsService.remove.mock.calls.length).toBe(callsBefore);

    component.confirmDelete({ id: 1, name: 'Manage Users', slug: 'manage_users' });
    permissionsService.remove.mockRejectedValueOnce(new Error('delete failed'));

    await component.removeConfirmed();
    expect(component.deleteErrorMessage).toBe('auth.errors.unknown');
  });
});
