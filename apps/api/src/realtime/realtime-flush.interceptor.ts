import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { RealtimeService } from './realtime.service';

/** Holds each response until the events it published have reached Firebase. */
@Injectable()
export class RealtimeFlushInterceptor implements NestInterceptor {
  constructor(private readonly realtime: RealtimeService) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(mergeMap((value) => from(this.realtime.flush().then(() => value))));
  }
}
