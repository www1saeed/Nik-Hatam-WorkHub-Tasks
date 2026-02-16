import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api.config';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdminUsersService]
    });
    service = TestBed.inject(AdminUsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists users', async () => {
    const promise = service.list();
    const req = httpMock.expectOne(`${API_BASE_URL}/users`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ id: 1, username: 'u1', first_name: 'A', last_name: 'B', roles: [] }] });
    const users = await promise;
    expect(users.length).toBe(1);
    expect(users[0].username).toBe('u1');
  });

  it('creates users', async () => {
    const promise = service.create({
      username: 'user1',
      first_name: 'Saeed',
      last_name: 'Hatami',
      password: 'Secret123',
      locale: 'en'
    });
    const req = httpMock.expectOne(`${API_BASE_URL}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.username).toBe('user1');
    req.flush({ data: { id: 3, username: 'user1', first_name: 'Saeed', last_name: 'Hatami', roles: [] } });
    const created = await promise;
    expect(created.id).toBe(3);
  });

  it('updates users', async () => {
    const promise = service.update(7, {
      username: 'updated',
      first_name: 'U',
      last_name: 'S',
      role_ids: [1]
    });
    const req = httpMock.expectOne(`${API_BASE_URL}/users/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.role_ids).toEqual([1]);
    req.flush({ data: { id: 7, username: 'updated', first_name: 'U', last_name: 'S', roles: [] } });
    const updated = await promise;
    expect(updated.username).toBe('updated');
  });

  it('removes users', async () => {
    const promise = service.remove(11);
    const req = httpMock.expectOne(`${API_BASE_URL}/users/11`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    await promise;
  });

  it('sends reset emails', async () => {
    const promise = service.sendPasswordReset(5, 'fa');
    const req = httpMock.expectOne(`${API_BASE_URL}/users/5/password/reset`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.locale).toBe('fa');
    req.flush({});
    await promise;
  });

  it('creates reset links', async () => {
    const promise = service.createPasswordResetLink(8);
    const req = httpMock.expectOne(`${API_BASE_URL}/users/8/password/reset-link`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { url: 'https://example.test/reset', token: 't1' } });
    const data = await promise;
    expect(data.token).toBe('t1');
  });
});
