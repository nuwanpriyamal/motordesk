import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class LineItemDto {
  @IsOptional() @IsIn(['labor', 'part', 'other'])
  kind?: string;

  @IsString()
  description!: string;

  @IsOptional() @IsMongoId()
  part?: string;

  @IsOptional() @IsNumber() @Min(0)
  quantity?: number;

  @IsOptional() @IsNumber() @Min(0)
  unitPrice?: number;

  @IsOptional() @IsNumber() @Min(0)
  discount?: number;
}
