import { Controller, ForbiddenException, Get, Injectable, Module, Param } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { RequireFeature, TenantId } from '../common/decorators';
import { ListQueryDto } from '../common/list-query.dto';
import { TenantCrudService } from '../common/tenant-crud.service';
import { TenantsService } from '../tenants/tenants.service';

export const VEHICLE_TYPES = ['car', 'van', 'suv', 'jeep', 'motorcycle', 'three_wheeler', 'lorry', 'bus', 'other'];

@Schema({ timestamps: true })
export class Vehicle {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true, index: true }) customer!: Types.ObjectId;
  @Prop({ required: true, uppercase: true, trim: true }) registrationNo!: string;
  @Prop({ enum: VEHICLE_TYPES, default: 'car' }) type!: string;
  @Prop() make?: string;
  @Prop() model?: string;
  @Prop() year?: number;
  @Prop() color?: string;
  @Prop({ uppercase: true }) vin?: string;
  @Prop() engineNo?: string;
  @Prop({ enum: ['petrol', 'diesel', 'hybrid', 'electric', 'other'] }) fuelType?: string;
  @Prop({ default: 0 }) mileage!: number;
  @Prop() lastServiceAt?: Date;
  @Prop() lastServiceMileage?: number;
  @Prop() nextServiceDue?: Date;
  @Prop() nextServiceMileage?: number;
  @Prop() insuranceExpiry?: Date;
  @Prop() licenseExpiry?: Date;
  @Prop({ type: [String], default: [] }) photos!: string[];
  @Prop() notes?: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ tenantId: 1, registrationNo: 1 }, { unique: true });

export class CreateVehicleDto {
  @IsMongoId() customer!: string;
  @IsString() registrationNo!: string;
  @IsOptional() @IsIn(VEHICLE_TYPES) type?: string;
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsString() engineNo?: string;
  @IsOptional() @IsIn(['petrol', 'diesel', 'hybrid', 'electric', 'other']) fuelType?: string;
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsDateString() nextServiceDue?: string;
  @IsOptional() @IsInt() nextServiceMileage?: number;
  @IsOptional() @IsDateString() insuranceExpiry?: string;
  @IsOptional() @IsDateString() licenseExpiry?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

@Injectable()
export class VehiclesService extends TenantCrudService<Vehicle> {
  protected searchFields = ['registrationNo', 'make', 'model', 'vin'];
  protected populate = ['customer'];

  constructor(
    @InjectModel(Vehicle.name) model: Model<Vehicle>,
    private readonly tenants: TenantsService,
  ) {
    super(model);
  }

  protected buildFilter(tenantId: string, q: ListQueryDto) {
    const filter = super.buildFilter(tenantId, q) as Record<string, unknown>;
    if (q.dueWithinDays !== undefined) {
      filter.nextServiceDue = { $lte: new Date(Date.now() + q.dueWithinDays * 86400000) };
    }
    return filter;
  }

  async create(tenantId: string, dto: Partial<Vehicle>) {
    const ent = await this.tenants.getEntitlements(tenantId);
    if ((await this.count(tenantId)) >= ent.limits.maxVehicles) {
      throw new ForbiddenException(
        `Your ${ent.planName} plan allows ${ent.limits.maxVehicles} vehicles. Upgrade to add more.`,
      );
    }
    return super.create(tenantId, dto);
  }

  /** Called when a job is completed: updates mileage and schedules the next service. */
  async recordService(tenantId: string, id: string, mileage: number | undefined) {
    const tenant = await this.tenants.findById(tenantId);
    const now = new Date();
    const set: Record<string, unknown> = {
      lastServiceAt: now,
      nextServiceDue: new Date(now.getTime() + tenant.settings.serviceIntervalDays * 86400000),
    };
    if (mileage) {
      set.mileage = mileage;
      set.lastServiceMileage = mileage;
      set.nextServiceMileage = mileage + tenant.settings.serviceIntervalKm;
    }
    await this.model.updateOne({ _id: id, tenantId }, { $set: set }).exec();
  }
}

@ApiTags('vehicles')
@RequireFeature(Feature.VEHICLES)
@Controller('vehicles')
export class VehiclesController extends CrudController<Vehicle>(CreateVehicleDto, UpdateVehicleDto) {
  constructor(readonly service: VehiclesService) {
    super();
  }

  @Get('lookup/:registrationNo')
  lookup(@TenantId() tenantId: string, @Param('registrationNo') reg: string) {
    return this.service.list(tenantId, { search: reg, page: 1, limit: 5 });
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Vehicle.name, schema: VehicleSchema }])],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService, MongooseModule],
})
export class VehiclesModule {}
