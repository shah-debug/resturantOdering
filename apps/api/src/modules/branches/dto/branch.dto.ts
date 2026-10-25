import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const E164 = /^\+[1-9][0-9]{7,14}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBranchDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @Transform(trim)
  @Matches(E164, { message: 'Use international format, e.g. +923001234567' })
  phone!: string;

  @Transform(trim)
  @IsString()
  @Length(5, 255)
  addressLine!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  area?: string | null;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  city!: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(E164, { message: 'Use international format, e.g. +923001234567' })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 255)
  addressLine?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  area?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  city?: string;
}

export class OpeningIntervalDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @Matches(TIME_OF_DAY, { message: 'Use 24-hour time, e.g. 09:30' })
  opensAt!: string;

  @Matches(TIME_OF_DAY, { message: 'Use 24-hour time, e.g. 09:30' })
  closesAt!: string;
}

export class OpeningHoursDto {
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OpeningIntervalDto)
  intervals!: OpeningIntervalDto[];
}

export class DeliverySettingsDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  feeMinor!: number;

  @IsInt()
  @Min(0)
  @Max(10_000_000)
  minimumOrderMinor!: number;

  @IsInt()
  @Min(5)
  @Max(240)
  estimatedMinutes!: number;
}

export class FulfillmentDto {
  @IsBoolean()
  deliveryEnabled!: boolean;

  @IsBoolean()
  pickupEnabled!: boolean;

  @IsInt()
  @Min(5)
  @Max(240)
  preparationMinutes!: number;

  @ValidateIf((dto: FulfillmentDto) => dto.delivery !== null && dto.delivery !== undefined)
  @ValidateNested()
  @Type(() => DeliverySettingsDto)
  delivery!: DeliverySettingsDto | null;
}
