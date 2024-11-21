import './shims.js';
import { test, describe } from 'node:test';
import  assert from 'node:assert';
import { manageState, getState, closeChannel } from './state.js';

// Have to close channel because leaving it open would keep the process running.
closeChannel();
const num = getState('num', 42);
const nums = getState('nums', [1, 2, 3]);
const [foo, setFoo] = manageState('foo', 'bar');
setFoo('bar');
const signal = AbortSignal.timeout(300);

describe('Run tests to verify state managmenet operations', () => {
	test('Verify getting state.', { signal }, () => assert.equal(getState('foo'), 'bar'));
	test('State values should coerce to be equal.', { signal }, () => assert.equal(foo, 'bar'));
	test('State values should be objects/proxies.', { signal }, assert.notStrictEqual(foo, 'bar'));
	test('State values should work with many operators', { signal }, assert.equal(num + 1, 43));
	test('State value proxy should trigger updates', { signal }, () => {
		nums.push(4);
		assert.equal(nums.reduce((sum, num) => sum + num), 10);
		assert.equal(nums[0], 1);
	});
});
