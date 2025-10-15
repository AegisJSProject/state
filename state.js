const stateRegistry = new Map();
const channel = new BroadcastChannel('aegis:state_sync');
const sender = crypto.randomUUID();
const proxySymbol = Symbol('proxy');
const updateSymbol = Symbol('aegis:state:update');
let isChannelOpen = true;

export const EVENT_TARGET = new EventTarget();
export const stateKey = 'aegisStateKey';
export const stateAttr = 'aegisStateAttr';
export const stateStyle = 'aegisStateStyle';
export const stateProperty = 'aegisStateProperty';
export const stateKeyAttribute = 'data-aegis-state-key';
export const stateAttrAttribute = 'data-aegis-state-attr';
export const statePropertyAttr = 'data-aegis-state-property';
export const stateStyleAttribute = 'data-aegis-state-style';
export const changeEvent = 'change';
export const beforeChangeEvent = 'beforechange';

const _getState = (key, fallback = null) => history.state?.[key] ?? fallback;

function $$(selector, base = document.documentElement) {
	const results = base.querySelectorAll(selector);
	return base.matches instanceof Function && base.matches(selector) ? [base, ...results] : Array.from(results);
}

async function _updateElement({ state = history.state ?? {} } = {}) {
	const key = this.dataset.aegisStateKey;
	const val = state?.[key];

	await scheduler?.yield();

	if (typeof this.dataset[stateAttr] === 'string') {
		const attr = this.dataset[stateAttr];
		const oldVal = this.getAttribute(attr);

		if (typeof oldVal === 'string' && oldVal.startsWith('blob:')) {
			URL.revokeObjectURL(oldVal);
		}

		if (typeof val === 'boolean') {
			this.toggleAttribute(attr, val);
		} else if (val === null || val === undefined) {
			this.removeAttribute(attr);
		} else if (val instanceof Blob) {
			this.setAttribute(attr, URL.createObjectURL(val));
		} else {
			this.setAttribute(attr, val);
		}
	} else if (typeof this.dataset[stateProperty] === 'string' && this.dataset[stateProperty] !== 'innerHTML') {
		this[this.dataset[stateProperty]] = val;
	} else if (typeof this.dataset[stateStyle] === 'string') {
		if (typeof val === 'undefined' || val === null || val === false) {
			this.style.removeProperty(this.dataset[stateStyle]);
		} else {
			this.style.setProperty(this.dataset[stateStyle], val);
		}
	} else if (this instanceof HTMLInputElement || this instanceof HTMLSelectElement || this instanceof HTMLTextAreaElement) {
		this.value = val;
	} else {
		this.textContent = val;
	}
}

