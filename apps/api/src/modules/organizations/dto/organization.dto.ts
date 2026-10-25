import { RESERVED_ORGANIZATION_SLUGS } from '@app/contracts';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotIn,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MembershipRole } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const E164 = /^\+[1-9][0-9]{7,14}$/;

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @Transform(trimLower)
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/, {
    message:
      'Use 3–63 lowercase letters, numbers and hyphens; start and end with a letter or number',
  })
  @IsNotIn([...RESERVED_ORGANIZATION_SLUGS], { message: 'This address is reserved' })
  slug!: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string | null;

  @IsOptional()
  @Transform(trim)
  @Matches(E164, { message: 'Use international format, e.g. +923001234567' })
  contactPhone?: string | null;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Use a hex colour such as #B45309' })
  primaryColor?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(10, 500)
  description?: string | null;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { message: 'Use an https:// image address' },
  )
  @MaxLength(2048)
  logoUrl?: string | null;

  @IsOptional()
  @IsTimeZone({ message: 'Choose a valid time zone' })
  timezone?: string;
}

export class SlugAvailabilityQueryDto {
  @Transform(trimLower)
  @IsString()
  @MaxLength(100)
  slug!: string;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class InviteMemberDto {
  @Transform(trimLower)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(320)
  email!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(MembershipRole)
  role?: MembershipRole;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsUUID()
  branchId?: string | null;
}
