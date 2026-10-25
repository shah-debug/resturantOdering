import { z } from 'zod';

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +923001234567');

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().refine(isValidTimeZone, 'Choose a valid time zone');
