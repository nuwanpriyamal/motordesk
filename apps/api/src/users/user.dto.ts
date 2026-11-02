import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../common/constants';

const STAFF_ROLES = [Role.OWNER, Role.MANAGER, Role.TECHNICIAN, Role.CASHIER];

export class CreateUserDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(8) password!: string;
  @IsIn(STAFF_ROLES) role!: Role;
  @IsOptional() @IsNumber() hourlyRate?: number;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}
