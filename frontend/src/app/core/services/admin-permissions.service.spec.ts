import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api.config';
import { AdminPermissionsService } from './admin-permissions.service';

describe('AdminPermissionsService', () => {
  let service: AdminPermissionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdminPermissionsService]
    });
    service = TestBed.inject(AdminPermissionsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists permissions', async () => {
    const promise = service.list();
    const req = httpMock.expectOne(`${API_BASE_URL}/permissions`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ id: 1, name: 'Manage users', slug: 'manage_users' }] });
    const items = await promise;
    expect(items[0].slug).toBe('manage_users');
  });

  it('creates permissions', async () => {
    const promise = service.create({ name: 'Manage Roles', slug: 'manage_roles' });
    const req = httpMock.expectOne(`${API_BASE_URL}/permissions`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 2, name: 'Manage Roles', slug: 'manage_roles' } });
    const item = await promise;
    expect(item.id).toBe(2);
  });

  it('updates permissions', async () => {
    const promise = service.update(2, { name: 'Manage Roles+', slug: 'manage_roles_plus' });
    const req = httpMock.expectOne(`${API_BASE_URL}/permissions/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({ data: { id: 2, name: 'Manage Roles+', slug: 'manage_roles_plus' } });
    const item = await promise;
    expect(item.slug).toBe('manage_roles_plus');
  });

  it('removes permissions', async () => {
    const promise = service.remove(4);
    const req = httpMock.expectOne(`${API_BASE_URL}/permissions/4`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    await promise;
  });
});
