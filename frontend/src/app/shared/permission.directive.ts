/**
 * PermissionDirective would conditionally render elements based on RBAC.
 */
export class PermissionDirective {
  /**
   * Determine if user has permission.
   */
  hasPermission(permission: string): boolean {
    void permission;
    return false;
  }
}
