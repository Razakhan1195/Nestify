"use client";

import { useActionState } from "react";

import { createHome, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
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

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
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
        <CardTitle className="text-2xl">Tell us what home this is</CardTitle>
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
              id="nickname"
              name="nickname"
              placeholder="Main home"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use whatever you call it day to day, like Main home or Condo.
            </p>
            <FieldError errors={state.errors?.nickname} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="street_address">Street address</Label>
            <Input
              autoComplete="street-address"
              defaultValue={defaults.street_address}
              id="street_address"
              name="street_address"
              placeholder="123 King St W"
            />
            <p className="text-xs text-muted-foreground">
              This helps organize records by property. You can leave unit or
              extra address details for later.
            </p>
            <FieldError errors={state.errors?.street_address} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                autoComplete="address-level2"
                defaultValue={defaults.city}
                id="city"
                name="city"
                required
              />
              <FieldError errors={state.errors?.city} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="province">Province</Label>
              <Input
                autoComplete="address-level1"
                defaultValue={defaults.province}
                id="province"
                name="province"
                placeholder="ON"
                required
              />
              <FieldError errors={state.errors?.province} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postal_code">Postal code</Label>
              <Input
                autoComplete="postal-code"
                defaultValue={defaults.postal_code}
                id="postal_code"
                name="postal_code"
                placeholder="M5V 1A1"
                required
              />
              <FieldError errors={state.errors?.postal_code} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="home_type">Home type</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue={defaults.home_type ?? ""}
                id="home_type"
                name="home_type"
                required
              >
                <option value="">Choose a type</option>
                <option value="Detached">Detached</option>
                <option value="Semi-detached">Semi-detached</option>
                <option value="Townhouse">Townhouse</option>
                <option value="Condo">Condo</option>
                <option value="Apartment">Apartment</option>
                <option value="Other">Other</option>
              </select>
              <FieldError errors={state.errors?.home_type} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownership_type">Ownership type</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                defaultValue={defaults.ownership_type ?? ""}
                id="ownership_type"
                name="ownership_type"
                required
              >
                <option value="">Choose ownership</option>
                <option value="Own">Own</option>
                <option value="Rent">Rent</option>
                <option value="Family home">Family home</option>
                <option value="Investment property">Investment property</option>
                <option value="Other">Other</option>
              </select>
              <FieldError errors={state.errors?.ownership_type} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="closing_date">Closing date</Label>
            <Input id="closing_date" name="closing_date" type="date" />
            <p className="text-xs text-muted-foreground">
              Optional. Useful later for insurance, taxes, warranties, and home
              history.
            </p>
            <FieldError errors={state.errors?.closing_date} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="approximate_year_built">Approximate year built</Label>
            <Input
              id="approximate_year_built"
              inputMode="numeric"
              name="approximate_year_built"
              placeholder="1998"
              type="number"
            />
            <p className="text-xs text-muted-foreground">
              Optional. This can power maintenance recommendations later.
            </p>
            <FieldError errors={state.errors?.approximate_year_built} />
          </div>

          <SubmitButton
            className="h-10 w-full sm:w-fit"
            label="Create home profile"
            pendingLabel="Creating home..."
          />
        </form>
      </CardContent>
    </Card>
  );
}
