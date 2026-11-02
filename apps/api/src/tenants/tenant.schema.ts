import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { TenantStatus } from '../common/constants';

@Schema({ _id: false })
export class TenantSettings {
  @Prop({ default: 'LKR' }) currency!: string;
  @Prop({ default: 0 }) taxRate!: number;
  @Prop({ default: 'Asia/Colombo' }) timezone!: string;
  @Prop() invoiceFooter?: string;
  @Prop({ default: 5000 }) serviceIntervalKm!: number;
  @Prop({ default: 180 }) serviceIntervalDays!: number;
  @Prop({ default: 60 }) slotMinutes!: number;
  @Prop({ default: 3 }) bays!: number;
  @Prop({ default: '08:00' }) openTime!: string;
  @Prop({ default: '18:00' }) closeTime!: string;
}

@Schema({ _id: false })
export class SubscriptionPayment {
  @Prop({ required: true }) amount!: number;
  @Prop({ default: () => new Date() }) paidAt!: Date;
  @Prop() method?: string;
  @Prop() reference?: string;
  @Prop() periodEnd?: Date;
}

/**
 * A vendor (service station) that subscribes to the platform.
 * Pricing is per tenant: the plan price applies unless customPrice or discountPercent is set.
 */
@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true }) slug!: string;
  @Prop() email?: string;
  @Prop() phone?: string;
  @Prop() address?: string;
  @Prop() city?: string;
  @Prop() logoUrl?: string;
  @Prop() registrationNo?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Plan', required: true }) plan!: Types.ObjectId;
  @Prop({ enum: TenantStatus, default: TenantStatus.TRIAL }) status!: TenantStatus;
  @Prop({ enum: ['monthly', 'yearly'], default: 'monthly' }) billingCycle!: string;
  @Prop() customPrice?: number;
  @Prop({ default: 0 }) discountPercent!: number;
  @Prop() trialEndsAt?: Date;
  @Prop() currentPeriodEnd?: Date;
  /** Features switched on/off for this tenant on top of the plan. */
  @Prop({ type: [String], default: [] }) extraFeatures!: string[];
  @Prop({ type: [String], default: [] }) disabledFeatures!: string[];
  @Prop({ type: [SubscriptionPayment], default: [] }) payments!: SubscriptionPayment[];
  @Prop() notes?: string;

  @Prop({ type: TenantSettings, default: () => ({}) }) settings!: TenantSettings;
}

export type TenantDocument = HydratedDocument<Tenant>;
export const TenantSchema = SchemaFactory.createForClass(Tenant);
