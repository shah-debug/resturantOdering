'use client';

import { ONBOARDING_STEPS } from '@app/contracts';
import { Card, CardContent, CardDescription, CardHeader } from '@app/web/ui';
import { STEP_META } from '../steps';
import { CreateRestaurantForm } from './create-restaurant-form';
import { SetupProgress } from './setup-progress';

const EMPTY_STEPS = ONBOARDING_STEPS.map((id) => ({ id, complete: false }));

export function CreateRestaurantPage() {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          Restaurant setup
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Let&apos;s get you ready for orders
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          It takes a few minutes. Each step is saved, so you can finish later.
        </p>
      </header>
      <SetupProgress steps={EMPTY_STEPS} current="restaurant" />
      <Card className="animate-fade-in-up overflow-hidden">
        <CardHeader className="border-b bg-muted/40">
          <h2 className="text-xl font-semibold tracking-tight">{STEP_META.restaurant.label}</h2>
          <CardDescription>{STEP_META.restaurant.description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 sm:pt-6">
          <CreateRestaurantForm />
        </CardContent>
      </Card>
    </div>
  );
}
