import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Feature, Role } from '../common/constants';
import { AuthUser, FEATURE, IS_PUBLIC, ROLES } from '../common/decorators';
import { TenantsService } from '../tenants/tenants.service';

/** Verifies the bearer JWT on every route not marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      req.user = this.jwt.verify<AuthUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Session expired, please sign in again');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return false;
    if (user.role === Role.SUPER_ADMIN || roles.includes(user.role)) return true;
    throw new ForbiddenException('You do not have permission for this action');
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Paths a tenant can still write to when its subscription has lapsed. */
const ALWAYS_WRITABLE = [/^\/api\/auth\//, /^\/api\/tenant$/];

/**
 * Enforces the subscription: features must be in the tenant's plan,
 * and lapsed or suspended tenants are read-only.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user?.tenantId) return true;

    const feature = this.reflector.getAllAndOverride<Feature>(FEATURE, [ctx.getHandler(), ctx.getClass()]);
    const ent = await this.tenants.getEntitlements(user.tenantId);
    req.entitlements = ent;

    if (feature && !ent.features.includes(feature)) {
      throw new ForbiddenException(`"${feature}" is not included in your ${ent.planName} plan`);
    }
    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    if (!ent.active && WRITE_METHODS.has(req.method) && !ALWAYS_WRITABLE.some((rx) => rx.test(path))) {
      throw new ForbiddenException('Your subscription is inactive. Renew it to make changes.');
    }
    return true;
  }
}
