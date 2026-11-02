import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '../common/constants';
import { Public, Roles } from '../common/decorators';
import { CreatePlanDto, UpdatePlanDto } from './plan.dto';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Pricing page: public plans only. */
  @Public()
  @Get()
  listPublic() {
    return this.plans.listPublic();
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('all')
  listAll() {
    return this.plans.listAll();
  }

  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
