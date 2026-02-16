import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config/api.config';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stores token and user on login', async () => {
    const loginPromise = service.login('admin', 'Secret123');

    const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({
      token: 'token-1',
      user: { id: 1, username: 'admin' }
    });

    await loginPromise;
    expect(service.getToken()).toBe('token-1');
    expect(service.currentUserValue()?.username).toBe('admin');
  });

  it('refreshes current user and persists it', async () => {
    const refreshPromise = service.refreshUser();
    const req = httpMock.expectOne(`${API_BASE_URL}/auth/me`);
    req.flush({ data: { id: 2, username: 'manager' } });

    const user = await refreshPromise;
    expect(user?.username).toBe('manager');
    expect(service.currentUserValue()?.username).toBe('manager');
  });

  it('returns null on refresh failure', async () => {
    const refreshPromise = service.refreshUser();
    const req = httpMock.expectOne(`${API_BASE_URL}/auth/me`);
    req.flush({ message: 'error' }, { status: 500, statusText: 'Server Error' });

    const user = await refreshPromise;
    expect(user).toBeNull();
  });

  it('checks permissions with admin bypass', () => {
    service.applyLoginResponse({
      token: 'x',
      user: {
        roles: [{ id: 1, name: 'Admin', slug: 'admin' }],
        permissions: []
      }
    });
    expect(service.hasPermission('manage_users')).toBe(true);
  });

  it('checks permissions by slug for non-admin users', () => {
    service.applyLoginResponse({
      token: 'x',
      user: {
        roles: [{ id: 2, name: 'Guest', slug: 'guest' }],
        permissions: [{ id: 7, name: 'Manage users', slug: 'manage_users' }]
      }
    });
    expect(service.hasPermission('manage_users')).toBe(true);
    expect(service.hasPermission('manage_roles')).toBe(false);
  });

  it('clears local session on logout even when API fails', async () => {
    localStorage.setItem('nh_admin_token', 't');
    localStorage.setItem('nh_admin_user', JSON.stringify({ username: 'admin' }));

    const promise = service.logout();
    const req = httpMock.expectOne(`${API_BASE_URL}/auth/logout`);
    req.flush({}, { status: 500, statusText: 'Server Error' });

    await promise;
    expect(localStorage.getItem('nh_admin_token')).toBeNull();
    expect(localStorage.getItem('nh_admin_user')).toBeNull();
  });
});

