"use client";

import { useActionState } from "react";

import { createHome, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { homeTypeOptions, ownershipTypeOptions } from "@/lib/onboarding/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export type HomeOnboardingDefaults = {
  city?: string;
  home_type?: string;
  nickname?: string;
  ownership_type?: string;
  postal_code?: string;
  province?: string;
  street_address?: string;
};

function FieldError({ errors, field }: { errors?: string[]; field: string }) {
  if (!errors?.length) {
    return null;
  }

  return <p id={field + "-error"} role="alert" className="text-sm text-destructive">{errors[0]}</p>;
}

export function HomeOnboardingForm({
  defaults = {},
}: {
  defaults?: HomeOnboardingDefaults;
}) {
  const [state, action] = useActionState(createHome, initialState);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Give your place a name</CardTitle>
        <CardDescription>
          Keep this light. The goal is to create a useful home hub in a few
          minutes, not fill out every detail perfectly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5">
          {state.message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              defaultValue={defaults.nickname}
              aria-invalid={Boolean(state.errors?.nickname?.length)}
              aria-describedby={state.errors?.nickname?.length ? "nickname-error" : undefined}
              id="nickname"
              name="nickname"
              placeholder="Main home"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use whatever you call it day to day, like Main home or Condo.
            </p>
            <FieldError field="nickname" errors={state.errors?.nickname} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="street_address">Street address (optional)</Label>
            <Input
              autoComplete="street-address"
              defaultValue={defaults.street_address}
              aria-invalid={Boolean(state.errors?.street_address?.length)}
              aria-describedby={state.errors?.street_address?.length ? "street_address-error" : undefined}
              id="street_address"
              name="street_address"
              placeholder="123 King St W"
            />
            <p className="text-xs text-muted-foreground">
              This helps organize records by property. You can leave unit or
              extra address details for later.
            </p>
            <FieldError field="street_address" errors={state.errors?.street_address} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                autoComplete="address-level2"
                defaultValue={defaults.city}
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
                autoComplete="address-level1"
                defaultValue={defaults.province}
                aria-invalid={Boolean(state.errors?.province?.length)}
                aria-describedby={state.errors?.province?.length ? "province-error" : undefined}
                id="province"
                name="province"
                placeholder="ON"
                required
              />
              <FieldError field="province" errors={state.errors?.province} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postal_code">Postal code (optional)</Label>
              <Input
                autoComplete="postal-code"
                defaultValue={defaults.postal_code}
                aria-invalid={Boolean(state.errors?.postal_code?.length)}
                aria-describedby={state.errors?.postal_code?.length ? "postal_code-error" : undefined}
                id="postal_code"
                name="postal_code"
                placeholder="M5V 1A1"
              />
              <FieldError field="postal_code" errors={state.errors?.postal_code} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="home_type">Home type (optional)</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue={defaults.home_type ?? ""}
                aria-invalid={Boolean(state.errors?.home_type?.length)}
                aria-describedby={state.errors?.home_type?.length ? "home_type-error" : undefined}
                id="home_type"
                name="home_type"
              >
                <option value="">Choose a type</option>
                {homeTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <FieldError field="home_type" errors={state.errors?.home_type} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownership_type">Living situation (optional)</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue={defaults.ownership_type ?? ""}
                aria-invalid={Boolean(state.errors?.ownership_type?.length)}
                aria-describedby={state.errors?.ownership_type?.length ? "ownership_type-error" : undefined}
                id="ownership_type"
                name="ownership_type"
              >
                <option value="">Choose what fits</option>
                {ownershipTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "Shared home" ? "Shared with roommates" : option}
                  </option>
                ))}
              </select>
              <FieldError field="ownership_type" errors={state.errors?.ownership_type} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="closing_date">
              Move-in or closing date (optional)
            </Label>
            <Input aria-invalid={Boolean(state.errors?.closing_date?.length)} aria-describedby={state.errors?.closing_date?.length ? "closing_date-error" : undefined} id="closing_date" name="closing_date" type="date" />
            <p className="text-xs text-muted-foreground">
              Optional. Useful later for insurance, taxes, warranties, and home
              history.
            </p>
            <FieldError field="closing_date" errors={state.errors?.closing_date} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="approximate_year_built">
              Approximate year built
            </Label>
            <Input
              aria-invalid={Boolean(state.errors?.approximate_year_built?.length)}
              aria-describedby={state.errors?.approximate_year_built?.length ? "approximate_year_built-error" : undefined}
              id="approximate_year_built"
              inputMode="numeric"
              name="approximate_year_built"
              placeholder="1998"
              type="number"
            />
            <p className="text-xs text-muted-foreground">
              Optional. This can power maintenance recommendations later.
            </p>
            <FieldError field="approximate_year_built" errors={state.errors?.approximate_year_built} />
          </div>

          <SubmitButton
            className="h-10 w-full sm:w-fit"
            label="Create place profile"
            pendingLabel="Saving your place..."
          />
        </form>
      </CardContent>
    </Card>
  );
}
