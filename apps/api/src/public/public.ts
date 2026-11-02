import { Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsDateString, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Model } from 'mongoose';
import { Feature } from '../common/constants';
import { Public } from '../common/decorators';
import { AppointmentsModule, AppointmentsService } from '../appointments/appointments';
import { Customer, CustomersModule } from '../customers/customers';
import { JobCard, JobCardsModule } from '../job-cards/job-cards';
import { TenantsService } from '../tenants/tenants.service';

export class PublicBookingDto {
  @IsString() @MaxLength(80) name!: string;
  @Matches(/^[+\d][\d\s-]{6,16}$/, { message: 'Enter a valid phone number' }) phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MaxLength(20) vehicleNo!: string;
  @IsDateString() start!: string;
  @IsOptional() @IsString() @MaxLength(60) serviceType?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

const digits = (s: string) => s.replace(/\D/g, '').slice(-9);

@ApiTags('public')
@Public()
@Controller('public/centers')
export class PublicController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly appointments: AppointmentsService,
    @InjectModel(JobCard.name) private readonly jobs: Model<JobCard>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
  ) {}

  private async bookable(slug: string) {
    const tenant = await this.tenants.findBySlug(slug);
    const ent = await this.tenants.getEntitlements(String(tenant._id));
    if (!ent.active || !ent.features.includes(Feature.ONLINE_BOOKING)) {
      throw new ForbiddenException('Online booking is not available for this service center');
    }
    return tenant;
  }

  @Get(':slug')
  async profile(@Param('slug') slug: string) {
    const t = await this.tenants.findBySlug(slug);
    const ent = await this.tenants.getEntitlements(String(t._id));
    return {
      name: t.name,
      slug: t.slug,
      phone: t.phone,
      email: t.email,
      address: t.address,
      city: t.city,
      logoUrl: t.logoUrl,
      openTime: t.settings.openTime,
      closeTime: t.settings.closeTime,
      timezone: t.settings.timezone,
      onlineBooking: ent.active && ent.features.includes(Feature.ONLINE_BOOKING),
    };
  }

  @Get(':slug/availability')
  async availability(@Param('slug') slug: string, @Query('date') date: string) {
    const t = await this.bookable(slug);
    return this.appointments.availability(String(t._id), date);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':slug/bookings')
  async book(@Param('slug') slug: string, @Body() dto: PublicBookingDto) {
    const t = await this.bookable(slug);
    const tenantId = String(t._id);
    // Link to an existing customer when the phone number matches.
    const customer = await this.customers
      .findOne({ tenantId, phone: new RegExp(`${digits(dto.phone)}$`) })
      .select('_id')
      .lean()
      .exec();
    const appt = await this.appointments.create(tenantId, {
      customer: customer?._id,
      guestName: dto.name,
      guestPhone: dto.phone,
      guestEmail: dto.email,
      guestVehicleNo: dto.vehicleNo.toUpperCase(),
      start: new Date(dto.start),
      serviceType: dto.serviceType,
      notes: dto.notes,
      source: 'online',
    });
    return { id: appt._id, start: appt.start, end: appt.end, status: appt.status };
  }

  /** Customer self-service: track a job with its number and the phone on file. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get(':slug/track/:number')
  async track(@Param('slug') slug: string, @Param('number') number: string, @Query('phone') phone: string) {
    const t = await this.tenants.findBySlug(slug);
    const job = await this.jobs
      .findOne({ tenantId: t._id, number: number.toUpperCase() })
      .populate<{ customer: Customer }>('customer', 'name phone')
      .populate('vehicle', 'registrationNo make model')
      .lean()
      .exec();
    if (!job || !phone || !job.customer?.phone || digits(job.customer.phone) !== digits(phone)) {
      throw new NotFoundException('No job found for that number and phone');
    }
    return {
      number: job.number,
      status: job.status,
      vehicle: job.vehicle,
      serviceType: job.serviceType,
      estimatedCompletion: job.estimatedCompletion,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      deliveredAt: job.deliveredAt,
      total: job.total,
      checklist: job.checklist,
    };
  }
}

@Module({
  imports: [AppointmentsModule, CustomersModule, JobCardsModule],
  controllers: [PublicController],
})
export class PublicModule {}
