import test from "node:test";
import assert from "node:assert/strict";
import {collectionSwipeTarget,isCollectionSwipe} from "../apps/mobile/src/lib/collection-swipe";
test("vertical scrolling, slight movement and multi-touch do not change pages",()=>{
 assert.equal(isCollectionSwipe(30,40),false);assert.equal(isCollectionSwipe(12,0),false);assert.equal(isCollectionSwipe(90,2,2),false);
 assert.equal(collectionSwipeTarget(0,3,-12,0,1),0);assert.equal(collectionSwipeTarget(1,3,-60,90),1);
});
test("intentional swipes work both ways and stop at the first and last page",()=>{
 assert.equal(collectionSwipeTarget(0,3,-60,5),1);assert.equal(collectionSwipeTarget(1,3,60,3),0);
 assert.equal(collectionSwipeTarget(0,3,60,3),0);assert.equal(collectionSwipeTarget(2,3,-60,3),2);
 assert.equal(collectionSwipeTarget(0,3,-28,0,-0.6),1);
});
