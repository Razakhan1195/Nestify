import test from "node:test";
import assert from "node:assert/strict";
import catalogue from "../src/lib/deck/canadian-provider-catalog.json";
import routing from "../src/lib/deck/gta-provider-routing.json";
import { gtaCatalogueEntry, gtaProviderChoice, allowsNewDeckProvider, excludedFromNewDeck, hasExistingDeckConnection } from "../src/lib/deck/gta-launch";

test("energy overlap never appears as a new Deck connection; water remains a document route", () => {
  const overlaps = routing.providers.filter(p => p.greenButton);
  assert.equal(overlaps.length, 11);
  for (const item of overlaps) {
    const source = catalogue.find(p => p.id === item.id)!;
    const choice = gtaCatalogueEntry(source, false);
    assert.equal(excludedFromNewDeck(item.id), true, item.name);
    assert.equal(allowsNewDeckProvider(item.id), false, item.name);
    if (choice) {
      assert.equal(choice.utility_type, "Water");
      assert.equal((choice.metadata as Record<string, unknown>).deck_document_alternative, true);
      assert.match(choice.name, /Water via/);
    } else assert.equal(item.route, "green_button");
  }
});

test("new catalogue excludes other-region entries and retains the selected GTA providers", () => {
  const choices = catalogue.flatMap(row => { const choice = gtaCatalogueEntry(row, false); return choice ? [choice] : []; });
  assert.equal(choices.filter(p => !(p.metadata as Record<string, unknown>)?.deck_document_alternative).length, 29);
  assert.equal(choices.filter(p => (p.metadata as Record<string, unknown>)?.deck_document_alternative).length, 10);
  for (const name of ["BC Hydro", "ATCO", "Hydro-Québec", "Videotron", "Shaw / Rogers"]) assert.ok(!choices.some(p => p.name === name));
  for (const name of ["Bell", "Region of Durham Water", "Region of Peel Water", "Enercare"]) assert.ok(choices.some(p => p.name === name));
  assert.equal(allowsNewDeckProvider("unknown"), false);
  assert.equal(allowsNewDeckProvider(null), false);
  assert.equal(gtaCatalogueEntry({id:"unknown",name:"Unknown",utility_type:"Internet"}, false), null);
});

test("all 25 GTA municipalities retain a water bill route without a second energy connection", () => {
  const choices = catalogue.flatMap(row => { const choice = gtaCatalogueEntry(row, false); return choice ? [choice] : []; });
  const water = choices.filter(p => p.utility_type === "Water");
  for (const city of ["Toronto","Mississauga","Brampton","Caledon","Ajax","Pickering","Whitby","Oshawa","Clarington","Scugog","Uxbridge","Brock","Burlington","Oakville","Milton","Halton Hills","Aurora","East Gwillimbury","Georgina","King","Markham","Newmarket","Richmond Hill","Vaughan","Stouffville"]) {
    assert.ok(water.some(p => (p.name+" "+p.searchAliases.join(" ")).toLowerCase().includes(city.toLowerCase())), city);
  }
});

test("existing connections preserve their exact registry presentation and can be managed", () => {
  for (const name of ["Elexicon Energy", "Burlington Hydro", "BC Hydro"]) {
    const source = catalogue.find(p => p.name === name)!;
    const result = gtaCatalogueEntry(source, true)!;
    assert.equal(result.existingOnly, true);
    assert.equal(result.id, source.id);
    assert.equal(result.name, source.name);
    assert.equal(result.utility_type, source.utility_type);
    assert.deepEqual(result.metadata, source.metadata);
  }
  assert.equal(hasExistingDeckConnection({}), false);
  assert.equal(hasExistingDeckConnection({deck_connection_status:null}), false);
  assert.equal(hasExistingDeckConnection({deck_connection_status:"disconnected"}), true);
  assert.equal(hasExistingDeckConnection({deck_credential_id:"cred_saved"}), true);
  assert.equal(gtaProviderChoice(catalogue.find(p => p.name === "Enbridge Gas")!.id)?.route, "green_button");
});
