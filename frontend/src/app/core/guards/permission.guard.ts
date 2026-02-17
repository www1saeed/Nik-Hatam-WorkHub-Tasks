import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const permissionGuard = (permission: string | string[]): CanActivateFn => async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.currentUserValue()) {
    await authService.refreshUser();
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (permissions.some((candidate) => authService.hasPermission(candidate))) {
    return true;
  }

  return router.createUrlTree(['/dashboard/unauthorized']);
};
