import assert from 'node:assert/strict';
import test from 'node:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '../src/middleware';

test('native bearer routes do not invoke browser cookie refresh middleware', () => {
  for (const url of ['/api/mobile/v1/home?availability=1','/api/mobile/v1/bills','/api/mobile/v1/vault','/api/mobile/v1/care','/api/mobile/v1/shared-expenses','/api/mobile/v1/account/deletion']) {
    assert.equal(unstable_doesMiddlewareMatch({config,url}),false,url);
  }
});
test('protected browser pages retain cookie-session middleware', () => {
  for (const url of ['/app','/app/bills','/app/settings','/login','/api/mobile/v10/home','/api/mobile/v1-other']) {
    assert.equal(unstable_doesMiddlewareMatch({config,url}),true,url);
  }
});
