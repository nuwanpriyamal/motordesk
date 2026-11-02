import { Controller, Injectable, Module } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { Model, SchemaTypes, Types } from 'mongoose';
import { Feature } from '../common/constants';
import { CrudController } from '../common/crud.controller';
import { RequireFeature } from '../common/decorators';
import { TenantCrudService } from '../common/tenant-crud.service';

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) tenantId!: Types.ObjectId;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ trim: true, index: true }) phone?: string;
  @Prop({ lowercase: true, trim: true }) email?: string;
  @Prop() address?: string;
  @Prop() nic?: string;
  @Prop() birthday?: Date;
  @Prop({ enum: ['sms', 'email', 'whatsapp', 'none'], default: 'sms' }) preferredChannel!: string;
  @Prop({ default: true }) marketingOptIn!: boolean;
  @Prop({ type: [String], default: [] }) tags!: string[];
  @Prop({ default: 0 }) loyaltyPoints!: number;
  @Prop() notes?: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ tenantId: 1, name: 1 });

export class CreateCustomerDto {
  @IsString() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() nic?: string;
  @IsOptional() @IsDateString() birthday?: string;
  @IsOptional() @IsIn(['sms', 'email', 'whatsapp', 'none']) preferredChannel?: string;
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

@Injectable()
export class CustomersService extends TenantCrudService<Customer> {
  protected searchFields = ['name', 'phone', 'email', 'nic'];

  constructor(@InjectModel(Customer.name) model: Model<Customer>) {
    super(model);
  }

  addLoyaltyPoints(tenantId: string, id: string, points: number) {
    return this.model.updateOne({ _id: id, tenantId }, { $inc: { loyaltyPoints: points } }).exec();
  }
}

@ApiTags('customers')
@RequireFeature(Feature.CUSTOMERS)
@Controller('customers')
export class CustomersController extends CrudController<Customer>(CreateCustomerDto, UpdateCustomerDto) {
  constructor(readonly service: CustomersService) {
    super();
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Customer.name, schema: CustomerSchema }])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService, MongooseModule],
})
export class CustomersModule {}
