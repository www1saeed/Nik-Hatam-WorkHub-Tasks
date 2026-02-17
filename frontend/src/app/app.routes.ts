import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { DashboardShellComponent } from './features/dashboard/dashboard-shell.component';
import { UsersPageComponent } from './features/admin/pages/users/users-page.component';
import { RolesPageComponent } from './features/admin/pages/roles/roles-page.component';
import { PermissionsPageComponent } from './features/admin/pages/permissions/permissions-page.component';
import { TaskTemplatesPageComponent } from './features/admin/pages/task-templates/task-templates-page.component';
import { PhotoAlbumPageComponent } from './features/admin/pages/photo-album/photo-album-page.component';
import { UnauthorizedComponent } from './features/admin/pages/unauthorized/unauthorized.component';
import { TaskCapturePageComponent } from './features/tasks/task-capture-page.component';
import { TaskSchedulerPageComponent } from './features/tasks/task-scheduler-page.component';
import { NotificationsPageComponent } from './features/notifications/notifications-page.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { VerifyEmailComponent } from './features/auth/verify-email.component';
import { RequestPasswordComponent } from './features/auth/request-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password.component';
import { CompleteSocialComponent } from './features/auth/complete-social.component';
import { ProfileComponent } from './features/profile/profile.component';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'dashboard',
    component: DashboardShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardComponent },
      { path: 'users', component: UsersPageComponent, canActivate: [permissionGuard('manage_users')] },
      { path: 'users/:id/profile', component: ProfileComponent, canActivate: [permissionGuard('manage_users')] },
      { path: 'roles', component: RolesPageComponent, canActivate: [permissionGuard('manage_roles')] },
      { path: 'permissions', component: PermissionsPageComponent, canActivate: [permissionGuard('manage_permissions')] },
      { path: 'configuration/task-templates', component: TaskTemplatesPageComponent, canActivate: [permissionGuard('manage_system_configurations')] },
      { path: 'configuration/task-album', component: PhotoAlbumPageComponent, canActivate: [permissionGuard('manage_system_configurations')] },
      { path: 'tasks/new', component: TaskCapturePageComponent, canActivate: [permissionGuard(['manage_tasks', 'manage_staffs'])] },
      { path: 'tasks/scheduler', component: TaskSchedulerPageComponent, canActivate: [permissionGuard(['manage_tasks', 'manage_staffs'])] },
      { path: 'notifications', component: NotificationsPageComponent },
      { path: 'unauthorized', component: UnauthorizedComponent },
    ],
  },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'password/request', component: RequestPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'complete-profile', component: CompleteSocialComponent },
  { path: '**', redirectTo: '' }
];
