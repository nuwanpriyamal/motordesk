import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ALL_FEATURES, TenantStatus } from '../common/constants';

export class TenantSettingsDto {
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() invoiceFooter?: string;
  @IsOptional() @IsInt() @Min(0) serviceIntervalKm?: number;
  @IsOptional() @IsInt() @Min(0) serviceIntervalDays?: number;
  @IsOptional() @IsInt() @Min(15) slotMinutes?: number;
  @IsOptional() @IsInt() @Min(1) bays?: number;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) openTime?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) closeTime?: string;
}

/** What a tenant owner can edit about their own business. */
export class UpdateMyTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @ValidateNested() @Type(() => TenantSettingsDto) settings?: TenantSettingsDto;
}

/** Super-admin controls: plan, vendor-specific pricing and status. */
export class AdminUpdateTenantDto extends UpdateMyTenantDto {
  @IsOptional() @IsMongoId() plan?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @IsOptional() @IsIn(['monthly', 'yearly']) billingCycle?: string;
  @IsOptional() @IsNumber() @Min(0) customPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsDateString() trialEndsAt?: string;
  @IsOptional() @IsDateString() currentPeriodEnd?: string;
  @IsOptional() @IsArray() @IsIn(ALL_FEATURES, { each: true }) extraFeatures?: string[];
  @IsOptional() @IsArray() @IsIn(ALL_FEATURES, { each: true }) disabledFeatures?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class RecordSubscriptionPaymentDto {
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() reference?: string;
  /** Number of billing periods this payment covers (default 1). */
  @IsOptional() @IsInt() @Min(1) periods?: number;
}
