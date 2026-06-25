"use client";

import { deleteProvider } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteProviderButton({
  providerId,
  returnPath,
}: {
  providerId: string;
  returnPath: string;
}) {
  return (
    <form
      action={deleteProvider}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this provider from Nestify? Historical bills and records will stay, but this provider connection will be removed."
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="provider_id" type="hidden" value={providerId} />
      <input name="return_path" type="hidden" value={returnPath} />
      <Button className="w-full sm:w-auto" type="submit" variant="outline">
        Delete provider
      </Button>
    </form>
  );
}
