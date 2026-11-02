import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class PlanLimits {
  @Prop({ default: 3 }) maxUsers!: number;
  @Prop({ default: 500 }) maxVehicles!: number;
  @Prop({ default: 1000 }) maxJobCardsPerMonth!: number;
  @Prop({ default: 100 }) smsPerMonth!: number;
}

/** A subscription package that the platform sells to vendors (service stations). */
@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, unique: true }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop() description?: string;
  @Prop({ default: 'LKR' }) currency!: string;
  @Prop({ default: 0 }) monthlyPrice!: number;
  @Prop({ default: 0 }) yearlyPrice!: number;
  @Prop({ default: 14 }) trialDays!: number;
  @Prop({ type: [String], default: [] }) features!: string[];
  @Prop({ type: PlanLimits, default: () => ({}) }) limits!: PlanLimits;
  @Prop({ default: true }) isPublic!: boolean;
  @Prop({ default: true }) active!: boolean;
  @Prop({ default: 0 }) sortOrder!: number;
}

export type PlanDocument = HydratedDocument<Plan>;
export const PlanSchema = SchemaFactory.createForClass(Plan);
