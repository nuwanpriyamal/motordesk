import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature, InvoiceStatus, InvoiceType } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { RequireFeature, TenantId } from '../common/decorators';
import { LineItemDto } from '../common/line-item.dto';
import { LineItem, LineItemSchema, computeTotals } from '../common/line-item.schema';
import { ListQueryDto } from '../common/list-query.dto';
import { TenantCrudService } from '../common/tenant-crud.service';
import { CountersService } from '../counters/counters.module';
import { CustomersModule, CustomersService } from '../customers/customers';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantsService } from '../tenants/tenants.service';

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'cheque', 'online', 'other'];

@Schema({ _id: true, timestamps: false })
export class Payment {
  @Prop({ required: true }) amount!: number;
  @Prop({ enum: PAYMENT_METHODS, default: 'cash' }) method!: string;
  @Prop({ default: () => new Date() }) paidAt!: Date;
  @Prop() reference?: string;
  @Prop({ default: false }) refund!: boolean;
}
const PaymentSchema = SchemaFactory.createForClass(Payment);

/** Quotes and invoices share one collection; a quote converts into an invoice. */
@Schema({ timestamps: true })
export class Invoice {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ enum: InvoiceType, default: InvoiceType.INVOICE }) type!: InvoiceType;
  @Prop({ required: true }) number!: string;
  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT }) status!: InvoiceStatus;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer', required: true }) customer!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Vehicle' }) vehicle?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'JobCard' }) jobCard?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Invoice' }) convertedFrom?: Types.ObjectId;
  @Prop({ type: [LineItemSchema], default: [] }) items!: LineItem[];
  @Prop({ default: 0 }) subtotal!: number;
  @Prop({ default: 0 }) discount!: number;
  @Prop({ default: 0 }) taxRate!: number;
  @Prop({ default: 0 }) tax!: number;
  @Prop({ default: 0 }) total!: number;
  @Prop({ default: 0 }) paid!: number;
  @Prop({ default: 0 }) balance!: number;
  @Prop({ type: [PaymentSchema], default: [] }) payments!: Payment[];
  @Prop({ default: () => new Date() }) issueDate!: Date;
  @Prop() dueDate?: Date;
  @Prop() notes?: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });
InvoiceSchema.index({ tenantId: 1, issueDate: -1 });

export class CreateInvoiceDto {
  @IsOptional() @IsEnum(InvoiceType) type?: InvoiceType;
  @IsMongoId() customer!: string;
  @IsOptional() @IsMongoId() vehicle?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto) items!: LineItemDto[];
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateInvoiceDto extends PartialType(OmitType(CreateInvoiceDto, ['type'] as const)) {
  @IsOptional() @IsIn([InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.ACCEPTED, InvoiceStatus.CANCELLED])
  status?: InvoiceStatus;
}

export class AddPaymentDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  /** Record money returned to the customer. */
  @IsOptional() @IsBoolean() refund?: boolean;
}

@Injectable()
export class InvoicesService extends TenantCrudService<Invoice> {
  protected searchFields = ['number', 'notes'];
  protected populate = ['customer', 'vehicle'];
  protected dateField = 'issueDate';

  constructor(
    @InjectModel(Invoice.name) model: Model<Invoice>,
    private readonly counters: CountersService,
    private readonly tenants: TenantsService,
    private readonly customers: CustomersService,
    private readonly realtime: RealtimeService,
  ) {
    super(model);
  }

  protected buildFilter(tenantId: string, q: ListQueryDto) {
    const filter = super.buildFilter(tenantId, q) as Record<string, unknown>;
    if (q.type) filter.type = q.type;
    return filter;
  }

  private withTotals<D extends Partial<Invoice>>(dto: D, fallbackTaxRate: number): D {
    if (!dto.items) return dto;
    const taxRate = dto.taxRate ?? fallbackTaxRate;
    const totals = computeTotals(dto.items, dto.discount ?? 0, taxRate);
    return { ...dto, ...totals, taxRate };
  }

  async create(tenantId: string, dto: Partial<Invoice>) {
    const tenant = await this.tenants.findById(tenantId);
    const type = dto.type ?? InvoiceType.INVOICE;
    const number = await this.counters.next(tenantId, type, type === InvoiceType.QUOTE ? 'QT' : 'INV');
    const data = this.withTotals({ ...dto, type, number }, tenant.settings.taxRate);
    data.balance = data.total ?? 0;
    const created = await super.create(tenantId, data);
    this.realtime.publish(tenantId, 'invoice.created', { id: String(created._id), number });
    return created;
  }

