import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const tenantGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  if (auth.isSuperAdmin()) return router.parseUrl('/admin');
  if (auth.tenant()) return true;
  return auth.loadTenant().pipe(
    map(() => true),
    catchError(() => of(router.parseUrl('/login'))),
  );
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  return auth.isSuperAdmin() ? true : router.parseUrl('/app');
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

/**
 * Route data { feature: 'inventory' } hides modules outside the tenant's plan.
 * Optional data.fallback redirects there instead of the upgrade page.
 */
export const featureGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const feature = route.data['feature'] as string | undefined;
  if (!feature || auth.has(feature)) return true;
  return inject(Router).parseUrl((route.data['fallback'] as string) ?? '/app/upgrade');
};
