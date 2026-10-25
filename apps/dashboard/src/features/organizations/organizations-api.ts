import { z } from 'zod';
import {
  type CreateOrganizationRequest,
  type InviteMemberRequest,
  type Member,
  memberSchema,
  type Organization,
  organizationSchema,
  type Paginated,
  paginatedSchema,
  type UpdateMemberRequest,
  type UpdateOrganizationRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

const organizationListSchema = z.array(organizationSchema);
const memberPageSchema = paginatedSchema(memberSchema);

export interface MembersQuery {
  organizationId: string;
  page: number;
  pageSize: number;
}

interface MemberTarget {
  organizationId: string;
  membershipId: string;
}

function memberPath({ organizationId, membershipId }: MemberTarget): string {
  const organization = encodeURIComponent(organizationId);
  return `/organizations/${organization}/members/${encodeURIComponent(membershipId)}`;
}

export const organizationsApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listOrganizations: build.query<Organization[], void>({
      query: () => '/organizations',
      transformResponse: (response: unknown) => organizationListSchema.parse(response),
      providesTags: (result) => [
        { type: 'Organization', id: 'LIST' },
        ...(result ?? []).map(({ id }) => ({ type: 'Organization' as const, id })),
      ],
    }),
    getOrganization: build.query<Organization, string>({
      query: (organizationId) => `/organizations/${encodeURIComponent(organizationId)}`,
      transformResponse: (response: unknown) => organizationSchema.parse(response),
      providesTags: (_result, _error, organizationId) => [
        { type: 'Organization', id: organizationId },
      ],
    }),
    createOrganization: build.mutation<Organization, CreateOrganizationRequest>({
      query: (body) => ({ url: '/organizations', method: 'POST', body }),
      transformResponse: (response: unknown) => organizationSchema.parse(response),
      invalidatesTags: (result) => (result ? [{ type: 'Organization', id: 'LIST' }, 'Me'] : []),
    }),
    updateOrganization: build.mutation<
      Organization,
      { organizationId: string; body: UpdateOrganizationRequest }
    >({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${encodeURIComponent(organizationId)}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: unknown) => organizationSchema.parse(response),
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? [{ type: 'Organization', id: organizationId }, 'Me'] : [],
    }),
    listMembers: build.query<Paginated<Member>, MembersQuery>({
      query: ({ organizationId, page, pageSize }) => ({
        url: `/organizations/${encodeURIComponent(organizationId)}/members`,
        params: { page, pageSize },
      }),
      transformResponse: (response: unknown) => memberPageSchema.parse(response),
      providesTags: (_result, _error, { organizationId }) => [
        { type: 'Member', id: organizationId },
      ],
    }),
    inviteMember: build.mutation<Member, { organizationId: string; body: InviteMemberRequest }>({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${encodeURIComponent(organizationId)}/members`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => memberSchema.parse(response),
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? [{ type: 'Member', id: organizationId }] : [],
    }),
    updateMember: build.mutation<Member, MemberTarget & { body: UpdateMemberRequest }>({
      query: ({ body, ...target }) => ({
        url: memberPath(target),
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: unknown) => memberSchema.parse(response),
      invalidatesTags: (_result, _error, { organizationId }) => [
        { type: 'Member', id: organizationId },
      ],
    }),
    removeMember: build.mutation<void, MemberTarget>({
      query: (target) => ({
        url: memberPath(target),
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { organizationId }) => [
        { type: 'Member', id: organizationId },
      ],
    }),
  }),
});

export const {
  useListOrganizationsQuery,
  useGetOrganizationQuery,
  useCreateOrganizationMutation,
  useUpdateOrganizationMutation,
  useListMembersQuery,
  useInviteMemberMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
} = organizationsApi;
