import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../common/constants';
import { Roles, TenantId } from '../common/decorators';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.users.list(tenantId);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tenantId, id, dto);
  }
}
