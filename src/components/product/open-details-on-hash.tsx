"use client";

import { useEffect } from "react";

type OpenDetailsOnHashProps = {
  ids: string[];
};

export function OpenDetailsOnHash({ ids }: OpenDetailsOnHashProps) {
  useEffect(() => {
    function openMatchingDetails() {
      const hash = window.location.hash.replace("#", "");
      if (!hash || !ids.includes(hash)) return;

      const element = document.getElementById(hash);
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    openMatchingDetails();
    window.addEventListener("hashchange", openMatchingDetails);

    return () => window.removeEventListener("hashchange", openMatchingDetails);
  }, [ids]);

  return null;
}
