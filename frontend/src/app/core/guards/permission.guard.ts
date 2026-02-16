import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const permissionGuard = (permission: string): CanActivateFn => async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.currentUserValue()) {
    await authService.refreshUser();
  }

  if (authService.hasPermission(permission)) {
    return true;
  }

  return router.createUrlTree(['/dashboard/unauthorized']);
};
