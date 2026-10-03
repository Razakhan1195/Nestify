// Customer web access is temporarily paused. Admin and native API access are
// independent; re-enabling the legacy web app requires an explicit server flag.
export function customerWebAccessEnabled() {
  return process.env.REZLEE_CUSTOMER_WEB_ENABLED === "true";
}

const customerRoutes = [
  "/app", "/signup", "/dashboard", "/bills", "/documents", "/appliances",
  "/assistant", "/maintenance", "/repairs", "/settings", "/warranties",
];

export function isCustomerWebRoute(pathname: string) {
  return customerRoutes.some(path => pathname === path || pathname.startsWith(`${path}/`));
}
