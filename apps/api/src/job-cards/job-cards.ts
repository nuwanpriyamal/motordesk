import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature, InvoiceType, JobStatus } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { AuthUser, CurrentUser, RequireFeature, TenantId } from '../common/decorators';
import { LineItemDto } from '../common/line-item.dto';
import { LineItem, LineItemSchema, computeTotals } from '../common/line-item.schema';
import { TenantCrudService } from '../common/tenant-crud.service';
import { CountersService } from '../counters/counters.module';
import { InventoryModule, InventoryService } from '../inventory/inventory';
import { InvoicesModule, InvoicesService } from '../invoices/invoices';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantsService } from '../tenants/tenants.service';
import { VehiclesModule, VehiclesService } from '../vehicles/vehicles';

@Schema({ _id: false })
class ChecklistItem {
  @Prop({ required: true }) label!: string;
  @Prop({ default: false }) done!: boolean;
  @Prop() note?: string;
}

@Schema({ _id: true })
class TimeLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true }) user!: Types.ObjectId;
  @Prop({ required: true }) startedAt!: Date;
  @Prop() endedAt?: Date;
  @Prop({ default: 0 }) minutes!: number;
}

@Schema({ timestamps: true })
export class JobCard {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ required: true }) number!: string;
  @Prop({ enum: JobStatus, default: JobStatus.PENDING, index: true }) status!: JobStatus;
  @Prop({ enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' }) priority!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true }) customer!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Vehicle', required: true }) vehicle!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' }) appointment?: Types.ObjectId;
  @Prop() serviceType?: string;
  @Prop() complaint?: string;
  @Prop() diagnosis?: string;
  @Prop() mileageIn?: number;
  @Prop() fuelLevel?: string;
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'User' }], default: [] }) assignedTo!: Types.ObjectId[];
  @Prop({ type: [LineItemSchema], default: [] }) items!: LineItem[];
  @Prop({ type: [SchemaFactory.createForClass(ChecklistItem)], default: [] }) checklist!: ChecklistItem[];
  @Prop({ type: [SchemaFactory.createForClass(TimeLog)], default: [] }) timeLogs!: TimeLog[];
  @Prop({ type: [String], default: [] }) photos!: string[];
  @Prop({ default: 0 }) subtotal!: number;
  @Prop({ default: 0 }) discount!: number;
  @Prop({ default: 0 }) total!: number;
  @Prop() estimatedCompletion?: Date;
  @Prop() startedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() deliveredAt?: Date;
  @Prop({ default: false }) stockDeducted!: boolean;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice' }) invoice?: Types.ObjectId;
  /** Customer approval signature as a data URL. */
  @Prop() customerSignature?: string;
  @Prop() approvedAt?: Date;
  @Prop() notes?: string;
}

export const JobCardSchema = SchemaFactory.createForClass(JobCard);
JobCardSchema.index({ tenantId: 1, number: 1 }, { unique: true });

class ChecklistItemDto {
  @IsString() label!: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsString() note?: string;
}

export class CreateJobCardDto {
  @IsMongoId() customer!: string;
  @IsMongoId() vehicle!: string;
  @IsOptional() @IsMongoId() appointment?: string;
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() complaint?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsInt() @Min(0) mileageIn?: number;
  @IsOptional() @IsString() fuelLevel?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) assignedTo?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto) items?: LineItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) checklist?: ChecklistItemDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsDateString() estimatedCompletion?: string;
  @IsOptional() @IsString() customerSignature?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateJobCardDto extends PartialType(CreateJobCardDto) {}

export class ChangeStatusDto {
  @IsEnum(JobStatus) status!: JobStatus;
}

const DEFAULT_CHECKLIST = [
  'Engine oil level',
  'Brake fluid',
  'Coolant level',
  'Tyre pressure & condition',
  'Lights & indicators',
  'Battery condition',
  'Wipers & washer fluid',
  'Test drive',
];

@Injectable()
export class JobCardsService extends TenantCrudService<JobCard> {
  protected searchFields = ['number', 'complaint', 'serviceType'];
  protected populate = ['customer', 'vehicle', 'assignedTo'];

  constructor(
    @InjectModel(JobCard.name) model: Model<JobCard>,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
    private readonly invoices: InvoicesService,
    private readonly vehicles: VehiclesService,
    private readonly tenants: TenantsService,
    private readonly realtime: RealtimeService,
  ) {
    super(model);
  }

