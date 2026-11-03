import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature, InvoiceStatus, InvoiceType } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { Public, RequireFeature, TenantId } from '../common/decorators';
import { TenantCrudService } from '../common/tenant-crud.service';
import { Customer, CustomersModule } from '../customers/customers';
import { Invoice, InvoicesModule } from '../invoices/invoices';
import { Tenant } from '../tenants/tenant.schema';
import { TenantsService } from '../tenants/tenants.service';
import { Vehicle, VehiclesModule } from '../vehicles/vehicles';
import { NotifierService } from './notifier.service';

export const REMINDER_TYPES = ['service_due', 'insurance', 'license', 'payment', 'birthday', 'follow_up', 'custom'];

@Schema({ timestamps: true })
export class Reminder {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ enum: REMINDER_TYPES, default: 'custom' }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop() message?: string;
  @Prop({ required: true, index: true }) dueDate!: Date;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer' }) customer?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Vehicle' }) vehicle?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice' }) invoice?: Types.ObjectId;
  @Prop({ enum: ['sms', 'email', 'none'], default: 'sms' }) channel!: string;
  @Prop({ enum: ['pending', 'sent', 'failed', 'dismissed'], default: 'pending' }) status!: string;
  @Prop() sentAt?: Date;
  @Prop() error?: string;
  /** Prevents the generator from creating the same reminder twice. */
  @Prop() dedupeKey?: string;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);
