import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit = 20;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  sort?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  customer?: string;

  @IsOptional() @IsString()
  vehicle?: string;

  @IsOptional() @IsString()
  from?: string;

  @IsOptional() @IsString()
  to?: string;

  /** Invoices only: quote or invoice. */
  @IsOptional() @IsString()
  type?: string;

  /** Vehicles only: next service due within this many days. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  dueWithinDays?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
