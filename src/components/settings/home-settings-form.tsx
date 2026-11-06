"use client";

import { useActionState } from "react";

import { updateHome, type ActionState } from "@/app/actions";
import { ProductCard } from "@/components/product/design-system";
import { SubmitButton } from "@/components/submit-button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentHome } from "@/lib/homes";

const initialState: ActionState = {};

function FieldError({ errors, field }: { errors?: string[]; field: string }) {
  if (!errors?.length) {
    return null;
  }

  return <p id={field + "-error"} role="alert" className="text-sm text-destructive">{errors[0]}</p>;
}

export function HomeSettingsForm({ home }: { home: CurrentHome }) {
  const [state, action] = useActionState(updateHome, initialState);

  return (
    <ProductCard variant="record">
      <CardHeader>
        <CardTitle>Profile details</CardTitle>
        <CardDescription>
          Keep the essentials accurate so your household summary has the right
          context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5">
          {state.message ? (
            <p className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {state.message}
            </p>
          ) : null}

          <div className="rounded-2xl border bg-muted/15 p-4">
            <div className="mb-4">
              <h3 className="font-semibold">Address</h3>
              <p className="text-sm text-muted-foreground">
                The place this dashboard is organizing.
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  defaultValue={home.nickname}
                  aria-invalid={Boolean(state.errors?.nickname?.length)}
                  aria-describedby={state.errors?.nickname?.length ? "nickname-error" : undefined}
                  id="nickname"
                  name="nickname"
                  required
                />
                <FieldError field="nickname" errors={state.errors?.nickname} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="street_address">Street address</Label>
                <Input
                  defaultValue={home.street_address ?? ""}
                  aria-invalid={Boolean(state.errors?.street_address?.length)}
                  aria-describedby={state.errors?.street_address?.length ? "street_address-error" : undefined}
                  id="street_address"
                  name="street_address"
                />
                <FieldError field="street_address" errors={state.errors?.street_address} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    defaultValue={home.city ?? ""}
                    aria-invalid={Boolean(state.errors?.city?.length)}
                    aria-describedby={state.errors?.city?.length ? "city-error" : undefined}
                    id="city"
                    name="city"
                    required
                  />
                  <FieldError field="city" errors={state.errors?.city} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="province">Province</Label>
                  <Input
                    defaultValue={home.province ?? ""}
                    aria-invalid={Boolean(state.errors?.province?.length)}
                    aria-describedby={state.errors?.province?.length ? "province-error" : undefined}
                    id="province"
                    name="province"
                    required
                  />
                  <FieldError field="province" errors={state.errors?.province} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postal_code">Postal code (optional)</Label>
                  <Input
                    defaultValue={home.postal_code ?? ""}
                    aria-invalid={Boolean(state.errors?.postal_code?.length)}
                    aria-describedby={state.errors?.postal_code?.length ? "postal_code-error" : undefined}
                    id="postal_code"
                    name="postal_code"
                  />
                  <FieldError field="postal_code" errors={state.errors?.postal_code} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/15 p-4">
            <div className="mb-4">
              <h3 className="font-semibold">Property details</h3>
              <p className="text-sm text-muted-foreground">
                Basic place context for care reminders and records.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="home_type">Home type (optional)</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  defaultValue={home.home_type ?? ""}
                  aria-invalid={Boolean(state.errors?.home_type?.length)}
                  aria-describedby={state.errors?.home_type?.length ? "home_type-error" : undefined}
                  id="home_type"
                  name="home_type"
                >
                  <option value="">Choose a type</option>
                  <option value="Detached">Detached</option>
                  <option value="Semi-detached">Semi-detached</option>
                  <option value="Townhouse">Townhouse</option>
                  <option value="Condo">Condo</option>
                  <option value="Apartment">Apartment</option>
                  <option value="Other">Other</option>
                </select>
                <FieldError field="home_type" errors={state.errors?.home_type} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="approximate_year_built">
                  Approximate year built
                </Label>
                <Input
                  defaultValue={home.approximate_year_built ?? ""}
                  aria-invalid={Boolean(state.errors?.approximate_year_built?.length)}
                  aria-describedby={state.errors?.approximate_year_built?.length ? "approximate_year_built-error" : undefined}
                  id="approximate_year_built"
                  inputMode="numeric"
                  name="approximate_year_built"
                  type="number"
                />
                <FieldError field="approximate_year_built" errors={state.errors?.approximate_year_built} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/15 p-4">
            <div className="mb-4">
              <h3 className="font-semibold">Ownership</h3>
              <p className="text-sm text-muted-foreground">
                Helps Rezlee understand recurring costs and important dates.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ownership_type">Living situation (optional)</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  defaultValue={home.ownership_type ?? ""}
                  aria-invalid={Boolean(state.errors?.ownership_type?.length)}
                  aria-describedby={state.errors?.ownership_type?.length ? "ownership_type-error" : undefined}
                  id="ownership_type"
                  name="ownership_type"
                >
                  <option value="">Choose ownership</option>
                  <option value="Own">Own</option>
                  <option value="Rent">Rent</option>
                  <option value="Shared home">Shared with roommates</option>
                  <option value="Family home">Family home</option>
                  <option value="Investment property">
                    Investment property
                  </option>
                  <option value="Other">Other</option>
                </select>
                <FieldError field="ownership_type" errors={state.errors?.ownership_type} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="closing_date">Closing date</Label>
                <Input
                  defaultValue={home.closing_date ?? ""}
                  aria-invalid={Boolean(state.errors?.closing_date?.length)}
                  aria-describedby={state.errors?.closing_date?.length ? "closing_date-error" : undefined}
                  id="closing_date"
                  name="closing_date"
                  type="date"
                />
                <FieldError field="closing_date" errors={state.errors?.closing_date} />
              </div>
            </div>
          </div>

          <SubmitButton
            className="h-10 w-full sm:w-fit"
            label="Save home details"
            pendingLabel="Saving..."
          />
        </form>
      </CardContent>
    </ProductCard>
  );
}
