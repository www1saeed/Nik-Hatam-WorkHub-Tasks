export interface SidebarItem {
  labelKey: string;
  route: string;
  icon: string;
  permission?: string;
}

export interface SidebarSection {
  key: string;
  labelKey?: string;
  items: SidebarItem[];
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: 'general',
    items: [
      { labelKey: 'admin.sidebar.overview', route: '/dashboard', icon: 'pi pi-home' }
    ]
  },
  {
    key: 'access',
    labelKey: 'admin.sidebar.groups.user_management',
    items: [
      { labelKey: 'admin.sidebar.users', route: '/dashboard/users', icon: 'pi pi-users', permission: 'manage_users' },
      { labelKey: 'admin.sidebar.roles', route: '/dashboard/roles', icon: 'pi pi-id-card', permission: 'manage_roles' },
      { labelKey: 'admin.sidebar.permissions', route: '/dashboard/permissions', icon: 'pi pi-lock', permission: 'manage_permissions' }
    ]
  }
];
