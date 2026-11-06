import test from "node:test";
import assert from "node:assert/strict";

import { buildUtilityInsights } from "../src/lib/ezgb/analytics";
import {
  cleanEzgbValue,
  ezgbCategory,
  ezgbExternalBillId,
  ezgbServicePointKey,
  normalizeEzgbAccount,
  normalizeEzgbBills,
} from "../src/lib/ezgb/normalize";
import type { EzgbAccountRow, EzgbBillData } from "../src/lib/ezgb/types";

function account(overrides: Partial<EzgbAccountRow["child"]> = {}): EzgbAccountRow {
  return {
    parent: {
      authorization: "auth-1",
      nickName: "Home",
      created: "2026-09-21T12:00:00Z",
      user: { username: "rz_user", email: null },
    },
    child: {
      _id: "child-1",
      usagePointUUID: "EFC381C0-89B6-53B1-B1C6-C52CC8D38BE2",
      accountNumber: "200140201040",
      meterNumber: "Null",
      nickName: "177 MCILRAITH RD",
      retrieved: "2026-09-21T12:00:00Z",
      intervalReadingCount: "17520",
      usageSummaryCount: "24",
      latestBillDate: "2026-08-13",
      problemToken: "must-not-be-persisted",
      ...overrides,
    },
    custodian: {
      utilityName: "Hydroone",
      humanName: "Hydro One",
    },
  };
}

function billDocument(): EzgbBillData {
  return {
    utilityName: "Hydro One",
    commodities: ["electricity"],
    customerData: {
      mailingName: "Raza Khan",
      accountNumber: "200140201040",
      serviceAddress1: "177 MCILRAITH RD",
      serviceAddress2: null,
      serviceAddressCity: "DARLING",
      serviceAddressProvince: "ON",
      serviceAddressPostalCode: "K0G 1K0",
      meterNumber: "J2907513",
      serviceLocationId: "loc",
      meterResourceId: "meter",
      customerAgreementId: "agreement",
    },
    bills: [
      {
        date: "2026-08-13",
        due_date: "2026-09-09",
        start_date: "2026-07-01",
        end_date: "2026-08-01",
        billing_period: "2026-07-01 - 2026-08-01",
        amount_due: 183.61,
        account_type: null,
        bill_number: 554424786113,
        currency: "CAD",
        notes: [],
        additional_data: [],
        quality_of_reading: "19 - Revenue-Quality",
        services: {
          electricity: {
            unit: "kWh",
            totalCost: 183610,
            reading: [{ usage: 800 }, { usage: 814.67 }],
            charges: [{ description: "Delivery", amount: 65.36 }],
          },
        },
      },
    ],
  };
}

test("EZGB service point key survives re-authorization and UUID casing", () => {
  const first = account({ _id: "old-id" });
  const second = account({
    _id: "new-id",
    usagePointUUID: "efc381c0-89b6-53b1-b1c6-c52cc8d38be2",
  });

  assert.equal(ezgbServicePointKey(first), ezgbServicePointKey(second));
  assert.equal(
    ezgbServicePointKey(first),
    "hydro one:efc381c0-89b6-53b1-b1c6-c52cc8d38be2",
  );
});

test("EZGB account normalization cleans placeholders and does not persist problemToken", () => {
  const normalized = normalizeEzgbAccount(account());

  assert.equal(normalized.meterNumber, null);
  assert.equal(normalized.intervalReadingCount, 17520);
  assert.equal(normalized.usageSummaryCount, 24);
  assert.equal("problemToken" in normalized, false);
  assert.equal(cleanEzgbValue("Unknown"), null);
  assert.equal(cleanEzgbValue(" N/A "), null);
});

test("EZGB bill key uses service point and period, not child id or bill number", () => {
  const key = ezgbServicePointKey(account())!;
  const row = normalizeEzgbBills(billDocument(), key, "old-child-id")[0];

  assert.equal(row.naturalKey, `${key}:2026-07-01:2026-08-01`);
  assert.equal(
    ezgbExternalBillId(key, row.periodStart!, row.periodEnd!),
    ezgbExternalBillId(key, row.periodStart!, row.periodEnd!),
  );

  const sameAfterReauth = normalizeEzgbBills(
    billDocument(),
    key,
    "new-child-id",
  )[0];
  assert.equal(row.naturalKey, sameAfterReauth.naturalKey);
});

