import type { Metadata } from "next";

import { EzgbBrowserReturn } from "@/components/integrations/ezgb-browser-bridge";
import { RezleeLogo } from "@/components/brand/rezlee-logo";

export const metadata: Metadata = {
  title: "Return to Rezlee | Rezlee",
};

export default function EzgbSuccessPage() {
  return (
    <main className="min-h-screen bg-[#F7F4EC] px-5 py-8 text-[#1E352B] sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex justify-center">
          <RezleeLogo />
        </div>
        <div className="overflow-hidden rounded-[30px] border border-[#D9DED5] bg-white shadow-sm">
          <div className="bg-[#244A3A] px-7 py-9 text-white sm:px-10">
            <p className="text-sm font-medium text-[#BDD0C5]">Authorization complete</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Your utility is connecting
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/75">
              Your authorization step is complete. Return to Rezlee to start
              importing the utility records that are available.
            </p>
          </div>
          <div className="space-y-5 p-7 sm:p-10">
            <EzgbBrowserReturn outcome="success" />
            <ol className="space-y-3 rounded-2xl bg-[#F3F1EA] p-5 text-sm leading-6 text-[#657068]">
              <li><span className="font-semibold text-[#1E352B]">1. Authorization received.</span> You’ve finished the utility’s sharing step.</li>
              <li><span className="font-semibold text-[#1E352B]">2. Continue in Rezlee.</span> We’ll check your connection and retrieve the records your utility makes available.</li>
              <li><span className="font-semibold text-[#1E352B]">3. See what arrived.</span> Your bills will appear when they’re ready. Some utilities take a few minutes to prepare data.</li>
            </ol>
            <p className="text-center text-xs leading-5 text-[#7A837C]">
              Rezlee will show which bills were saved after the import finishes.
            </p>
          </div>
        </div>
      </div>

    </main>
  );
}
