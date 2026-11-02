import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../common/constants';
import { Roles, TenantId } from '../common/decorators';
import { ListQueryDto } from '../common/list-query.dto';
import { Plan } from '../plans/plan.schema';
import { AdminUpdateTenantDto, RecordSubscriptionPaymentDto, UpdateMyTenantDto } from './tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenant')
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async mine(@TenantId() tenantId: string) {
    const [tenant, entitlements] = await Promise.all([
      this.tenants.findById(tenantId),
      this.tenants.getEntitlements(tenantId),
    ]);
    const { payments, ...rest } = tenant;
    return {
      ...rest,
      effectivePrice: this.tenants.effectivePrice(tenant, tenant.plan as unknown as Plan),
      lastPayment: payments?.[payments.length - 1],
      entitlements,
    };
  }

  @Roles(Role.OWNER)
  @Patch()
  update(@TenantId() tenantId: string, @Body() dto: UpdateMyTenantDto) {
    return this.tenants.updateMine(tenantId, dto);
  }
}

@ApiTags('admin')
@Roles(Role.SUPER_ADMIN)
@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('stats')
  stats() {
    return this.tenants.platformStats();
  }

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.tenants.adminList(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.adminGet(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateTenantDto) {
    return this.tenants.adminUpdate(id, dto);
  }

  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordSubscriptionPaymentDto) {
    return this.tenants.recordPayment(id, dto);
  }
}
