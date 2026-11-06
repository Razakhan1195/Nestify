import test from "node:test";
import assert from "node:assert/strict";
import {tailoredMaintenancePlan,tailoredPlanSchema,careAreas,suggestedCareAreas} from "../src/lib/product/tailored-maintenance";
import {maintenancePlanTasksSchema} from "../src/lib/product/maintenance-input";
const base={responsibility:"self",areas:["plumbing"],startDate:"2026-10-08"};
test("selected areas alone determine plan, no imagined equipment",()=>{const p=tailoredMaintenancePlan(base);assert.equal(p.tasks.length,1);assert.equal(p.tasks[0].id,"plumbing");assert.equal(p.tasks[0].recurrence,"");assert.equal(p.tasks[0].due_date,base.startDate);});
test("rental responsibilities change the relevant task",()=>{const p=tailoredMaintenancePlan({...base,responsibility:"landlord",areas:["heating"]});assert.match(p.tasks[0].title,/landlord/);assert.match(p.tasks[0].description,/landlord/);});
test("all plans fit existing save contract and retain sources",()=>{for(const responsibility of ["self","landlord","building"]){const p=tailoredMaintenancePlan({...base,responsibility,areas:careAreas.map(a=>a.id)});assert.equal(maintenancePlanTasksSchema.safeParse(p.tasks).success,true);for(const t of p.tasks)assert.ok(t.description.includes(t.source.url));}});
test("no duplicate recommendation for an existing open task",()=>{const first=tailoredMaintenancePlan(base);assert.equal(tailoredMaintenancePlan({...base,areas:["plumbing","plumbing"]},[first.tasks[0].title]).tasks[0].alreadyAdded,true);});
test("invalid and impossible dates and unsupported areas are rejected",()=>{for(const patch of [{areas:[]},{areas:["roof"]},{startDate:"2026-02-30"},{responsibility:"admin"}])assert.equal(tailoredPlanSchema.safeParse({...base,...patch}).success,false);});
test("inventory suggestions are hints, no automatic equipment assumption",()=>{assert.deepEqual(suggestedCareAreas([{name:"Fridge",category:"Appliance"}]),["fridge"]);assert.deepEqual(suggestedCareAreas([]),[]);});

