import { createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Feature, Role } from './constants';

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
}

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const FEATURE = 'feature';

/** Skip JWT authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a route to the given roles. Super admins always pass. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Require the tenant's plan to include this feature. */
export const RequireFeature = (feature: Feature) => SetMetadata(FEATURE, feature);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** The tenant id of the current user. Platform admins have none and are refused. */
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const tenantId = ctx.switchToHttp().getRequest().user?.tenantId;
  if (!tenantId) throw new ForbiddenException('This endpoint requires a service center account');
  return tenantId;
});
