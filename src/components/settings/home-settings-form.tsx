"use client";

import { useActionState } from "react";

import { updateHome, type ActionState } from "@/app/actions";
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
import type { CurrentHome } from "@/lib/homes";

const initialState: ActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function HomeSettingsForm({ home }: { home: CurrentHome }) {
  const [state, action] = useActionState(updateHome, initialState);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Home details</CardTitle>
        <CardDescription>
          View and edit the home profile used across Dwellwise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5">
          {state.message ? (
            <p className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              defaultValue={home.nickname}
              id="nickname"
              name="nickname"
              required
            />
            <FieldError errors={state.errors?.nickname} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="street_address">Street address</Label>
            <Input
              defaultValue={home.street_address ?? ""}
              id="street_address"
              name="street_address"
            />
            <FieldError errors={state.errors?.street_address} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input defaultValue={home.city ?? ""} id="city" name="city" required />
              <FieldError errors={state.errors?.city} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="province">Province</Label>
              <Input
                defaultValue={home.province ?? ""}
                id="province"
                name="province"
                required
              />
              <FieldError errors={state.errors?.province} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postal_code">Postal code</Label>
              <Input
                defaultValue={home.postal_code ?? ""}
                id="postal_code"
                name="postal_code"
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
                defaultValue={home.home_type ?? ""}
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
                defaultValue={home.ownership_type ?? ""}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="closing_date">Closing date</Label>
              <Input
                defaultValue={home.closing_date ?? ""}
                id="closing_date"
                name="closing_date"
                type="date"
              />
              <FieldError errors={state.errors?.closing_date} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="approximate_year_built">
                Approximate year built
              </Label>
              <Input
                defaultValue={home.approximate_year_built ?? ""}
                id="approximate_year_built"
                inputMode="numeric"
                name="approximate_year_built"
                type="number"
              />
              <FieldError errors={state.errors?.approximate_year_built} />
            </div>
          </div>

          <SubmitButton
            className="h-10 w-full sm:w-fit"
            label="Save home details"
            pendingLabel="Saving..."
          />
        </form>
      </CardContent>
    </Card>
  );
}
