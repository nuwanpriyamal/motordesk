import { Controller, Get, MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Observable, interval, map, merge } from 'rxjs';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Firebase settings and a custom token for the signed-in tenant user. */
  @Get('config')
  async firebaseConfig(@CurrentUser() user: AuthUser) {
    const token = user.tenantId ? await this.realtime.createToken(user.sub, user.tenantId) : null;
    return {
      enabled: this.realtime.firebaseEnabled && !!token,
      token,
      tenantId: user.tenantId,
      // SSE needs a long-lived process; serverless hosts rely on Firebase only.
      sse: !process.env.VERCEL,
      web: this.realtime.webConfig,
    };
  }

  /**
   * Server-sent events fallback. EventSource cannot send headers,
   * so the JWT is passed as ?token=.
   */
  @Public()
  @Sse('stream')
  stream(@Query('token') token: string): Observable<MessageEvent> {
    let user: AuthUser;
    try {
      user = this.jwt.verify<AuthUser>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (!user.tenantId) throw new UnauthorizedException();
    const keepAlive = interval(25000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    return merge(this.realtime.stream(user.tenantId), keepAlive);
  }
}