  async update(tenantId: string, id: string, dto: Partial<Invoice>) {
    const current = await this.findOne(tenantId, id);
    if (current.paid > 0 && dto.items) throw new BadRequestException('Cannot change items after a payment');
    const data = this.withTotals(
      { discount: current.discount, taxRate: current.taxRate, ...dto },
      current.taxRate,
    );
    if (data.total !== undefined) data.balance = Math.max(data.total - current.paid, 0);
    return super.update(tenantId, id, data);
  }

  async addPayment(tenantId: string, id: string, dto: AddPaymentDto) {
    const inv = await this.model.findOne({ _id: id, tenantId }).exec();
    if (!inv) throw new BadRequestException('Invoice not found');
    if (inv.type !== InvoiceType.INVOICE) throw new BadRequestException('Payments apply to invoices only');
    if (inv.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Invoice is cancelled');
    const signed = dto.refund ? -dto.amount : dto.amount;
    if (!dto.refund && dto.amount > inv.balance + 0.001) throw new BadRequestException('Amount exceeds balance');
    if (dto.refund && dto.amount > inv.paid + 0.001) throw new BadRequestException('Refund exceeds amount paid');
    inv.payments.push({
      amount: dto.amount,
      method: dto.method ?? 'cash',
      reference: dto.reference,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      refund: !!dto.refund,
    });
    inv.paid = Math.round((inv.paid + signed) * 100) / 100;
    inv.balance = Math.round((inv.total - inv.paid) * 100) / 100;
    inv.status = inv.balance <= 0 ? InvoiceStatus.PAID : inv.paid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.SENT;
    await inv.save();
    if (inv.status === InvoiceStatus.PAID && !dto.refund) {
      // One loyalty point per 100 of currency paid.
      await this.customers.addLoyaltyPoints(tenantId, String(inv.customer), Math.floor(inv.total / 100));
    }
    this.realtime.publish(tenantId, 'invoice.payment', { id, number: inv.number, status: inv.status, amount: signed });
    return this.findOne(tenantId, id);
  }

  async convertQuote(tenantId: string, id: string) {
    const quote = await this.findOne(tenantId, id);
    if (quote.type !== InvoiceType.QUOTE) throw new BadRequestException('Only quotes can be converted');
    if (quote.status === InvoiceStatus.CONVERTED) throw new BadRequestException('Quote already converted');
    const invoice = await this.create(tenantId, {
      type: InvoiceType.INVOICE,
      customer: (quote.customer as unknown as { _id: Types.ObjectId })._id ?? quote.customer,
      vehicle: (quote.vehicle as unknown as { _id: Types.ObjectId })?._id ?? quote.vehicle,
      jobCard: quote.jobCard,
      items: quote.items,
      discount: quote.discount,
      taxRate: quote.taxRate,
      notes: quote.notes,
      convertedFrom: new Types.ObjectId(id),
    });
    await this.model.updateOne({ _id: id, tenantId }, { status: InvoiceStatus.CONVERTED }).exec();
    return invoice;
  }

  async summary(tenantId: string, from: Date, to: Date) {
    const [res] = await this.model
      .aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(tenantId),
            type: InvoiceType.INVOICE,
            status: { $ne: InvoiceStatus.CANCELLED },
            issueDate: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: null,
            invoiced: { $sum: '$total' },
            collected: { $sum: '$paid' },
            outstanding: { $sum: '$balance' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    return res ?? { invoiced: 0, collected: 0, outstanding: 0, count: 0 };
  }
}

@ApiTags('invoices')
@RequireFeature(Feature.INVOICING)
@Controller('invoices')
export class InvoicesController extends CrudController<Invoice>(CreateInvoiceDto, UpdateInvoiceDto) {
  constructor(readonly service: InvoicesService) {
    super();
  }

  @Post(':id/payments')
  addPayment(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: AddPaymentDto) {
    return this.service.addPayment(tenantId, id, dto);
  }

  @Post(':id/convert')
  convert(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.convertQuote(tenantId, id);
  }

  @Get('reports/summary')
  summary(@TenantId() tenantId: string) {
    const now = new Date();
    return this.service.summary(tenantId, new Date(now.getFullYear(), now.getMonth(), 1), now);
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Invoice.name, schema: InvoiceSchema }]), CustomersModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService, MongooseModule],
})
export class InvoicesModule {}
