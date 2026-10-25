import {
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type EmailRequest,
  type LoginRequest,
  type MeResponse,
  meResponseSchema,
  type MessageResponse,
  messageResponseSchema,
  type ResetPasswordRequest,
  type SignupRequest,
  type VerifyEmailRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

const parseMessage = (response: unknown): MessageResponse => messageResponseSchema.parse(response);
const parseMe = (response: unknown): MeResponse => meResponseSchema.parse(response);

export const authApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    me: build.query<MeResponse, void>({
      query: () => '/auth/me',
      transformResponse: parseMe,
      providesTags: ['Me'],
    }),
    login: build.mutation<MeResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformResponse: parseMe,
      invalidatesTags: (result) => (result ? ['Me'] : []),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: (_result, error) => (error ? [] : ['Me']),
    }),
    logoutAll: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout-all', method: 'POST' }),
      invalidatesTags: (_result, error) => (error ? [] : ['Me']),
    }),
    signup: build.mutation<MessageResponse, SignupRequest>({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
      transformResponse: parseMessage,
    }),
    verifyEmail: build.mutation<MessageResponse, VerifyEmailRequest>({
      query: (body) => ({ url: '/auth/email/verify', method: 'POST', body }),
      transformResponse: parseMessage,
      invalidatesTags: (result) => (result ? ['Me'] : []),
    }),
    resendVerification: build.mutation<MessageResponse, EmailRequest>({
      query: (body) => ({ url: '/auth/email/resend', method: 'POST', body }),
      transformResponse: parseMessage,
    }),
    forgotPassword: build.mutation<MessageResponse, EmailRequest>({
      query: (body) => ({ url: '/auth/password/forgot', method: 'POST', body }),
      transformResponse: parseMessage,
    }),
    resetPassword: build.mutation<MessageResponse, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/password/reset', method: 'POST', body }),
      transformResponse: parseMessage,
    }),
    changePassword: build.mutation<MessageResponse, ChangePasswordRequest>({
      query: (body) => ({ url: '/auth/password/change', method: 'POST', body }),
      transformResponse: parseMessage,
    }),
    acceptInvitation: build.mutation<MessageResponse, AcceptInvitationRequest>({
      query: (body) => ({ url: '/auth/invitations/accept', method: 'POST', body }),
      transformResponse: parseMessage,
      invalidatesTags: (result) => (result ? ['Me', { type: 'Organization', id: 'LIST' }] : []),
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useSignupMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useAcceptInvitationMutation,
} = authApi;
