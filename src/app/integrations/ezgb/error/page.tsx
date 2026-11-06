import type { Metadata } from "next";

import { EzgbBrowserReturn } from "@/components/integrations/ezgb-browser-bridge";
import { RezleeLogo } from "@/components/brand/rezlee-logo";

export const metadata: Metadata = {
  title: "Utility connection issue | Rezlee",
};

export default function EzgbErrorPage() {
  return (
    <main className="min-h-screen bg-[#F7F4EC] px-5 py-8 text-[#1E352B] sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex justify-center">
          <RezleeLogo />
        </div>
        <div className="rounded-[30px] border border-[#D9DED5] bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">
            !
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Connection wasn’t completed</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#657068]">
            The utility authorization did not finish. Return to Rezlee to try
            again. Your previously saved bills remain available.
          </p>
          <div className="mt-6"><EzgbBrowserReturn outcome="error" /></div>
        </div>
      </div>

    </main>
  );
}
