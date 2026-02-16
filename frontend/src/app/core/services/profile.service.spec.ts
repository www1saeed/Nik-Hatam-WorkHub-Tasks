import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api.config';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ProfileService]
    });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches current profile with locale query', async () => {
    const promise = service.fetchProfile('fa');
    const req = httpMock.expectOne(`${API_BASE_URL}/profile?locale=fa`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { first_name: 'Saeed', last_name: 'Hatami' } });
    const profile = await promise;
    expect(profile.first_name).toBe('Saeed');
  });

  it('fetches selected user profile', async () => {
    const promise = service.fetchUserProfile(10, 'en');
    const req = httpMock.expectOne(`${API_BASE_URL}/users/10/profile?locale=en`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { first_name: 'Admin', last_name: 'User' } });
    const profile = await promise;
    expect(profile.last_name).toBe('User');
  });

  it('updates profile with multipart payload', async () => {
    const promise = service.updateProfile(
      { first_name: 'S', last_name: 'H', phone_numbers: [{ number: '0912' }] },
      null,
      { current_password: 'old', new_password: 'Secret123', new_password_confirmation: 'Secret123' },
      true
    );
    const req = httpMock.expectOne(`${API_BASE_URL}/profile`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    const form = req.request.body as FormData;
    expect(form.get('first_name')).toBe('S');
    expect(form.get('remove_avatar')).toBe('1');
    expect(form.get('new_password')).toBe('Secret123');
    req.flush({ data: { first_name: 'S', last_name: 'H' } });
    const profile = await promise;
    expect(profile.first_name).toBe('S');
  });

  it('checks current-user availability', async () => {
    const promise = service.checkAvailability('saeed', 's@example.test');
    const req = httpMock.expectOne(`${API_BASE_URL}/profile/availability?username=saeed&email=s%40example.test`);
    expect(req.request.method).toBe('GET');
    req.flush({ username_available: true, email_available: false });
    const result = await promise;
    expect(result.email_available).toBe(false);
  });

  it('checks admin-managed user availability', async () => {
    const promise = service.checkUserAvailability(8, 'saeed2', 's2@example.test');
    const req = httpMock.expectOne(`${API_BASE_URL}/users/8/profile/availability?username=saeed2&email=s2%40example.test`);
    expect(req.request.method).toBe('GET');
    req.flush({ username_available: false, email_available: true });
    const result = await promise;
    expect(result.username_available).toBe(false);
  });
});
