import { Body, Delete, Get, Param, Patch, Post, Query, Type, ValidationPipe } from '@nestjs/common';
import { Role } from './constants';
import { Roles, TenantId } from './decorators';
import { ListQueryDto } from './list-query.dto';
import { TenantCrudService } from './tenant-crud.service';

const pipe = (expectedType: Type) =>
  new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });

/**
 * Builds a list/get/create/update/delete controller base for a tenant-scoped resource.
 * Subclasses add @Controller, @RequireFeature and any extra endpoints.
 */
export function CrudController<T>(
  createDto: Type,
  updateDto: Type,
  deleteRoles: Role[] = [Role.OWNER, Role.MANAGER],
) {
  abstract class Base {
    abstract readonly service: TenantCrudService<T>;

    @Get()
    list(@TenantId() tenantId: string, @Query() q: ListQueryDto) {
      return this.service.list(tenantId, q);
    }

    @Get(':id')
    get(@TenantId() tenantId: string, @Param('id') id: string) {
      return this.service.findOne(tenantId, id);
    }

    @Post()
    create(@TenantId() tenantId: string, @Body(pipe(createDto)) dto: Partial<T>) {
      return this.service.create(tenantId, dto);
    }

    @Patch(':id')
    update(@TenantId() tenantId: string, @Param('id') id: string, @Body(pipe(updateDto)) dto: Partial<T>) {
      return this.service.update(tenantId, id, dto);
    }

    @Roles(...deleteRoles)
    @Delete(':id')
    remove(@TenantId() tenantId: string, @Param('id') id: string) {
      return this.service.remove(tenantId, id);
    }
  }
  return Base;
}
