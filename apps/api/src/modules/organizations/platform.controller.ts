import { Controller, Get, Query } from '@nestjs/common';
import type { Organization, Paginated } from '@app/contracts';
import { PlatformRole } from '../../generated/prisma/enums.js';
import { PlatformRoute } from '../access/platform-role.guard.js';
import { PaginationQueryDto } from './dto/organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('platform/organizations')
@PlatformRoute(PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT)
export class PlatformOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<Paginated<Organization>> {
    return this.organizations.listAll(query.page, query.pageSize);
  }
}
