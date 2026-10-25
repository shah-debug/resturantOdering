import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AddOnGroup,
  type Category,
  MENU_LIMITS,
  type Paginated,
  type ProductDetail,
  type ProductSummary,
} from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { AddOnGroupsService } from './add-on-groups.service.js';
import { CategoriesService } from './categories.service.js';
import {
  AddOnGroupUpsertDto,
  CreateCategoryDto,
  ProductListQueryDto,
  ProductPatchDto,
  ProductUpsertDto,
  ReorderDto,
  UpdateCategoryDto,
} from './dto/menu.dto.js';
import type { MenuActor } from './menu-audit.js';
import { ProductsService, type UploadedImage } from './products.service.js';

const uuid = new ParseUUIDPipe();

function actorOf(auth: AuthContext, access: OrganizationAccess, request: Request): MenuActor {
  return { auth, organizationId: access.organizationId, meta: requestMeta(request) };
}

@Controller('organizations/:organizationId/menu')
export class MenuController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
    private readonly addOnGroups: AddOnGroupsService,
  ) {}

  @Get('categories')
  @OrganizationRoute(Permission.MenuRead)
  listCategories(@CurrentOrganization() access: OrganizationAccess): Promise<Category[]> {
    return this.categories.list(access.organizationId);
  }

  @Post('categories')
  @OrganizationRoute(Permission.MenuManage)
  createCategory(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: CreateCategoryDto,
    @Req() request: Request,
  ): Promise<Category> {
    return this.categories.create(actorOf(auth, access, request), dto);
  }

  @Put('categories/order')
  @OrganizationRoute(Permission.MenuManage)
  reorderCategories(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: ReorderDto,
    @Req() request: Request,
  ): Promise<Category[]> {
    return this.categories.reorder(actorOf(auth, access, request), dto.ids);
  }

  @Patch('categories/:categoryId')
  @OrganizationRoute(Permission.MenuManage)
  updateCategory(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('categoryId', uuid) categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: Request,
  ): Promise<Category> {
    return this.categories.update(actorOf(auth, access, request), categoryId, dto);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OrganizationRoute(Permission.MenuManage)
  archiveCategory(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('categoryId', uuid) categoryId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.categories.archive(actorOf(auth, access, request), categoryId);
  }

  @Put('categories/:categoryId/products/order')
  @OrganizationRoute(Permission.MenuManage)
  async reorderProducts(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('categoryId', uuid) categoryId: string,
    @Body() dto: ReorderDto,
    @Req() request: Request,
  ): Promise<ProductSummary[]> {
    await this.categories.assertCategory(access.organizationId, categoryId);
    return this.products.reorder(actorOf(auth, access, request), categoryId, dto.ids);
  }

  @Get('products')
  @OrganizationRoute(Permission.MenuRead)
  listProducts(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: ProductListQueryDto,
  ): Promise<Paginated<ProductSummary>> {
    return this.products.list(access.organizationId, query);
  }

  @Post('products')
  @OrganizationRoute(Permission.MenuManage)
  createProduct(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: ProductUpsertDto,
    @Req() request: Request,
  ): Promise<ProductDetail> {
    return this.products.create(actorOf(auth, access, request), dto);
  }

  @Get('products/:productId')
  @OrganizationRoute(Permission.MenuRead)
  getProduct(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
  ): Promise<ProductDetail> {
    return this.products.get(access.organizationId, productId);
  }

  @Put('products/:productId')
  @OrganizationRoute(Permission.MenuManage)
  replaceProduct(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
    @Body() dto: ProductUpsertDto,
    @Req() request: Request,
  ): Promise<ProductDetail> {
    return this.products.replace(actorOf(auth, access, request), productId, dto);
  }

  @Patch('products/:productId')
  @OrganizationRoute(Permission.MenuManage)
  patchProduct(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
    @Body() dto: ProductPatchDto,
    @Req() request: Request,
  ): Promise<ProductDetail> {
    return this.products.patch(actorOf(auth, access, request), productId, dto);
  }

  @Delete('products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OrganizationRoute(Permission.MenuManage)
  archiveProduct(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.products.archive(actorOf(auth, access, request), productId);
  }

  @Post('products/:productId/image')
  @OrganizationRoute(Permission.MenuManage)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MENU_LIMITS.imageMaxBytes, files: 1, fields: 0, parts: 2 },
    }),
  )
  uploadProductImage(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
    @UploadedFile() file: UploadedImage | undefined,
    @Req() request: Request,
  ): Promise<ProductDetail> {
    return this.products.setImage(actorOf(auth, access, request), productId, file);
  }

  @Delete('products/:productId/image')
  @OrganizationRoute(Permission.MenuManage)
  removeProductImage(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('productId', uuid) productId: string,
    @Req() request: Request,
  ): Promise<ProductDetail> {
    return this.products.removeImage(actorOf(auth, access, request), productId);
  }

  @Get('add-on-groups')
  @OrganizationRoute(Permission.MenuRead)
  listAddOnGroups(@CurrentOrganization() access: OrganizationAccess): Promise<AddOnGroup[]> {
    return this.addOnGroups.list(access.organizationId);
  }

  @Post('add-on-groups')
  @OrganizationRoute(Permission.MenuManage)
  createAddOnGroup(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: AddOnGroupUpsertDto,
    @Req() request: Request,
  ): Promise<AddOnGroup> {
    return this.addOnGroups.create(actorOf(auth, access, request), dto);
  }

  @Get('add-on-groups/:groupId')
  @OrganizationRoute(Permission.MenuRead)
  getAddOnGroup(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('groupId', uuid) groupId: string,
  ): Promise<AddOnGroup> {
    return this.addOnGroups.get(access.organizationId, groupId);
  }

  @Put('add-on-groups/:groupId')
  @OrganizationRoute(Permission.MenuManage)
  replaceAddOnGroup(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('groupId', uuid) groupId: string,
    @Body() dto: AddOnGroupUpsertDto,
    @Req() request: Request,
  ): Promise<AddOnGroup> {
    return this.addOnGroups.replace(actorOf(auth, access, request), groupId, dto);
  }

  @Delete('add-on-groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OrganizationRoute(Permission.MenuManage)
  archiveAddOnGroup(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('groupId', uuid) groupId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.addOnGroups.archive(actorOf(auth, access, request), groupId);
  }
}
