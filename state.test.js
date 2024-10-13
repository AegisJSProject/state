import { test, describe } from 'node:test';
import  assert from 'node:assert';
import { manageState, getState, closeChannel } from './state.js';

const STATE_SYMBOL = Symbol('state:value');

// Setup some globals for node
globalThis.location = new URL('https://example.com');

globalThis.history = {
	[STATE_SYMBOL]: null,
	get state() {
		return this[STATE_SYMBOL];
	},
	replaceState(newState) {
		this[STATE_SYMBOL] = structuredClone(newState);
	},
	pushState(newState) {
		this[STATE_SYMBOL] = structuredClone(newState);
	}
};

// Have to close channel because leaving it open would keep the process running.
closeChannel();
const [foo, setFoo] = manageState('foo', 'bar');
await setFoo('bar');
const signal = AbortSignal.timeout(300);

describe('Run tests to verify state managmenet operations', () => {
	test('Verify getting state.', { signal }, () => assert.strictEqual(getState('foo'), 'bar'));
	test('State values should coerce to be equal.', { signal }, () => assert.equal(foo, 'bar'));
	test('State values should be objects.', { signal }, assert.notStrictEqual(foo, 'bar'));
});
