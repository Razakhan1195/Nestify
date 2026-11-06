export function utilityUsageAvailability(status: number | undefined, details: unknown) {
 const code = details && typeof details === "object" && "code" in details ? String(details.code) : null;
 if (code === "unsupported_utility") return { title: "Statement usage", message: "Use the consumption recorded on your bills to compare this account over time.", retryable: false };
 if (code === "missing_readings" || code === "incomplete_readings" || code === "unsupported_readings" || status === 422) return {
  title: "Detailed usage needs meter readings",
  message: "Your bill history is available. Complete, validated meter readings are needed to show time-of-day use and compare electricity plans. Reloading this screen does not retrieve new readings.", retryable: false,
 };
 if (status === 404 || code === "not_connected" || code === "no_statements") return {
  title: "Detailed usage is not available",
  message: "Your saved bill history is still available. Check the utility connection status for the available data.", retryable: false,
 };
 return { title: "Couldn’t load detailed usage", message: "Your bill history is still available. Check your connection and try loading the saved readings again.", retryable: status !== 401 && status !== 403 };
}
