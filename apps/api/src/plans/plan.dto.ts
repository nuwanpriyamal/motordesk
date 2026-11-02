import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ALL_FEATURES } from '../common/constants';

export class PlanLimitsDto {
  @IsOptional() @IsInt() @Min(0) maxUsers?: number;
  @IsOptional() @IsInt() @Min(0) maxVehicles?: number;
  @IsOptional() @IsInt() @Min(0) maxJobCardsPerMonth?: number;
  @IsOptional() @IsInt() @Min(0) smsPerMonth?: number;
}

export class CreatePlanDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number;
  @IsOptional() @IsNumber() @Min(0) yearlyPrice?: number;
  @IsOptional() @IsInt() @Min(0) trialDays?: number;
  @IsOptional() @IsArray() @IsIn(ALL_FEATURES, { each: true }) features?: string[];
  @IsOptional() @ValidateNested() @Type(() => PlanLimitsDto) limits?: PlanLimitsDto;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
