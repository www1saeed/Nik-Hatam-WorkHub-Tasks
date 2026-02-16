import { routes } from './app.routes';

describe('app routes', () => {
  it('contains dashboard shell route guarded by auth', () => {
    const dashboard = routes.find((route) => route.path === 'dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard?.canActivate?.length).toBeGreaterThan(0);
  });

  it('contains permission protected admin pages', () => {
    const dashboard = routes.find((route) => route.path === 'dashboard');
    const children = dashboard?.children ?? [];

    const users = children.find((route) => route.path === 'users');
    const roles = children.find((route) => route.path === 'roles');
    const permissions = children.find((route) => route.path === 'permissions');

    expect(users?.canActivate?.length).toBeGreaterThan(0);
    expect(roles?.canActivate?.length).toBeGreaterThan(0);
    expect(permissions?.canActivate?.length).toBeGreaterThan(0);
  });
});

