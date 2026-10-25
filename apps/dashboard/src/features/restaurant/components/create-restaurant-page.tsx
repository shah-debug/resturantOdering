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
        <p className="text-sm font-medium text-muted-foreground">Restaurant setup</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Let&apos;s get you ready for orders
        </h1>
        <p className="text-sm text-muted-foreground">
          It takes a few minutes. Each step is saved, so you can finish later.
        </p>
      </header>
      <SetupProgress steps={EMPTY_STEPS} current="restaurant" />
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold tracking-tight">{STEP_META.restaurant.label}</h2>
          <CardDescription>{STEP_META.restaurant.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRestaurantForm />
        </CardContent>
      </Card>
    </div>
  );
}
