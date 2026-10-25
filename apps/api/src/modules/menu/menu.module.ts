import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { AddOnGroupsService } from './add-on-groups.service.js';
import { CategoriesService } from './categories.service.js';
import { MenuAudit } from './menu-audit.js';
import { MenuController } from './menu.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [MenuController],
  providers: [
    CategoriesService,
    ProductsService,
    AddOnGroupsService,
    MenuAudit,
    OrganizationAccessGuard,
  ],
})
export class MenuModule {}
