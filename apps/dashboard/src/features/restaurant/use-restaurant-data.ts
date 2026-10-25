'use client';

import { skipToken } from '@reduxjs/toolkit/query';
import { useGetOrganizationQuery } from '@/features/organizations/organizations-api';
import { useGetBranchQuery, useGetOnboardingStatusQuery } from './restaurant-api';

export function useRestaurantData(organizationId: string) {
  const organization = useGetOrganizationQuery(organizationId);
  const onboarding = useGetOnboardingStatusQuery(organizationId);
  const branchId = onboarding.data?.primaryBranchId ?? null;
  const branch = useGetBranchQuery(branchId ? { organizationId, branchId } : skipToken);
  const failed = [organization, onboarding, ...(branchId ? [branch] : [])].filter(
    (query) => query.error,
  );

  return {
    organization: organization.data,
    onboarding: onboarding.data,
    branch: branchId ? (branch.data ?? null) : null,
    isLoading:
      organization.isLoading ||
      onboarding.isLoading ||
      (branchId !== null && branch.isLoading && !branch.data),
    error: failed[0]?.error,
    retrying: failed.some((query) => query.isFetching),
    retry: () => {
      for (const query of failed) {
        void query.refetch();
      }
    },
  };
}
