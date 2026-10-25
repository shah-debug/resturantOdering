import type { MailMessage } from './mailer.js';

function link(baseUrl: string, path: string, token: string): string {
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

export function verificationEmail(to: string, baseUrl: string, token: string): MailMessage {
  return {
    to,
    subject: 'Verify your email address',
    text: [
      'Confirm your email address to finish setting up your account:',
      link(baseUrl, '/verify-email', token),
      '',
      'This link expires in 24 hours. If you did not sign up, you can ignore this email.',
    ].join('\n'),
  };
}

export function accountExistsEmail(to: string, baseUrl: string): MailMessage {
  return {
    to,
    subject: 'Sign-up attempt for your account',
    text: [
      'Someone tried to create an account with this email address, but you already have one.',
      `Sign in at ${baseUrl}/login, or reset your password at ${baseUrl}/forgot-password.`,
      '',
      'If this was not you, no action is needed.',
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, baseUrl: string, token: string): MailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: [
      'Use this link to choose a new password:',
      link(baseUrl, '/reset-password', token),
      '',
      'This link expires in 1 hour and signs you out everywhere once used.',
      'If you did not ask for a reset, you can ignore this email.',
    ].join('\n'),
  };
}

export function invitationEmail(
  to: string,
  baseUrl: string,
  token: string,
  organizationName: string,
  inviterName: string,
): MailMessage {
  return {
    to,
    subject: `You have been invited to ${organizationName}`,
    text: [
      `${inviterName} invited you to join ${organizationName}.`,
      'Accept the invitation here:',
      link(baseUrl, '/accept-invitation', token),
      '',
      'This invitation expires in 7 days.',
    ].join('\n'),
  };
}
