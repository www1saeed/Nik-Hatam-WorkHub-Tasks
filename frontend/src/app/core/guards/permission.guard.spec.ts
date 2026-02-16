import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { permissionGuard } from './permission.guard';

class AuthServiceStub {
  user: unknown = null;
  allowed = false;
  refreshUser = vi.fn().mockResolvedValue(null);
  currentUserValue(): unknown {
    return this.user;
  }
  hasPermission(permission: string): boolean {
    void permission;
    return this.allowed;
  }
}

describe('permissionGuard', () => {
  let auth: AuthServiceStub;
  let router: Pick<Router, 'createUrlTree'> & { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = {
      createUrlTree: vi.fn(() => ({ toString: () => '/dashboard/unauthorized' } as unknown as UrlTree)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useValue: router },
      ]
    });

    auth = TestBed.inject(AuthService) as unknown as AuthServiceStub;
  });

  it('allows when permission exists', async () => {
    auth.user = { id: 1 };
    auth.allowed = true;
    const guard = permissionGuard('manage_users');
    const result = await TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('refreshes user when missing and denies when permission missing', async () => {
    auth.user = null;
    auth.allowed = false;
    const guard = permissionGuard('manage_users');
    const result = await TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard/unauthorized']);
    expect((result as UrlTree).toString()).toBe('/dashboard/unauthorized');
  });
});
