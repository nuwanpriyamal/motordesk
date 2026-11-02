import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Query } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { AppointmentStatus, Feature } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { RequireFeature, TenantId } from '../common/decorators';
import { TenantCrudService } from '../common/tenant-crud.service';
import { zonedDate } from '../common/time';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantsService } from '../tenants/tenants.service';

const ACTIVE = [AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED, AppointmentStatus.ARRIVED];

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer' }) customer?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Vehicle' }) vehicle?: Types.ObjectId;
  /** Contact details for online bookings from people who are not customers yet. */
  @Prop() guestName?: string;
  @Prop() guestPhone?: string;
  @Prop() guestEmail?: string;
  @Prop() guestVehicleNo?: string;
  @Prop({ required: true, index: true }) start!: Date;
  @Prop({ required: true }) end!: Date;
  @Prop() serviceType?: string;
  @Prop({ enum: AppointmentStatus, default: AppointmentStatus.BOOKED }) status!: AppointmentStatus;
  @Prop({ enum: ['staff', 'online', 'phone'], default: 'staff' }) source!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) assignedTo?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobCard' }) jobCard?: Types.ObjectId;
  @Prop() notes?: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

export class CreateAppointmentDto {
  @IsOptional() @IsMongoId() customer?: string;
  @IsOptional() @IsMongoId() vehicle?: string;
  @IsOptional() @IsString() guestName?: string;
  @IsOptional() @IsString() guestPhone?: string;
  @IsOptional() @IsString() guestEmail?: string;
  @IsOptional() @IsString() guestVehicleNo?: string;
  @IsDateString() start!: string;
  @IsOptional() @IsDateString() end?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsIn(['staff', 'online', 'phone']) source?: string;
  @IsOptional() @IsMongoId() assignedTo?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsMongoId() jobCard?: string;
}

@Injectable()
export class AppointmentsService extends TenantCrudService<Appointment> {
  protected searchFields = ['guestName', 'guestPhone', 'guestVehicleNo', 'serviceType'];
  protected populate = ['customer', 'vehicle', 'assignedTo'];
  protected dateField = 'start';

  constructor(
    @InjectModel(Appointment.name) model: Model<Appointment>,
    private readonly tenants: TenantsService,
    private readonly realtime: RealtimeService,
  ) {
    super(model);
  }

  async create(tenantId: string, dto: Partial<Appointment>) {
    if (!dto.customer && !dto.guestName) throw new BadRequestException('Customer or guest name is required');
    const tenant = await this.tenants.findById(tenantId);
    const start = new Date(dto.start!);
    const end = dto.end ? new Date(dto.end) : new Date(start.getTime() + tenant.settings.slotMinutes * 60000);
    await this.assertCapacity(tenantId, start, end, tenant.settings.bays);
    const appt = await super.create(tenantId, { ...dto, start, end });
    this.realtime.publish(tenantId, 'appointment.created', {
      id: String(appt._id),
      start: start.toISOString(),
      source: dto.source ?? 'staff',
    });
    return appt;
  }

  async update(tenantId: string, id: string, dto: Partial<Appointment>) {
    const appt = await super.update(tenantId, id, dto);
    this.realtime.publish(tenantId, 'appointment.updated', { id, status: appt.status });
    return appt;
  }

  /** Capacity = number of service bays that can be busy at the same time. */
  private async assertCapacity(tenantId: string, start: Date, end: Date, bays: number) {
    const overlapping = await this.model
      .countDocuments({ tenantId, status: { $in: ACTIVE }, start: { $lt: end }, end: { $gt: start } })
      .exec();
    if (overlapping >= bays) throw new BadRequestException('No free bay at that time. Pick another slot.');
  }

  /** Free slots for a day, used by staff and by the public booking page. */
  async availability(tenantId: string, date: string) {
    const tenant = await this.tenants.findById(tenantId);
    const { openTime, closeTime, slotMinutes, bays, timezone } = tenant.settings;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new BadRequestException('Use date=YYYY-MM-DD');
    const open = zonedDate(date, openTime, timezone);
    const close = zonedDate(date, closeTime, timezone);
    const booked = await this.model
      .find({ tenantId, status: { $in: ACTIVE }, start: { $lt: close }, end: { $gt: open } })
      .select('start end')
      .lean()
      .exec();
    const slots: { start: string; available: number }[] = [];
    for (let t = open.getTime(); t + slotMinutes * 60000 <= close.getTime(); t += slotMinutes * 60000) {
      const s = new Date(t);
      const e = new Date(t + slotMinutes * 60000);
      const used = booked.filter((b) => b.start < e && b.end > s).length;
      if (s > new Date()) slots.push({ start: s.toISOString(), available: Math.max(bays - used, 0) });
    }
    return slots;
  }
}

@ApiTags('appointments')
@RequireFeature(Feature.SCHEDULING)
@Controller('appointments')
export class AppointmentsController extends CrudController<Appointment>(CreateAppointmentDto, UpdateAppointmentDto) {
  constructor(readonly service: AppointmentsService) {
    super();
  }

  @Get('views/availability')
  availability(@TenantId() tenantId: string, @Query('date') date: string) {
    return this.service.availability(tenantId, date);
  }

  @Patch(':id/status/:status')
  setStatus(@TenantId() tenantId: string, @Param('id') id: string, @Param('status') status: AppointmentStatus) {
    if (!Object.values(AppointmentStatus).includes(status)) throw new BadRequestException('Invalid status');
    return this.service.update(tenantId, id, { status });
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Appointment.name, schema: AppointmentSchema }])],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