const domObserver = new MutationObserver(mutations => {
	mutations.forEach(record => {
		switch(record.type) {
			case 'childList':
				record.addedNodes.forEach(node => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						$$(`[${stateKeyAttribute}]`, node.target).forEach(el => {
							el[updateSymbol] = _updateElement.bind(el);
							observeStateChanges(el[updateSymbol], el.dataset[stateKey]);
						});
					}
				});

				record.removedNodes.forEach(node => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						$$(`[${stateKeyAttribute}]`, node.target).forEach(el => {
							unobserveStateChanges(el[updateSymbol]);
							delete el[updateSymbol];
						});
					}
				});
				break;

			case 'attributes':
				if (typeof record.oldValue === 'string') {
					unobserveStateChanges(record.target[updateSymbol]);
					delete record.target[updateSymbol];
				} else if (typeof record.target.dataset[stateKey] === 'string') {
					record.target[updateSymbol] = _updateElement.bind(record.target);
					observeStateChanges(record.target[updateSymbol], record.target.dataset[stateKey]);
				}
				break;
		}
	});
});

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
			stateRegistry.entries(),
			([callback, observedStates]) => {
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
		stateRegistry.set(target, observedStates);
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
			return _getState(key, fallback)?.toString() ?? '';
		},
		valueOf() {
			const val = _getState(key, fallback);
			return val?.valueOf instanceof Function ? val.valueOf() : val;
		},
		toJSON() {
			return _getState(key, fallback);
		},
		[Symbol.toPrimitive](hint) {
			const val = _getState(key, fallback);

			if (typeof val === hint) {
				return val;
			} else if (hint === 'default' && typeof val !== 'object') {
				return val;
			} else if (val?.[Symbol.toPrimitive] instanceof Function) {
				return val?.[Symbol.toPrimitive] instanceof Function ? val[Symbol.toPrimitive](hint) : val;
			} else if (hint !== 'number' && val?.toString instanceof Function) {
				return val.toString();
			} else if (hint === 'number') {
				return parseFloat(val);
			} else {
				return val;
			}
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
 * @param {string} key - The property name to set.
 * @param {*} newValue - The new value for the property, or a function to call to update
 * @throws {TypeError} If state is not a string or has a length of 0
 */
export function setState(key, newValue) {
	const state = getStateObj();

	if (typeof key !== 'string' || key.length === 0) {
		throw new TypeError('Invalid key.');
	} else if (typeof newValue === 'function') {
		updateState(key, newValue);
	} else if (state[key] !== newValue) {
		const detail = { key, oldValue: state[key], newValue };
		const event = new CustomEvent(beforeChangeEvent, { cancelable: true, detail });

		EVENT_TARGET.dispatchEvent(event);

		if (! event.defaultPrevented) {
			replaceState({ ...getStateObj(), [key]: newValue?.[proxySymbol] ? newValue.valueOf() : newValue }, location.href);

			EVENT_TARGET.dispatchEvent(new CustomEvent(changeEvent, { detail }));
		}
	}
};

/**
 * Updates a state value asynchronously.
 *
 * @param {string} key - The key of the state value to update.
 * @param {Function} cb - The callback function to update the value.
 * @returns {Promise<*>} - A promise that resolves to the updated state value.
 */
export const updateState = async (key, cb) => await Promise.try(() => cb(_getState(key), key)).then(val => {
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

/**
 * Watches for DOM mutations (added/removed nodes and attribute changes) for elements matching `[data-aegis-state-key]`.
 * Matching elements register a callback to be updated on state changes
 *
 * @param {Element|ShadowRoot|string} [target=document.documentElement] Root element to observe from
 * @param {object} options
 * @param {AbortSignal} [options.signal] Optional signal to disconnect the observer on abort
 * @param {Element} [options.base=document.documentElement] Base element to query from when `target` is a selector
 * @throws {TypeError} If the `target` is not an Element, ShadowRoot, or a valid CSS selector.
 * @throws {Error} If the provided `signal` is aborted.
 */
export function observeDOMState(target = document.documentElement, { signal, base = document.documentElement } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (typeof target === 'string') {
		observeDOMState(base.querySelector(target), { signal });
	} else if (! (target instanceof Element || target instanceof ShadowRoot)) {
		throw new TypeError('Target must be an element, selector, or shadow root.');
	} else {
		domObserver.observe(target, {
			childList: true,
			subtree: true,
			attributeFilter: [stateKeyAttribute],
			attributeOldValue: true,
		});

		$$(`[${stateKeyAttribute}]`, target).forEach(el => {
			el[updateSymbol] = _updateElement.bind(el);
			observeStateChanges(el[updateSymbol], el.dataset[stateKey]);
			el[updateSymbol]({ state: history.state });
		});

		if (signal instanceof AbortSignal) {
			signal.addEventListener('abort', () => domObserver.disconnect(), { once: true });
		}
	}
}

/**
 * Binds a DOM element to a specific state key to be updated on state changes
 *
 * @param {Element|string} target Target element or a selector
 * @param {string} key Name/key to observe
 * @param {object} options
 * @param {string} [options.attr] Optional attribute to bind state to
 * @param {string} [options.style] Optional style property to bind state to
 * @param {Element} [options.base=document.body] Base to query from when `target` is a selector
 */
export function bindState(target, key, { attr, style, base = document.body } = {}) {
	if (typeof target === 'string') {
		bindState(base.querySelector(target), key, { attr, style });
	} else if (! (target instanceof Element)) {
		throw new TypeError('Target must be an element or selector.');
	} else if (typeof stateKey !== 'string' || stateKey.length === 0) {
		throw new TypeError('State key must be a non-empty string.');
	} else if (target instanceof HTMLElement) {
		target.dataset[stateKey] = key;

		if (typeof attr === 'string') {
			target.dataset[stateAttr] = attr;
		} else if (typeof style === 'string') {
			target.dataset[stateStyle] = style;
		}

		requestAnimationFrame(() => _updateElement.call(target, { state: history.state ?? {}}));
	} else if (target instanceof Element) {
		target.setAttribute(stateKeyAttribute, key);

		if (typeof attr === 'string') {
			target.setAttribute(stateAttrAttribute, attr);
		} else if (typeof style === 'string') {
			target.setAttribute(stateStyleAttribute, style);
		}

		requestAnimationFrame(() => _updateElement.call(target, { state: history.state ?? {}}));
	}
}

/**
 * Creates and registers a callback on for given element (`target`) for state changes specified by `key`
 *
 * @param {Element|string} target Element or selector
 * @param {string} key Name/value for key in state obejct
 * @param {Function} handler The callback to register on for state changes
 * @param {object} options
 * @param {Element} [options.base=document.body] Base to query from when `target` is a selector
 * @param {AbortSignal} [options.signal] Optional signal to unregister callback when aborted
 * @returns {Function} The resulting callback, bound to the target Element
 */
export function createStateHandler(target, key, handler, { base = document.documentElement, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (typeof target === 'string') {
		return createStateHandler(base.querySelector(target), key, handler, {});
	} else if (! (target instanceof Element)) {
		throw new TypeError('Target must be an element or selector.');
	} else if (typeof key !== 'string' || key.length === 0) {
		throw new TypeError('State key must be a non-empty string.');
	} else if (! (handler instanceof Function)) {
		throw new TypeError('Callback must be a function.');
	} else {
		const callback = (function({ state = {} } = {}) {
			return handler.call(this, state[key], this);
		}).bind(target);

		observeStateChanges(callback, key);

		if (signal instanceof AbortSignal) {
			signal.addEventListener('abort', () => unobserveStateChanges(callback), { once: true });
		}

		return callback;
	}
}

/**
 * A change or input handler for inputs, updating state to new values
 *
 * @param {Event} event A change or input event
 * @throws {TypeError} If the event target is not an HTMLElement
 */
export function changeHandler({ target, currentTarget, type }) {
	if (! (target instanceof HTMLElement)) {
		throw new TypeError(`Event ${type} target must be an HTMLElement.`);
	} else if (target.isContentEditable && typeof target.dataset.name === 'string' && target.dataset.name.length !== 0) {
		setState(target.dataset.name, target.textContent);
	} else if (typeof target.name !== 'string' || target.name.length === 0) {
		// Remove event listener if event target is the element the listener was set on
		if (target.isSameNode(currentTarget)) {
			target.removeEventListener(type, changeHandler);
		}
	} else if (target instanceof HTMLSelectElement) {
		setState(target.name, target.multiple ? Array.from(target.selectedOptions, opt => opt.value) : target.value);
	} else if (target instanceof HTMLInputElement) {
		switch(target.type) {
			case 'checkbox': {
				const checkboxes = Array.from(target.form?.elements ?? [target])
					.filter(input => input.name === target.name && input.type === 'checkbox');

				if (checkboxes.length === 1) {
					setState(target.name, target.value === 'on' ? target.checked : target.value);
				} else {
					setState(target.name, Array.from(checkboxes).filter(item => item.checked).map(item => item.value));
				}
			}
				break;

			case 'radio':
				setState(
					target.name,
					Array.from(target.form?.elements ?? [target])
						.filter(input => input.name === target.name && input.checked)
						.find(input => input.value)?.value
				);
				break;

			case 'number':
			case 'range':
				setState(target.name, target.valueAsNumber);
				break;

			case 'date':
				setState(target.name, target.valueAsDate?.toISOString()?.split('T')?.at(0));
				break;

			case 'file':
				setState(target.name, target.multiple ? Array.from(target.files) : target.files.item(0));
				break;

			case 'datetime-local':
				setState(target.name, target.valueAsDate);
				break;

			default:
				setState(target.name, target.value);
		}
	} else if (target instanceof HTMLTextAreaElement) {
		setState(target.name, target.value);
	} else if (target.constructor.formAssociated) {
		setState(target.name, target.value);
	} else {
		throw new TypeError(`Event ${type} target is not a valid form element.`);
	}
}

/**
 * Adds an event listener for a `change` event on state.
 *
 * @param {Function} callback - The callback function to handle the `change` event.
 * @param {object} [options] - Optional configuration object to customize the listener behavior.
 * @param {AbortSignal} [options.signal] - An optional `AbortSignal` object that allows you to cancel the event listener (useful for cleanup).
 * @param {boolean} [options.once=false] - If `true`, the listener will be invoked at most once and then removed after the first invocation.
 * @param {boolean} [options.passive=false] - If `true`, the listener will never call `preventDefault()`, improving performance for some types of events (e.g., scrolling).
 */
export function onStateChange(callback, { signal, once = false, passive = false } = {}) {
	EVENT_TARGET.addEventListener(changeEvent, callback, { signal, once, passive });
}

/**
 * Adds an event listener for a cancelable `beforechange` event on state
 *
 * @param {Function} callback - The callback function to handle the `beforechange` event.
 * @param {object} [options] - Optional configuration object to customize the listener behavior.
 * @param {AbortSignal} [options.signal] - An optional `AbortSignal` object that allows you to cancel the event listener (useful for cleanup).
 * @param {boolean} [options.once=false] - If `true`, the listener will be invoked at most once and then removed after the first invocation.
 * @param {boolean} [options.passive=false] - If `true`, the listener will never call `preventDefault()`, improving performance for some types of events (e.g., scrolling).
 */
export function onBeforeStateChange(callback, { signal, once = false, passive = false } = {}) {
	EVENT_TARGET.addEventListener(beforeChangeEvent, callback, { signal, once, passive });
}
