import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api.config';
import { AdminRolesService } from './admin-roles.service';

describe('AdminRolesService', () => {
  let service: AdminRolesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdminRolesService]
    });
    service = TestBed.inject(AdminRolesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists roles', async () => {
    const promise = service.list();
    const req = httpMock.expectOne(`${API_BASE_URL}/roles`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ id: 1, name: 'Admin', slug: 'admin', permissions: [] }] });
    const roles = await promise;
    expect(roles[0].slug).toBe('admin');
  });

  it('creates roles', async () => {
    const promise = service.create({ name: 'Manager', slug: 'manager', permission_ids: [1, 2] });
    const req = httpMock.expectOne(`${API_BASE_URL}/roles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.permission_ids).toEqual([1, 2]);
    req.flush({ data: { id: 2, name: 'Manager', slug: 'manager', permissions: [] } });
    const role = await promise;
    expect(role.name).toBe('Manager');
  });

  it('updates roles', async () => {
    const promise = service.update(2, { name: 'Manager+', slug: 'manager_plus' });
    const req = httpMock.expectOne(`${API_BASE_URL}/roles/2`);
    expect(req.request.method).toBe('PUT');
    req.flush({ data: { id: 2, name: 'Manager+', slug: 'manager_plus', permissions: [] } });
    const role = await promise;
    expect(role.slug).toBe('manager_plus');
  });

  it('removes roles', async () => {
    const promise = service.remove(3);
    const req = httpMock.expectOne(`${API_BASE_URL}/roles/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    await promise;
  });
});
