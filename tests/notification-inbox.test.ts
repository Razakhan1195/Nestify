import assert from "node:assert/strict";
import test from "node:test";
import {appNotificationsEnabled, notificationInboxEnabled, dispatchAppNotifications} from "../src/lib/notifications/service";
const savedApp=process.env.REZLEE_APP_NOTIFICATIONS_ENABLED;
const savedInbox=process.env.REZLEE_NOTIFICATION_INBOX_ENABLED;
test("inbox availability is independent of push rollout",async t=>{
 try {
  for(const [app,inbox,expected] of [
   [undefined,undefined,false], [undefined,"true",true],
   ["false","true",true], ["true",undefined,true], ["false","false",false]
  ] as const){
   await t.test(`app=${String(app)}, inbox=${String(inbox)}`,()=>{
    if(app===undefined)delete process.env.REZLEE_APP_NOTIFICATIONS_ENABLED;else process.env.REZLEE_APP_NOTIFICATIONS_ENABLED=app;
    if(inbox===undefined)delete process.env.REZLEE_NOTIFICATION_INBOX_ENABLED;else process.env.REZLEE_NOTIFICATION_INBOX_ENABLED=inbox;
    assert.equal(notificationInboxEnabled(),expected);
    assert.equal(appNotificationsEnabled(),app==="true");
   });
  }
  await t.test("inbox-only mode cannot query recipients or dispatch push",async()=>{
   delete process.env.REZLEE_APP_NOTIFICATIONS_ENABLED;
   process.env.REZLEE_NOTIFICATION_INBOX_ENABLED="true";
   const untouched=new Proxy({},{get(){throw Error("Push dispatch touched the database");}});
   assert.equal(notificationInboxEnabled(),true);
   assert.deepEqual(await dispatchAppNotifications(untouched as never),{sent:0});
   assert.deepEqual(await dispatchAppNotifications(untouched as never,"synthetic-home"),{sent:0});
  });
 }finally{
  if(savedApp===undefined)delete process.env.REZLEE_APP_NOTIFICATIONS_ENABLED;else process.env.REZLEE_APP_NOTIFICATIONS_ENABLED=savedApp;
  if(savedInbox===undefined)delete process.env.REZLEE_NOTIFICATION_INBOX_ENABLED;else process.env.REZLEE_NOTIFICATION_INBOX_ENABLED=savedInbox;
 }
});
