import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, OrganizationAccessGuard],
})
export class OnboardingModule {}
