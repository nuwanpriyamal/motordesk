import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { AuthUser, CurrentUser, RequireFeature, TenantId } from '../common/decorators';
import { TenantCrudService } from '../common/tenant-crud.service';
import { RealtimeService } from '../realtime/realtime.service';

@Schema({ timestamps: true })
export class Part {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ required: true, uppercase: true, trim: true }) sku!: string;
  @Prop({ required: true }) name!: string;
  @Prop() category?: string;
  @Prop() brand?: string;
  @Prop() barcode?: string;
  @Prop({ default: 'pcs' }) unit!: string;
  @Prop({ default: 0 }) costPrice!: number;
  @Prop({ default: 0 }) sellPrice!: number;
  @Prop({ default: 0 }) quantity!: number;
  @Prop({ default: 5 }) reorderLevel!: number;
  @Prop() location?: string;
  @Prop() supplierName?: string;
  @Prop() supplierPhone?: string;
}

export const PartSchema = SchemaFactory.createForClass(Part);
PartSchema.index({ tenantId: 1, sku: 1 }, { unique: true });

@Schema({ timestamps: true })
export class StockMovement {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Part', required: true, index: true }) part!: Types.ObjectId;
  @Prop({ enum: ['in', 'out', 'adjust'], required: true }) type!: string;
  /** Signed change applied to the stock level. */
  @Prop({ required: true }) quantity!: number;
  @Prop() unitCost?: number;
  @Prop() reason?: string;
  @Prop() reference?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) user?: Types.ObjectId;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

export class CreatePartDto {
  @IsString() sku!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) sellPrice?: number;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() supplierPhone?: string;
}

/** Stock level is changed only through /adjust so every change is recorded. */
export class UpdatePartDto extends PartialType(CreatePartDto) {}

export class AdjustStockDto {
  @IsIn(['in', 'out', 'adjust']) type!: 'in' | 'out' | 'adjust';
  /** For in/out: a positive amount. For adjust: the new absolute stock level. */
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() reference?: string;
}

@Injectable()
export class InventoryService extends TenantCrudService<Part> {
  protected searchFields = ['sku', 'name', 'brand', 'barcode', 'category'];

  constructor(
    @InjectModel(Part.name) model: Model<Part>,
    @InjectModel(StockMovement.name) private readonly movements: Model<StockMovement>,
    private readonly realtime: RealtimeService,
  ) {
    super(model);
  }

  async update(tenantId: string, id: string, dto: Partial<Part>) {
    const { quantity: _ignored, ...rest } = dto;
    return super.update(tenantId, id, rest);
  }

  async adjust(tenantId: string, id: string, dto: AdjustStockDto, userId?: string) {
    const part = await this.findOne(tenantId, id);
    let delta = dto.quantity;
    if (dto.type === 'out') delta = -dto.quantity;
    if (dto.type === 'adjust') delta = dto.quantity - part.quantity;
    return this.applyMovement(tenantId, id, delta, dto.type, {
      unitCost: dto.unitCost,
      reason: dto.reason,
      reference: dto.reference,
      userId,
    });
  }

  /** Atomically changes stock and logs the movement. Refuses to go below zero on "out". */
  async applyMovement(
    tenantId: string,
    partId: string,
    delta: number,
    type: 'in' | 'out' | 'adjust',
    meta: { unitCost?: number; reason?: string; reference?: string; userId?: string } = {},
  ) {
    const filter: Record<string, unknown> = { _id: partId, tenantId };
    if (type === 'out') filter.quantity = { $gte: -delta };
    const set: Record<string, unknown> = {};
    if (type === 'in' && meta.unitCost) set.costPrice = meta.unitCost;
    const part = await this.model
      .findOneAndUpdate(filter, { $inc: { quantity: delta }, ...(Object.keys(set).length ? { $set: set } : {}) }, { new: true })
      .lean()
      .exec();
    if (!part) throw new BadRequestException('Insufficient stock or part not found');
    await this.movements.create({
      tenantId,
      part: partId,
      type,
      quantity: delta,
      unitCost: meta.unitCost,
      reason: meta.reason,
      reference: meta.reference,
      user: meta.userId,
    });
    if (part.quantity <= part.reorderLevel) {
      this.realtime.publish(tenantId, 'inventory.low', { partId, sku: part.sku, name: part.name, quantity: part.quantity });
    }
    return part;
  }

  lowStock(tenantId: string) {
    return this.model
      .find({ tenantId, $expr: { $lte: ['$quantity', '$reorderLevel'] } })
      .sort({ quantity: 1 })
      .lean()
      .exec();
  }

  history(tenantId: string, partId: string) {
    return this.movements
      .find({ tenantId, part: partId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', 'name')
      .lean()
      .exec();
  }

  async valuation(tenantId: string) {
    const [res] = await this.model
      .aggregate([
        { $match: { tenantId: new Types.ObjectId(tenantId) } },
        {
          $group: {
            _id: null,
            items: { $sum: 1 },
            units: { $sum: '$quantity' },
            costValue: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
            retailValue: { $sum: { $multiply: ['$quantity', '$sellPrice'] } },
          },
        },
      ])
      .exec();
    return res ?? { items: 0, units: 0, costValue: 0, retailValue: 0 };
  }
}

@ApiTags('inventory')
@RequireFeature(Feature.INVENTORY)
@Controller('parts')
export class InventoryController extends CrudController<Part>(CreatePartDto, UpdatePartDto) {
  constructor(readonly service: InventoryService) {
    super();
  }

  @Get('reports/low-stock')
  lowStock(@TenantId() tenantId: string) {
    return this.service.lowStock(tenantId);
  }

  @Get('reports/valuation')
  valuation(@TenantId() tenantId: string) {
    return this.service.valuation(tenantId);
  }

  @Get(':id/movements')
  movements(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.history(tenantId, id);
  }

  @Post(':id/adjust')
  adjust(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.adjust(tenantId, id, dto, user.sub);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Part.name, schema: PartSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