ReminderSchema.index({ tenantId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export class CreateReminderDto {
  @IsIn(REMINDER_TYPES) type!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() message?: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsMongoId() customer?: string;
  @IsOptional() @IsMongoId() vehicle?: string;
  @IsOptional() @IsIn(['sms', 'email', 'none']) channel?: string;
}

export class UpdateReminderDto extends PartialType(CreateReminderDto) {
  @IsOptional() @IsIn(['pending', 'dismissed']) status?: string;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class RemindersService extends TenantCrudService<Reminder> {
  private readonly logger = new Logger(RemindersService.name);
  protected searchFields = ['title', 'message'];
  protected populate = ['customer', 'vehicle'];
  protected dateField = 'dueDate';

  constructor(
    @InjectModel(Reminder.name) model: Model<Reminder>,
    @InjectModel(Vehicle.name) private readonly vehicles: Model<Vehicle>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    private readonly tenants: TenantsService,
    private readonly notifier: NotifierService,
  ) {
    super(model);
  }

  private async upsert(tenantId: string, r: Partial<Reminder> & { dedupeKey: string }) {
    const res = await this.model
      .updateOne({ tenantId, dedupeKey: r.dedupeKey }, { $setOnInsert: { ...r, tenantId } }, { upsert: true })
      .exec();
    return res.upsertedCount;
  }

  /** Scans vehicles, customers and invoices and creates any reminders that are due soon. */
  async generate(tenantId: string) {
    const tenant = await this.tenants.findById(tenantId);
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const in14 = new Date(now.getTime() + 14 * 86400000);
    let created = 0;

    const vehicles = await this.vehicles
      .find({
        tenantId,
        $or: [
          { nextServiceDue: { $lte: in7 } },
          { insuranceExpiry: { $gte: now, $lte: in14 } },
          { licenseExpiry: { $gte: now, $lte: in14 } },
        ],
      })
      .lean()
      .exec();
    for (const v of vehicles) {
      if (v.nextServiceDue && v.nextServiceDue <= in7) {
        created += await this.upsert(tenantId, {
          type: 'service_due',
          title: `Service due: ${v.registrationNo}`,
          message: `Dear customer, your vehicle ${v.registrationNo} is due for service on ${fmt(v.nextServiceDue)}. Book with ${tenant.name}${tenant.phone ? ` on ${tenant.phone}` : ''}.`,
          dueDate: v.nextServiceDue,
          customer: v.customer,
          vehicle: v._id,
          dedupeKey: `service:${v._id}:${fmt(v.nextServiceDue)}`,
        });
      }
      for (const [field, type, label] of [
        ['insuranceExpiry', 'insurance', 'Insurance'],
        ['licenseExpiry', 'license', 'Revenue licence'],
      ] as const) {
        const date = v[field];
        if (date && date >= now && date <= in14) {
          created += await this.upsert(tenantId, {
            type,
            title: `${label} expiring: ${v.registrationNo}`,
            message: `${label} for ${v.registrationNo} expires on ${fmt(date)}. - ${tenant.name}`,
            dueDate: date,
            customer: v.customer,
            vehicle: v._id,
            dedupeKey: `${type}:${v._id}:${fmt(date)}`,
          });
        }
      }
    }

    const overdue = await this.invoices
      .find({
        tenantId,
        type: InvoiceType.INVOICE,
        status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL] },
        balance: { $gt: 0 },
        dueDate: { $lt: now },
      })
      .lean()
      .exec();
    for (const inv of overdue) {
      created += await this.upsert(tenantId, {
        type: 'payment',
        title: `Payment overdue: ${inv.number}`,
        message: `Reminder: ${tenant.settings.currency} ${inv.balance.toFixed(2)} is outstanding on invoice ${inv.number}. - ${tenant.name}`,
        dueDate: now,
        customer: inv.customer,
        invoice: inv._id,
        dedupeKey: `payment:${inv._id}:${fmt(now).slice(0, 7)}`,
      });
    }

    const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const birthdays = await this.customers
      .find({ tenantId, birthday: { $exists: true }, marketingOptIn: true })
      .lean()
      .exec();
    for (const c of birthdays.filter((c) => c.birthday && fmt(new Date(c.birthday)).slice(5) === md)) {
      created += await this.upsert(tenantId, {
        type: 'birthday',
        title: `Birthday: ${c.name}`,
        message: `Happy birthday ${c.name}! Wishing you safe drives from all of us at ${tenant.name}.`,
        dueDate: now,
        customer: c._id,
        dedupeKey: `birthday:${c._id}:${now.getFullYear()}`,
      });
    }
    return { created };
  }

  async send(tenantId: string, id: string) {
    const r = await this.model.findOne({ _id: id, tenantId }).populate<{ customer: Customer }>('customer').exec();
    if (!r) throw new BadRequestException('Reminder not found');
    const ent = await this.tenants.getEntitlements(tenantId);
    const customer = r.customer;
    const text = r.message || r.title;
    let result;
    if (r.channel === 'sms') {
      if (!ent.features.includes(Feature.SMS)) throw new BadRequestException('SMS is not included in your plan');
      if (!customer?.phone) throw new BadRequestException('Customer has no phone number');
      result = await this.notifier.sms(customer.phone, text);
    } else if (r.channel === 'email') {
      if (!ent.features.includes(Feature.EMAIL)) throw new BadRequestException('Email is not included in your plan');
      if (!customer?.email) throw new BadRequestException('Customer has no email');
      result = await this.notifier.email(customer.email, r.title, text);
    } else {
      result = { ok: true, provider: 'none' };
    }
    r.status = result.ok ? 'sent' : 'failed';
    r.sentAt = result.ok ? new Date() : undefined;
    r.error = result.ok ? undefined : 'error' in result ? result.error : undefined;
    await r.save();
    return this.findOne(tenantId, id);
  }

  /** Daily at 07:00 server time: generate reminders for every tenant on a plan with reminders. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async daily() {
    const tenants = await this.tenantModel.find({ status: { $in: ['trial', 'active'] } }).select('_id').lean().exec();
    for (const t of tenants) {
      const id = String(t._id);
      try {
        const ent = await this.tenants.getEntitlements(id);
        if (ent.active && ent.features.includes(Feature.REMINDERS)) await this.generate(id);
      } catch (e) {
        this.logger.warn(`Reminder generation failed for ${id}: ${(e as Error).message}`);
      }
    }
  }
}

@ApiTags('reminders')
@RequireFeature(Feature.REMINDERS)
@Controller('reminders')
export class RemindersController extends CrudController<Reminder>(CreateReminderDto, UpdateReminderDto) {
  constructor(readonly service: RemindersService) {
    super();
  }

  @HttpCode(200)
  @Post('actions/generate')
  generate(@TenantId() tenantId: string) {
    return this.service.generate(tenantId);
  }

  @HttpCode(200)
  @Post(':id/send')
  send(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.send(tenantId, id);
  }
}

/** Vercel Cron entry point; Vercel sends "Authorization: Bearer $CRON_SECRET". */
@Public()
@Controller('cron')
export class RemindersCronController {
  constructor(private readonly service: RemindersService) {}

  @Get('reminders')
  async run(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException();
    await this.service.daily();
    return { ok: true };
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reminder.name, schema: ReminderSchema }]),
    CustomersModule,
    VehiclesModule,
    InvoicesModule,
  ],
  controllers: [RemindersController, RemindersCronController],
  providers: [RemindersService, NotifierService],
  exports: [NotifierService],
})
export class RemindersModule {}
