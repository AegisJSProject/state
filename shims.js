const STATE_SYMBOL = Symbol('state:value');

// Setup some globals for node
globalThis.location = new URL('https://example.com');

globalThis.history = {
	[STATE_SYMBOL]: null,
	get state() {
		return this[STATE_SYMBOL];
	},
	replaceState(newState) {
		this[STATE_SYMBOL] = Object.freeze(structuredClone(newState));
	},
	pushState(newState) {
		this[STATE_SYMBOL] = Object.freeze(structuredClone(newState));
	}
};

globalThis.MutationObserver = class MutationObserver {
	observe() {
		//
	}
};
