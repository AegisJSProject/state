const stateRegistry = new Set();
const channel = new BroadcastChannel('aegis:state_sync');
const sender = crypto.randomUUID();
const proxySymbol = Symbol('proxy');
let isChannelOpen = true;

const _getState = (key, fallback = null) => history.state?.[key] ?? fallback;

function _getStateMessage(type, recipient, data = {}) {
	return {
		sender, type, state: getStateObj(), msgId: crypto.randomUUID(),
		recipient, location: location.href, timestamp: Date.now(), ...data
	};
}

function _updateState(state = getStateObj(), url = location.href) {
	const diff = diffState(state);

	if (diff.length !== 0) {
		history.replaceState(state, '', url);
		notifyStateChange(diff);
		return true;
	} else {
		return false;
	}
}

/**
 * Closes the broadcast channel if it's currently open. This will stop syncing between browsing contexts (tabs/windows/iframes)
 */
export function closeChannel() {
	if (isChannelOpen) {
		channel.close();
		isChannelOpen = false;
	}
}

/**
 * Calculates the difference between two state objects.
 *
 * @param {object} newState - The new state object.
 * @param {object} [oldState] - The old state object. Defaults to the current state object.
 * @returns {string[]} - An array of keys representing the added, removed, or changed properties.
 */
export function diffState(newState, oldState = getStateObj()) {
	if (oldState !== newState) {
		const oldKeys = Object.keys(oldState);
		const newKeys = Object.keys(newState);
		const addedKeys = newKeys.filter(key => ! oldKeys.includes(key));
		const removedKeys = oldKeys.filter(key => ! newKeys.includes(key));
		const changedKeys = oldKeys.filter(key => key in newState && key in oldState && newState[key] !== oldState[key]);

		return Object.freeze([...addedKeys, ...changedKeys, ...removedKeys]);
	} else {
		return [];
	}
}

/**
 * Notifies registered state change callbacks about changes in the state object.
 *
 * @param {string[]} diff - An array of keys representing the added, removed, or changed properties.
 * @returns {Promise<object[]>} - A promise that resolves to an array of settlement objects, one for each callback invocation.
 */
export async function notifyStateChange(diff) {
	if (Array.isArray(diff) && diff.length !== 0) {
		const currState = getStateObj();
		const state = Object.fromEntries(diff.map(key => [key, currState[key]]));

		await Promise.allSettled(Array.from(
			stateRegistry,
			({ callback, observedStates }) => {
				if (observedStates.length === 0 || observedStates.some(state => diff.includes(state))) {
					callback({ diff, state });
				}
			}
		));
	}
}

/**
 * Registers a callback function to be notified of state changes.
 *
 * @param {Function} target - The callback function to register.
 * @param {string[]} observedStates - An array of state keys to observe.
 * @returns {boolean} - True if the callback was successfully registered, false otherwise.
 */
export function observeStateChanges(target, ...observedStates) {
	if (target instanceof Function && ! stateRegistry.has(target)) {
		stateRegistry.add({ callback: target, observedStates });
		return true;
	} else {
		return false;
	}
};

/**
 * Gets a state value associated with a given key, providing a proxy object for reactive access and modification.
 *
 * @param {string} key - The key of the state value to retrieve.
 * @param {*} [fallback=null] - The fallback value to return if the state value is undefined or null.
 * @returns {ProxyHandler} - A proxy object representing the state value.
 */
export function getState(key, fallback = null) {
	return new Proxy({
		toString() {
			return _getState(key, fallback).toString();
		},
		valueOf() {
			const val = _getState(key, fallback);
			return val?.valueOf instanceof Function ? val.valueOf() : val;
		},
		[Symbol.toPrimitive](hint) {
			const val = _getState(key, fallback);
			return val?.[Symbol.toPrimitive] instanceof Function ? val[Symbol.toPrimitive](hint) : val;
		},
		[proxySymbol]: true,
		[Symbol.toStringTag]: 'StateValue',
		[Symbol.iterator]() {
			return _getState(key, fallback)?.[Symbol.iterator]();
		},
	}, {
		defineProperty(target, prop, attributes) {
			const val = _getState(key, fallback);

			if (Reflect.defineProperty(val, prop, attributes)) {
				setState(key, val);
				return val;
			} else {
				return false;
			}
		},
		deleteProperty(target, prop) {
			return Reflect.deleteProperty(_getState(key, fallback), prop);
		},
		get(target, prop) {
			const val = _getState(key, fallback);

			if (prop in target) {
				return target[prop];
			} else if (typeof val === 'object') {
				const result = Reflect.get(val, prop, val);
				return result instanceof Function ? result.bind(val) : result;
			} else {
				return val[prop];
			}
		},
		getOwnPropertyDescriptor(target, prop) {
			return Reflect.getOwnPropertyDescriptor(_getState(key, fallback), prop);
		},
		getPrototypeOf() {
			const val = _getState(key, fallback);
			return typeof val === 'object' ? Reflect.getPrototypeOf(val) : Object.getPrototypeOf(val);
		},
		has(target, prop) {
			return Reflect.has(_getState(key, fallback), prop);
		},
		isExtensible() {
			return Reflect.isExtensible(_getState(key, fallback));
		},
		ownKeys() {
			return Reflect.ownKeys(_getState(key, fallback));
		},
		preventExtensions() {
			return Reflect.preventExtensions(_getState(key, fallback));
		},
		set(target, prop, newValue) {
			const val = _getState(key, fallback);

			if (Reflect.set(val, prop, newValue, val)) {
				setState(key, val);
				return true;
			} else {
				return false;
			}
		}
	});
}

