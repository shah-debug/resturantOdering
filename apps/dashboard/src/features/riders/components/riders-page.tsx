'use client';

import {
  normalizePhoneNumber,
  type Rider,
  riderUpsertRequestSchema,
  VEHICLE_TYPES,
} from '@app/contracts';
import { getErrorMessage, getFieldErrors } from '@app/web/api';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Skeleton,
} from '@app/web/ui';
import { Bike, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useMeQuery } from '@/features/auth';
import { canManageRestaurant } from '@/features/organizations/roles';
import { useListBranchesQuery } from '@/features/restaurant/restaurant-api';
import {
  useCreateRiderMutation,
  useListRidersQuery,
  usePatchRiderMutation,
  useUpdateRiderMutation,
} from '../riders-api';

const VEHICLE_LABELS: Record<(typeof VEHICLE_TYPES)[number], string> = {
  MOTORCYCLE: 'Motorcycle',
  BICYCLE: 'Bicycle',
  CAR: 'Car',
  ON_FOOT: 'On foot',
};

const AVAILABILITY_LABELS: Record<Rider['availability'], string> = {
  AVAILABLE: 'Available',
  OFFLINE: 'Off duty',
  ON_DELIVERY: 'On delivery',
};

interface RiderFormState {
  branchId: string;
  fullName: string;
  phone: string;
  vehicleType: (typeof VEHICLE_TYPES)[number];
  vehicleNumber: string;
}

type FormErrors = Partial<Record<keyof RiderFormState, string>>;

function RiderFormDialog({
  organizationId,
  rider,
  open,
  onOpenChange,
}: {
  organizationId: string;
  rider: Rider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const branches = useListBranchesQuery(organizationId);
  const [form, setForm] = useState<RiderFormState>(() => ({
    branchId: rider?.branchId ?? '',
    fullName: rider?.fullName ?? '',
    phone: rider?.phone ?? '',
    vehicleType: rider?.vehicleType ?? 'MOTORCYCLE',
    vehicleNumber: rider?.vehicleNumber ?? '',
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [create, createState] = useCreateRiderMutation();
  const [update, updateState] = useUpdateRiderMutation();
  const saving = createState.isLoading || updateState.isLoading;
  const serverError = rider ? updateState.error : createState.error;
  const branchId = form.branchId || branches.data?.[0]?.id || '';

  function set<K extends keyof RiderFormState>(key: K, value: RiderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      ...form,
      branchId,
      phone: normalizePhoneNumber(form.phone) ?? form.phone.trim(),
    };
    const parsed = riderUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof RiderFormState;
        next[field] ??=
          field === 'phone'
            ? 'Enter a valid mobile number, e.g. 0300 1234567'
            : field === 'fullName'
              ? 'Enter the rider’s name'
              : field === 'branchId'
                ? 'Choose a branch'
                : issue.message;
      }
      setErrors(next);
      return;
    }
    try {
      if (rider) {
        await update({ organizationId, riderId: rider.id, body }).unwrap();
      } else {
        await create({ organizationId, body }).unwrap();
      }
      onOpenChange(false);
    } catch (caught) {
      const fields = getFieldErrors(caught as Parameters<typeof getFieldErrors>[0]);
      setErrors(fields);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{rider ? 'Edit rider' : 'Add rider'}</DialogTitle>
            <DialogDescription>Riders deliver orders for one branch.</DialogDescription>
          </DialogHeader>
          <Field label="Full name" error={errors.fullName}>
            {(control) => (
              <Input
                {...control}
                value={form.fullName}
                maxLength={120}
                onChange={(event) => set('fullName', event.target.value)}
              />
            )}
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            {(control) => (
              <Input
                {...control}
                type="tel"
                inputMode="tel"
                placeholder="0300 1234567"
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
              />
            )}
          </Field>
          <Field label="Branch" error={errors.branchId}>
            {(control) => (
              <Select
                {...control}
                value={branchId}
                onChange={(event) => set('branchId', event.target.value)}
              >
                {(branches.data ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vehicle" error={errors.vehicleType}>
              {(control) => (
                <Select
                  {...control}
                  value={form.vehicleType}
                  onChange={(event) =>
                    set('vehicleType', event.target.value as RiderFormState['vehicleType'])
                  }
                >
                  {VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {VEHICLE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Number plate (optional)" error={errors.vehicleNumber}>
              {(control) => (
                <Input
                  {...control}
                  value={form.vehicleNumber}
                  maxLength={20}
                  onChange={(event) => set('vehicleNumber', event.target.value)}
                />
              )}
            </Field>
          </div>
          {serverError && Object.keys(errors).length === 0 ? (
            <Alert variant="destructive">{getErrorMessage(serverError)}</Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !branchId}>
              {saving ? 'Saving…' : rider ? 'Save rider' : 'Add rider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RiderRow({
  organizationId,
  rider,
  canManage,
  onEdit,
}: {
  organizationId: string;
  rider: Rider;
  canManage: boolean;
  onEdit: (rider: Rider) => void;
}) {
  const [patch, state] = usePatchRiderMutation();
  const [error, setError] = useState<string | null>(null);
  const active = rider.status === 'ACTIVE';

  async function change(body: Parameters<typeof patch>[0]['body']) {
    setError(null);
    try {
      await patch({ organizationId, riderId: rider.id, body }).unwrap();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{rider.fullName}</span>
          <Badge
            variant={
              active ? (rider.availability === 'AVAILABLE' ? 'success' : 'secondary') : 'outline'
            }
          >
            {active ? AVAILABILITY_LABELS[rider.availability] : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {rider.phone} · {VEHICLE_LABELS[rider.vehicleType]}
          {rider.vehicleNumber ? ` ${rider.vehicleNumber}` : ''} ·{' '}
          {rider.branchName ?? 'All branches'}
        </p>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {active && rider.availability !== 'ON_DELIVERY' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={state.isLoading}
              onClick={() =>
                void change({
                  availability: rider.availability === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE',
                })
              }
            >
              {rider.availability === 'AVAILABLE' ? 'Mark off duty' : 'Mark available'}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(rider)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={state.isLoading}
            onClick={() => void change({ status: active ? 'INACTIVE' : 'ACTIVE' })}
          >
            {active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function RidersPage({ organizationId }: { organizationId: string }) {
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  const canManage = canManageRestaurant(role);
  const riders = useListRidersQuery({ organizationId });
  const [editing, setEditing] = useState<Rider | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  if (isUnavailableError(riders.error)) {
    return <UnavailableState error={riders.error} />;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Riders</h1>
          <p className="text-sm text-muted-foreground">
            Your own delivery riders. Assign them to orders from the order page.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add rider
          </Button>
        ) : null}
      </div>
      {riders.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : riders.error && !riders.data ? (
        <ErrorState
          error={riders.error}
          onRetry={() => void riders.refetch()}
          retrying={riders.isFetching}
        />
      ) : riders.data?.length === 0 ? (
        <EmptyState
          icon={Bike}
          title="No riders yet"
          description="Add riders to assign delivery orders to them."
        />
      ) : (
        <ul className="grid gap-3">
          {riders.data?.map((rider) => (
            <RiderRow
              key={rider.id}
              organizationId={organizationId}
              rider={rider}
              canManage={canManage}
              onEdit={(selected) => {
                setEditing(selected);
                setFormOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      {formOpen ? (
        <RiderFormDialog
          key={editing?.id ?? 'new'}
          organizationId={organizationId}
          rider={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      ) : null}
    </div>
  );
}
