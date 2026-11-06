import test from "node:test";
import assert from "node:assert/strict";
import { omitRepairSerials } from "../src/lib/ai/repair-photo";

test("removes a labelled serial from every repair-summary field while retaining the model", () => {
  const result = omitRepairSerials({
    observation: 'Plate reads Model: DW-TEST-42, Serial: TESTSN-1007, Rated supply: 120 V AC.',
    equipment: "Example dishwasher DW-TEST-42, TESTSN-1007",
    uncertainty: "Cannot verify TESTSN-1007.",
    possibleHazard: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /TESTSN-1007/);
  assert.match(result.equipment, /DW-TEST-42/);
  assert.match(result.observation, /120 V AC/);
  assert.equal(result.possibleHazard, false);
});
test("recognizes serial label variations without rewriting ordinary uncertainty text", () => {
  for (const label of ["Serial:", "Serial number ", "S/N: ", "Serial text visible: ", "Serial no. #"]) {
    assert.doesNotMatch(omitRepairSerials({ observation: label+"ABC-1234.", equipment:"ABC-1234", uncertainty:"", possibleHazard:false }).equipment,/ABC-1234/);
  }
  const plain={observation:"Serial number unreadable. Dishwasher label is worn.",equipment:"Dishwasher",uncertainty:"Exact model is unclear.",possibleHazard:false};
  assert.deepEqual(omitRepairSerials(plain),plain);
});