  private withTotals(dto: Partial<JobCard>) {
    if (!dto.items) return dto;
    const { subtotal, total } = computeTotals(dto.items, dto.discount ?? 0, 0);
    return { ...dto, subtotal, total };
  }

  async create(tenantId: string, dto: Partial<JobCard>) {
    const number = await this.counters.next(tenantId, 'jobCard', 'JC');
    const checklist = dto.checklist?.length ? dto.checklist : DEFAULT_CHECKLIST.map((label) => ({ label, done: false }));
    const job = await super.create(tenantId, this.withTotals({ ...dto, number, checklist }));
    this.realtime.publish(tenantId, 'job.created', { id: String(job._id), number });
    return job;
  }

  async update(tenantId: string, id: string, dto: Partial<JobCard>) {
    const current = await this.findOne(tenantId, id);
    if (dto.items && current.stockDeducted) {
      throw new BadRequestException('Parts were already issued for this job. Reopen it to change items.');
    }
    const job = await super.update(tenantId, id, this.withTotals({ discount: current.discount, ...dto }));
    this.realtime.publish(tenantId, 'job.updated', { id, number: current.number });
    return job;
  }

  async changeStatus(tenantId: string, id: string, status: JobStatus) {
    const job = await this.model.findOne({ _id: id, tenantId }).exec();
    if (!job) throw new BadRequestException('Job card not found');
    const from = job.status;
    if (from === status) return this.findOne(tenantId, id);

    const now = new Date();
    if (status === JobStatus.IN_PROGRESS && !job.startedAt) job.startedAt = now;

    const finishing = status === JobStatus.COMPLETED || status === JobStatus.DELIVERED;
    if (finishing && !job.stockDeducted) {
      await this.issueParts(tenantId, job.items, job.number, 'out');
      job.stockDeducted = true;
    }
    // Reopening or cancelling puts issued parts back on the shelf.
    if (!finishing && job.stockDeducted) {
      await this.issueParts(tenantId, job.items, job.number, 'in');
      job.stockDeducted = false;
    }
    if (status === JobStatus.COMPLETED) {
      job.completedAt = now;
      await this.vehicles.recordService(tenantId, String(job.vehicle), job.mileageIn);
    }
    if (status === JobStatus.DELIVERED) job.deliveredAt = now;
    this.closeOpenTimers(job, now);

    job.status = status;
    await job.save();
    this.realtime.publish(tenantId, 'job.status', { id, number: job.number, from, to: status });
    return this.findOne(tenantId, id);
  }

  private async issueParts(tenantId: string, items: LineItem[], ref: string, dir: 'in' | 'out') {
    const done: LineItem[] = [];
    try {
      for (const it of items.filter((i) => i.part)) {
        const qty = dir === 'out' ? -it.quantity : it.quantity;
        await this.inventory.applyMovement(tenantId, String(it.part), qty, dir, {
          reason: dir === 'out' ? 'Issued to job' : 'Returned from job',
          reference: ref,
        });
        done.push(it);
      }
    } catch (e) {
      // Roll back whatever was already moved so stock stays consistent.
      for (const it of done) {
        const qty = dir === 'out' ? it.quantity : -it.quantity;
        await this.inventory.applyMovement(tenantId, String(it.part), qty, 'adjust', { reason: 'Rollback', reference: ref });
      }
      throw e;
    }
  }

  private closeOpenTimers(job: { timeLogs: TimeLog[] }, now: Date) {
    for (const log of job.timeLogs) {
      if (!log.endedAt) {
        log.endedAt = now;
        log.minutes = Math.round((now.getTime() - new Date(log.startedAt).getTime()) / 60000);
      }
    }
  }

  async startTimer(tenantId: string, id: string, userId: string) {
    const job = await this.model.findOne({ _id: id, tenantId }).exec();
    if (!job) throw new BadRequestException('Job card not found');
    if (job.timeLogs.some((l) => !l.endedAt && String(l.user) === userId)) {
      throw new BadRequestException('Timer already running');
    }
    job.timeLogs.push({ user: new Types.ObjectId(userId), startedAt: new Date(), minutes: 0 });
    if (job.status === JobStatus.PENDING) {
      job.status = JobStatus.IN_PROGRESS;
      job.startedAt ??= new Date();
    }
    await job.save();
    this.realtime.publish(tenantId, 'job.timer', { id, number: job.number, user: userId, running: true });
    return this.findOne(tenantId, id);
  }

