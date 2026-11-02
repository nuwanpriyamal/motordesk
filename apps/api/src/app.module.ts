import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppointmentsModule } from './appointments/appointments';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard, SubscriptionGuard } from './auth/guards';
import { CacheModule } from './cache/cache.module';
import { Public } from './common/decorators';
import { CountersModule } from './counters/counters.module';
import { CustomersModule } from './customers/customers';
import { DashboardModule } from './dashboard/dashboard';
import { ExpensesModule } from './expenses/expenses';
import { InventoryModule } from './inventory/inventory';
import { InvoicesModule } from './invoices/invoices';
import { JobCardsModule } from './job-cards/job-cards';
import { PlansModule } from './plans/plans.module';
import { PublicModule } from './public/public';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', env: process.env.APP_ENV ?? 'development', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI') }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    ScheduleModule.forRoot(),
    CacheModule,
    RealtimeModule,
    CountersModule,
    PlansModule,
    TenantsModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    VehiclesModule,
    InventoryModule,
    InvoicesModule,
    JobCardsModule,
    AppointmentsModule,
    ExpensesModule,
    RemindersModule,
    DashboardModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
