# Help me fix this — bounded phone and usefulness acceptance

Use the current staging app in Expo, then Care → Help me fix this. This release changes the staging backend; it does not require a new TestFlight binary for the server fixes. An older installed UI may still need the current development app. Use a QA household for scripted cases. Do not perform a dangerous physical experiment to test a hazard scenario.

## What this release promises
Describe a problem, receive one relevant safe check or observation, keep progress, and either record resolution or prepare an editable request for a landlord/professional. Known limits must lead to a useful request, not a loop. This is safe triage and basic troubleshooting; it is not universal model-specific appliance repair.

## Phone acceptance — about 15 minutes per platform
Record app build/runtime, iOS/Android version, device and result. These are pending human/device checks; the automated RNWeb render is not a substitute.

1. **One-device Wi-Fi:** enter “Only my laptop cannot connect. Other devices work normally on the same Wi-Fi.” Expect the affected-device reconnect step, no repeated scope question. Leave the screen during reading, use another tab, return. Exactly one saved issue and the eventual step must appear. Mark Worked only if testing a real resolution; scripted QA can mark Worked in its isolated household. Confirm the resolved case retains the check.
2. **Unknown faucet model:** enter “Kitchen faucet has weak flow. Other taps are normal. I do not know the model.” Expect a visual observation without removing anything. Select visible buildup. Expect a useful editable landlord/service request that retains the observation; no second demand for an unknown model. Edit, save, leave, return. Share only to a tester-controlled destination, if testing share-sheet delivery.
3. **Cannot do / stop:** on an unresolved refrigerator example choose Cannot do or Stop. Confirm no demand to repeat the same failed check, and the request remains available. Reopen a resolved issue as recurring: previous checks and notes must remain.
4. **Recovery:** open a saved issue; turn on airplane mode and attempt a safe edit/save. Expect an honest error and preserved text, not a false success or duplicate. Reconnect, retry/check saved state, and confirm one persisted result. Repeat leaving/backgrounding the app during guidance.
5. **Hazard (text simulation only):** describe a gas smell. Ordinary DIY must stop immediately. Do not create an actual hazard or call emergency services as a test.
6. **Visual/native:** repeat request editing at large text; check keyboard dismissal, buttons, scrolling, safe areas, back navigation and native share-sheet cancellation. If testing photos, cancel the picker, then try a permitted image and a failed read; the description must remain editable. The existing photo flow analyzes the image and does not retain it with the issue; it must not imply otherwise.

Pass: no blocked navigation, lost input, duplicated issue/response, unauthorized household access, repeated failed checks, invented diagnosis or unsafe instruction. Any such failure blocks acceptance. Source/date and uncertainty remain readable. Check both iOS and Android before calling both platforms accepted.

## Customer usefulness — small practical check
Ask three willing testers with real, non-hazardous home problems to use it without coaching. Do not require a particular answer and do not claim a simulated resolution as a repair success.

For each, record: issue category; whether the first step was relevant; unnecessary questions; time to first usable next step; resolved / useful next check / usable help request / no useful outcome; whether they understood the limit; one verbatim reason the outcome helped or did not help. Avoid storing sensitive household details in analytics.

Proposed acceptance, not observed demand: all three can reach and understand an honest outcome unaided; at least two independently consider the check or request useful; zero safety/data-loss defects. Failure means correct the observed journey, not add unrelated categories. Three testers are a usability signal, not proof of market demand or repair success rates.

## Source freshness
Before releases and weekly during operation, run:

```sh
npx tsx scripts/qa/check-repair-references.ts --online
```

This reads public articles only. Review changed/unavailable pages or references within seven days of expiry. Manually compare the actual guidance before updating a review date. Never automatically renew it. The present reviewed references expire after 30 days; if neither live evidence nor a current reviewed reference is available, the app must offer safe observations or a help request instead of an unsupported physical action. This command is available now; no new scheduler was enabled.
