import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlansModule } from '../plans/plans.module';
import { AdminTenantsController, TenantController } from './tenants.controller';
import { Tenant, TenantSchema } from './tenant.schema';
import { TenantsService } from './tenants.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }]), PlansModule],
  controllers: [TenantController, AdminTenantsController],
  providers: [TenantsService],
  exports: [TenantsService, MongooseModule],
})
export class TenantsModule {}