test("EZGB uses amount_due for money and readings for usage", () => {
  const key = ezgbServicePointKey(account())!;
  const row = normalizeEzgbBills(billDocument(), key, "child-1")[0];

  assert.equal(row.amountDue, 183.61);
  assert.equal(row.usage, 1614.67);
  assert.equal(row.usageUnit, "kWh");
  assert.equal(row.totalCostRaw, 183610);
  assert.equal(row.billNumber, "554424786113");
  assert.equal(row.addressLine1, "177 MCILRAITH RD");
  assert.equal(row.postalCode, "K0G 1K0");
});

test("EZGB utility categories map into Rezlee's existing bill taxonomy", () => {
  assert.equal(ezgbCategory("electricity"), "Electricity");
  assert.equal(ezgbCategory("naturalGas"), "Natural Gas");
  assert.equal(ezgbCategory("water"), "Water");
  assert.equal(ezgbCategory("steam"), "Other service");
});

test("EZGB utility insights summarize bill history without flooding the bill list", () => {
  const statements = [
    { id: "b1", providerId: "p1", providerName: "Elexicon Energy", category: "Electricity", categoryId: "electricity", amount: 100, periodStart: "2026-01-01", periodEnd: "2026-01-31", issueDate: "2026-02-05", usage: 400000, usageUnit: "kWh" },
    { id: "b2", providerId: "p1", providerName: "Elexicon Energy", category: "Electricity", categoryId: "electricity", amount: 110, periodStart: "2026-02-01", periodEnd: "2026-02-28", issueDate: "2026-03-05", usage: 440000, usageUnit: "kWh" },
    { id: "b3", providerId: "p1", providerName: "Elexicon Energy", category: "Electricity", categoryId: "electricity", amount: 165, periodStart: "2026-03-01", periodEnd: "2026-03-31", issueDate: "2026-04-05", usage: 660000, usageUnit: "kWh" },
  ];

  const [insight] = buildUtilityInsights(statements, [{
    providerId: "p1",
    intervalReadingCount: 18245,
    usageSummaryCount: 24,
    lastSyncAt: "2026-09-22T02:43:06Z",
  }]);

  assert.equal(insight.statementCount, 3);
  assert.equal(insight.latestBillId, "b3");
  assert.equal(insight.latestVsPreviousPercent, 50);
  assert.equal(insight.intervalDataReported, true);
  assert.equal(insight.intervalAnalysisReady, false);
  assert.equal(insight.intervalReadingCount, 18245);
  assert.equal(insight.history.length, 3);
});

test("EZGB analytics suppress usage trends when meter scale is unvalidated", () => {
  const statements = [
    { id: "b1", providerId: "p1", providerName: "Elexicon Energy", category: "Electricity", categoryId: "electricity", amount: 100, periodStart: "2026-01-01", periodEnd: "2026-01-31", issueDate: null, usage: 500000, usageUnit: "kWh" },
    { id: "b2", providerId: "p1", providerName: "Elexicon Energy", category: "Electricity", categoryId: "electricity", amount: 120, periodStart: "2026-02-01", periodEnd: "2026-02-28", issueDate: null, usage: 625000, usageUnit: "kWh" },
  ];

  const [insight] = buildUtilityInsights(statements);

  assert.equal(insight.absoluteUsageReliable, false);
  assert.equal(insight.usageUnit, null);
  assert.equal(insight.usageTrendPercent, null);
  assert.equal(insight.history[0].usageIndex, null);
  assert.equal(insight.history[1].usageIndex, null);
});


test("EZGB missing and conflicting usage never becomes zero or a partial total", () => {
  const d = billDocument();
  const normalize = () => normalizeEzgbBills(d, "service", "child")[0];
  d.bills[0].services.electricity.reading = [{}];
  assert.equal(normalize().usage, null);
  d.bills[0].services.electricity.reading = [{usage: 100}, {}];
  assert.equal(normalize().usage, null);
  d.bills[0].services.electricity.totalUsage = 120;
  assert.equal(normalize().usage, 120);
  d.bills[0].services.electricity.reading = [{usage: 100}];
  assert.equal(normalize().usage, null);
  d.bills[0].services.electricity.totalUsage = 100;
  assert.equal(normalize().usage, 100);
  d.bills[0].services.gas = {unit: "m3", reading: [{usage: 50}]};
  assert.equal(normalize().usage, null);
  assert.equal(normalize().commodity, null);
});
test("EZGB invalid or reversed calendar periods cannot become durable bill identities", () => {
  const d = billDocument();
  d.bills[0].start_date = "2026-02-30";
  assert.equal(normalizeEzgbBills(d,"service","child")[0].keyable,false);
  d.bills[0].start_date = "2026-09-01";
  assert.equal(normalizeEzgbBills(d,"service","child")[0].keyable,false);
});
