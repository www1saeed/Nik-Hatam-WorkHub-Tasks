import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

class AuthServiceStub {
  token: string | null = null;
  refreshUser = vi.fn().mockResolvedValue(null);
  getToken(): string | null {
    return this.token;
  }
}

describe('authGuard', () => {
  let auth: AuthServiceStub;
  let router: Pick<Router, 'parseUrl'> & { parseUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = {
      parseUrl: vi.fn((url: string) => ({ toString: () => url } as unknown as UrlTree)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useValue: router },
      ]
    });
    auth = TestBed.inject(AuthService) as unknown as AuthServiceStub;
  });

  it('allows navigation when token exists', async () => {
    auth.token = 'token';
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it('redirects to /login without token', async () => {
    auth.token = null;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(router.parseUrl).toHaveBeenCalledWith('/login');
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
