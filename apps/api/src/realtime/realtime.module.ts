import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RealtimeFlushInterceptor } from './realtime-flush.interceptor';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService, { provide: APP_INTERCEPTOR, useClass: RealtimeFlushInterceptor }],
  exports: [RealtimeService],
})
export class RealtimeModule {}