/**
 * Unregisters a callback function from being notified of state changes.
 *
 * @param {Function} target - The callback function to unregister.
 * @returns {boolean} - True if the callback was successfully unregistered, false otherwise.
 */
export const unobserveStateChanges = target => stateRegistry.delete(target);

/**
 * Gets the current state object from the history.
 *
 * @returns {object} - A frozen copy of the current state object.
 */
export const getStateObj = () => Object.freeze(history.state === null ? {} : structuredClone(history.state));

/**
 * Checks if a state key exists in the current state object.
 *
 * @param {string} key - The key to check for.
 * @returns {boolean} - True if the key exists, false otherwise.
 */
export const hasState = key => key in getStateObj();

/**
 * Sets a state value.
 *
 * @param {string} prop - The property name to set.
 * @param {*} value - The new value for the property.
 */
export function setState(prop, value) {
	const state = getStateObj();

	if (state[prop] !== value) {
		replaceState({ ...getStateObj(), [prop]: value?.[proxySymbol] ? value.valueOf() : value }, '', location.href);
	}
};

/**
 * Updates a state value asynchronously.
 *
 * @param {string} key - The key of the state value to update.
 * @param {Function} cb - The callback function to update the value.
 * @returns {Promise<*>} - A promise that resolves to the updated state value.
 */
export const updateState = async (key, cb) => await Promise.try(() => cb(_getState(key))).then(val => {
	setState(key, val);
	return val;
});

/**
 * Manages a state value, providing a getter and setter functions.
 *
 * @param {string} key - The key of the state value.
 * @param {*} [initialValue=null] - The initial value for the state value.
 * @returns {[ProxyHandler, Function]} - An array containing the getter and setter functions. The first function returns a proxy object representing the state value, and the second function is used to update the value.
 */
export function manageState(key, initialValue = null) {
	return [getState(key, initialValue), newVal => setState(key, newVal)];
};

/**
 * Deletes a state value.
 *
 * @param {string} key - The key of the state value to delete.
 */
export function deleteState(key) {
	const state = { ...getStateObj() };
	delete state[key];
	replaceState(state, location.href);
};

/**
 * Saves the current state object to local storage.
 *
 * @param {string} [key="aegis:state"] - The key to use for storing the state in local storage.
 */
export const saveState = (key = 'aegis:state') => localStorage.setItem(key, JSON.stringify(getStateObj()));

/**
 * Restores the state object from local storage.
 *
 * @param {string} [key="aegis:state"] - The key used for storing the state in local storage.
 */
export const restoreState = (key = 'aegis:state') => _updateState(JSON.parse(localStorage.getItem(key)), location.href);

/**
 * Clears the current state object.
 */
export const clearState = () => replaceState({}, location.href);

/**
 * Replaces the current state object with the given state and updates the URL.
 *
 * @param {Object} state - The new state object.
 * @param {string} url - The new URL.
 * @returns {boolean} - True if the state was successfully replaced, false otherwise.
 */
export function replaceState(state = getStateObj(), url = location.href) {
	if (_updateState(state, url)) {
		if (isChannelOpen) {
			channel.postMessage(_getStateMessage('update'));
		}
	}
}

/**
 * Watches for state updates broadcasted through the channel and applies them to the local state.
 *
 * @param {object} [options] - Optional options.
 * @param {AbortSignal} [options.signal] - An AbortSignal to cancel the watcher.
 */
export function watchState({ signal } = {}) {
	channel.addEventListener('message', event => {
		if (
			event.isTrusted
			&& typeof event.data.msgId === 'string'
			&& typeof event.data.sender === 'string'
			&& event.data.sender !== sender
			&& typeof event.data.state === 'object'
			&& (typeof event.data.recipient !== 'string' || event.data.recipient === sender)
		) {
			const currentState = getStateObj();
			const diff = diffState(event.data.state, currentState);

			if (diff.length !== 0) {
				switch(event.data.type) {
					case 'update':
						_updateState({ ...currentState, ...event.data.state }, location.href);
						break;

					case 'sync':
						if (isChannelOpen) {
							channel.postMessage(_getStateMessage('update', event.data.sender));
						}
						break;

					case 'clear':
						_updateState({}, location.href);
						break;

					default:
						reportError(new Error(`Unhandled broadcast channel message type: ${event.data.type}`));
				}
			}
		}
	}, { signal });

	channel.postMessage(_getStateMessage('sync'));

	if (signal instanceof AbortSignal && signal.aborted) {
		closeChannel();
	} else if (signal instanceof AbortSignal) {
		signal.addEventListener('abort', closeChannel, { once: true });
	}
};
