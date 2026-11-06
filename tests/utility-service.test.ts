import test from "node:test";
import assert from "node:assert/strict";
import { isElectricityProvider, supportedElectricityReading } from "../src/lib/utility/service";
import { utilityUsageAvailability } from "../apps/mobile/src/lib/utility-availability";

test("electricity analysis requires an explicit electricity category", () => {
 assert.equal(isElectricityProvider({ name: "Electricity" }), true);
 assert.equal(isElectricityProvider([{ name: "Electricity" }]), true);
 for (const category of [{ name: "Natural Gas" }, { name: "Water" }, null, [], [{ name: "Gas" }, { name: "Electricity" }], { name: "Other service" }]) assert.equal(isElectricityProvider(category), false);
});
test("gas quantities and unknown units cannot enter electricity calculations", () => {
 const reading = { unit: "kWh", commodity: "electricity", timezone: "America/Toronto" };
 assert.equal(supportedElectricityReading(reading), true);
 for (const row of [{ ...reading, unit: "m3" }, { ...reading, commodity: "naturalGas" }, { ...reading, timezone: null }]) assert.equal(supportedElectricityReading(row), false);
});
test("missing or unsupported readings are not retriable transport failures", () => {
 for (const code of ["unsupported_utility", "missing_readings", "incomplete_readings", "unsupported_readings", "no_statements", "not_connected"]) assert.equal(utilityUsageAvailability(422, { code }).retryable, false);
 assert.equal(utilityUsageAvailability(404, {}).retryable, false);
 assert.equal(utilityUsageAvailability(503, {}).retryable, true);
 assert.equal(utilityUsageAvailability(undefined, undefined).retryable, true);
 assert.equal(utilityUsageAvailability(401, {}).retryable, false);
});