  async stopTimer(tenantId: string, id: string, userId: string) {
    const job = await this.model.findOne({ _id: id, tenantId }).exec();
    if (!job) throw new BadRequestException('Job card not found');
    const now = new Date();
    this.closeOpenTimers({ timeLogs: job.timeLogs.filter((l) => String(l.user) === userId) }, now);
    job.markModified('timeLogs');
    await job.save();
    this.realtime.publish(tenantId, 'job.timer', { id, number: job.number, user: userId, running: false });
    return this.findOne(tenantId, id);
  }

  async createInvoice(tenantId: string, id: string, type: InvoiceType) {
    const job = await this.model.findOne({ _id: id, tenantId }).lean().exec();
    if (!job) throw new BadRequestException('Job card not found');
    if (type === InvoiceType.INVOICE && job.invoice) throw new BadRequestException('Job is already invoiced');
    if (!job.items.length) throw new BadRequestException('Add labour or parts before invoicing');
    const invoice = await this.invoices.create(tenantId, {
      type,
      customer: job.customer,
      vehicle: job.vehicle,
      jobCard: job._id,
      items: job.items,
      discount: job.discount,
    });
    if (type === InvoiceType.INVOICE) {
      await this.model.updateOne({ _id: id }, { invoice: invoice._id }).exec();
    }
    return invoice;
  }

  /** Kanban board: active jobs grouped by status. */
  async board(tenantId: string) {
    const jobs = await this.model
      .find({ tenantId, status: { $in: [JobStatus.PENDING, JobStatus.IN_PROGRESS, JobStatus.WAITING_PARTS, JobStatus.COMPLETED] } })
      .sort({ createdAt: 1 })
      .populate(['customer', 'vehicle', 'assignedTo'])
      .lean()
      .exec();
    const board: Record<string, unknown[]> = {
      [JobStatus.PENDING]: [],
      [JobStatus.IN_PROGRESS]: [],
      [JobStatus.WAITING_PARTS]: [],
      [JobStatus.COMPLETED]: [],
    };
    const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    jobs
      .sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2))
      .forEach((j) => board[j.status].push(j));
    return board;
  }

  async technicianStats(tenantId: string, from: Date) {
    return this.model
      .aggregate([
        { $match: { tenantId: new Types.ObjectId(tenantId), createdAt: { $gte: from } } },
        { $unwind: '$timeLogs' },
        { $group: { _id: '$timeLogs.user', minutes: { $sum: '$timeLogs.minutes' }, jobs: { $addToSet: '$_id' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { _id: 0, userId: '$_id', name: '$user.name', minutes: 1, jobs: { $size: '$jobs' } } },
        { $sort: { minutes: -1 } },
      ])
      .exec();
  }
}

@ApiTags('job-cards')
@RequireFeature(Feature.JOB_CARDS)
@Controller('job-cards')
export class JobCardsController extends CrudController<JobCard>(CreateJobCardDto, UpdateJobCardDto) {
  constructor(readonly service: JobCardsService) {
    super();
  }

  @Get('views/board')
  board(@TenantId() tenantId: string) {
    return this.service.board(tenantId);
  }

  @Patch(':id/status')
  status(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.service.changeStatus(tenantId, id, dto.status);
  }

  @Post(':id/timer/start')
  start(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.startTimer(tenantId, id, user.sub);
  }

  @Post(':id/timer/stop')
  stop(@TenantId() tenantId: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.stopTimer(tenantId, id, user.sub);
  }

  @RequireFeature(Feature.INVOICING)
  @Post(':id/invoice')
  invoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.createInvoice(tenantId, id, InvoiceType.INVOICE);
  }

  @RequireFeature(Feature.INVOICING)
  @Post(':id/quote')
  quote(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.createInvoice(tenantId, id, InvoiceType.QUOTE);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: JobCard.name, schema: JobCardSchema }]),
    InventoryModule,
    InvoicesModule,
    VehiclesModule,
  ],
  controllers: [JobCardsController],
  providers: [JobCardsService],
  exports: [JobCardsService, MongooseModule],
})
export class JobCardsModule {}
