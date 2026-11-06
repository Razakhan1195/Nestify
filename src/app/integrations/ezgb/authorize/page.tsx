import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { EzgbBrowserStart } from "@/components/integrations/ezgb-browser-bridge";
import { RezleeLogo } from "@/components/brand/rezlee-logo";
import { ezgbCustomerCode, ezgbPublicBaseUrl, validEzgbUserIdentifier } from "@/lib/ezgb/guest";

export const metadata: Metadata = {
  title: "Connect utility | Rezlee",
};

export default async function EzgbAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const params = await searchParams;
  const userIdentifier = params.u?.trim() ?? "";
  const valid = validEzgbUserIdentifier(userIdentifier);
  if (valid) {
    const registeredOrigin = ezgbPublicBaseUrl();
    const requestHost = (await headers()).get("host");
    if (requestHost && requestHost !== new URL(registeredOrigin).host) {
      // HTTP redirects preserve the incoming fragment when Location has none.
      // Move to the vendor-registered callback origin BEFORE storing the marker.
      redirect(registeredOrigin + "/integrations/ezgb/authorize?u=" + encodeURIComponent(userIdentifier));
    }
  }
  const widgetProps = valid
    ? ({
        customerCode: ezgbCustomerCode(),
        userIdentifier,
      } as Record<string, string>)
    : {};

  return (
    <>
      <style>{`
        #cmdButton .container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        #cmdButton .row {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 12px !important;
          justify-content: stretch !important;
          height: auto !important;
          margin: 0 !important;
        }

        #cmdButton .utilitySelector {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          padding: 0 !important;
          cursor: pointer;
        }

        #cmdButton .utilitySelector > form > .border {
          width: 100% !important;
          height: 116px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }

        #cmdButton .utilitySelector center {
          width: 100% !important;
          height: 104px !important;
        }

        #cmdButton .utilitySelector img {
          max-width: 92% !important;
          width: auto !important;
          height: 76px !important;
          object-fit: contain !important;
          padding-top: 6px !important;
        }

        #cmdButton .h4 {
          box-sizing: border-box !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          font-size: 11px !important;
          line-height: 20px !important;
          min-height: 20px !important;
        }

        #cmdButton h4 {
          margin: 14px 0 12px !important;
          font-size: 16px !important;
        }

        @media (max-width: 420px) {
          #cmdButton .row {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          #cmdButton .utilitySelector > form > .border {
            height: 108px !important;
            border-width: 3px !important;
          }

          #cmdButton .utilitySelector center {
            height: 102px !important;
          }

          #cmdButton .utilitySelector img {
            height: 70px !important;
          }
        }
      `}</style>
      <main className="min-h-screen bg-[#F7F4EC] px-5 py-8 text-[#1E352B] sm:py-12">
      <div className="mx-auto max-w-xl">
        <EzgbBrowserStart />
        <div className="mb-8 flex justify-center">
          <RezleeLogo />
        </div>

        <div className="overflow-hidden rounded-[30px] border border-[#D9DED5] bg-white shadow-sm">
          <div className="bg-[#244A3A] px-7 py-9 text-white sm:px-10">
            <p className="text-sm font-medium text-[#BDD0C5]">Utility connection</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Connect your utility securely
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/75">
              Authorize your utility to share the data you choose. Rezlee uses it
              to keep your bills and home energy information together.
            </p>
          </div>

          <div className="space-y-6 p-7 sm:p-10">
            {!valid ? (
              <div className="rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-700">
                This connection link is invalid. Return to Rezlee and start the
                utility connection again.
              </div>
            ) : (
              <>
                <div role="note" className="rounded-2xl border border-[#D9DED5] bg-[#F3F1EA] p-4 text-sm leading-6 text-[#364C40]">
                  <p className="font-semibold">After you approve, keep the utility page open.</p>
                  <p className="mt-1">Confirmation can take a few minutes, even when the page looks unchanged. Wait for the return to Rezlee. Once your account is confirmed, you can keep using the app while bills arrive.</p>
                  <p className="mt-2 text-xs">Closed it already? In Rezlee, choose your utility and use “Already approved sharing? Check connection” before connecting again.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#F3F1EA] p-4">
                    <div className="text-sm font-semibold">Authorize</div>
                    <div className="mt-1 text-xs leading-5 text-[#657068]">
                      Choose your utility and approve data sharing.
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#F3F1EA] p-4">
                    <div className="text-sm font-semibold">Retrieve</div>
                    <div className="mt-1 text-xs leading-5 text-[#657068]">
                      EZGB securely retrieves Green Button data.
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#F3F1EA] p-4">
                    <div className="text-sm font-semibold">Organize</div>
                    <div className="mt-1 text-xs leading-5 text-[#657068]">
                      Rezlee turns it into useful household records.
                    </div>
                  </div>
                </div>

                <div
                  className="min-h-14 rounded-2xl border border-[#D9DED5] bg-[#FBFAF6] p-4"
                  id="cmdButton"
                  {...widgetProps}
                />

                <p className="text-center text-xs leading-5 text-[#7A837C]">
                  If your utility asks for an access end date, choose how long
                  you want to share data. New data stops when that authorization
                  ends. You remain in control of the connection.
                </p>

                <Script
                  src="https://button.screamingpower.ca/guest/cmdButton.js"
                  strategy="afterInteractive"
                />

              </>
            )}
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
