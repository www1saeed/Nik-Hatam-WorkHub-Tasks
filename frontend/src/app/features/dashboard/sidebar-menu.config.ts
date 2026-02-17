export interface SidebarItem {
  labelKey: string;
  route: string;
  icon: string;
  permission?: string;
  permissionsAny?: string[];
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
    key: 'workdesk',
    labelKey: 'admin.sidebar.groups.workdesk',
    items: [
      { labelKey: 'admin.sidebar.tasks', route: '/dashboard/tasks/new', icon: 'pi pi-check-square', permissionsAny: ['manage_tasks', 'manage_staffs'] }
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
  },
  {
    key: 'configuration',
    labelKey: 'admin.sidebar.groups.configuration',
    items: [
      { labelKey: 'admin.sidebar.task_templates', route: '/dashboard/configuration/task-templates', icon: 'pi pi-file-edit', permission: 'manage_system_configurations' },
      { labelKey: 'admin.sidebar.task_album', route: '/dashboard/configuration/task-album', icon: 'pi pi-images', permission: 'manage_system_configurations' }
    ]
  }
];
