-- AlterEnum (kept in its own migration: a new enum value cannot be used in the same transaction)
ALTER TYPE "subscription_status" ADD VALUE 'SUSPENDED' BEFORE 'CANCELED';
