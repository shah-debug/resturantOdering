import { MENU_LIMITS, PRODUCT_STATUSES, type ProductStatus } from '@app/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class VariantInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MENU_LIMITS.variantPriceMaxMinor)
  priceMinor!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  sku?: string | null;

  @IsBoolean()
  isAvailable!: boolean;

  @IsBoolean()
  isDefault!: boolean;
}

export class ProductUpsertDto {
  @IsUUID()
  categoryId!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsIn(PRODUCT_STATUSES)
  status!: ProductStatus;

  @IsBoolean()
  isAvailable!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MENU_LIMITS.variantsPerProduct)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  @IsArray()
  @ArrayMaxSize(MENU_LIMITS.addOnGroupsPerProduct)
  @IsUUID('all', { each: true })
  addOnGroupIds!: string[];
}

export class ProductPatchDto {
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class ProductListQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

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

export class AddOnInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MENU_LIMITS.addOnPriceMaxMinor)
  priceMinor!: number;

  @IsBoolean()
  isAvailable!: boolean;
}

export class AddOnGroupUpsertDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MENU_LIMITS.addOnsPerGroup)
  minSelect!: number;

  @IsInt()
  @Min(1)
  @Max(MENU_LIMITS.addOnsPerGroup)
  maxSelect!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MENU_LIMITS.addOnsPerGroup)
  @ValidateNested({ each: true })
  @Type(() => AddOnInputDto)
  addOns!: AddOnInputDto[];
}
