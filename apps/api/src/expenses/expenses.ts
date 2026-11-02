import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { RequireFeature, TenantId } from '../common/decorators';
import { TenantCrudService } from '../common/tenant-crud.service';

export const EXPENSE_CATEGORIES = [
  'parts_purchase',
  'salaries',
  'rent',
  'utilities',
  'equipment',
  'marketing',
  'transport',
  'maintenance',
  'taxes',
  'other',
];

@Schema({ timestamps: true })
export class Expense {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ enum: EXPENSE_CATEGORIES, default: 'other' }) category!: string;
  @Prop({ required: true }) amount!: number;
  @Prop({ default: () => new Date(), index: true }) date!: Date;
  @Prop() vendor?: string;
  @Prop() description?: string;
  @Prop() reference?: string;
  @Prop({ enum: ['cash', 'card', 'bank_transfer', 'cheque', 'other'], default: 'cash' }) method!: string;
  @Prop() receiptUrl?: string;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES) category!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsIn(['cash', 'card', 'bank_transfer', 'cheque', 'other']) method?: string;
  @IsOptional() @IsString() receiptUrl?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

@Injectable()
export class ExpensesService extends TenantCrudService<Expense> {
  protected searchFields = ['vendor', 'description', 'reference'];
  protected dateField = 'date';

  constructor(@InjectModel(Expense.name) model: Model<Expense>) {
    super(model);
  }

  byCategory(tenantId: string, from: Date, to: Date) {
    return this.model
      .aggregate([
        { $match: { tenantId: new Types.ObjectId(tenantId), date: { $gte: from, $lte: to } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $project: { _id: 0, category: '$_id', total: 1, count: 1 } },
        { $sort: { total: -1 } },
      ])
      .exec();
  }
}

@ApiTags('expenses')
@RequireFeature(Feature.EXPENSES)
@Controller('expenses')
export class ExpensesController extends CrudController<Expense>(CreateExpenseDto, UpdateExpenseDto) {
  constructor(readonly service: ExpensesService) {
    super();
  }

  @Get('reports/by-category')
  byCategory(@TenantId() tenantId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    return this.service.byCategory(
      tenantId,
      from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
      to ? new Date(to) : now,
    );
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Expense.name, schema: ExpenseSchema }])],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
