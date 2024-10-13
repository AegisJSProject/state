const stateRegistry = new Set();
const channel = new BroadcastChannel('aegis:state_sync');
const sender = crypto.randomUUID();
let isChannelOpen = true;

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

export function closeChannel() {
	if (isChannelOpen) {
		channel.close();
		isChannelOpen = false;
	}
}

export function diffState(newState, oldState = getStateObj()) {
	if (oldState !== newState) {
		const oldKeys = Object.keys(oldState);
		const newKeys = Object.keys(newState);
		const addedKeys = newKeys.filter(key => ! oldKeys.includes(key));
		const removedKeys = oldKeys.filter(key => ! newKeys.includes(key));
		const changedKeys = oldKeys.filter(key => newState[key] !== oldState[key]);

		return Object.freeze([...addedKeys, ...changedKeys, ...removedKeys]);
	} else {
		return [];
	}
}

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

export function observeStateChanges(target, ...observedStates) {
	if (target instanceof Function && ! stateRegistry.has(target)) {
		stateRegistry.add({ callback: target, observedStates });
		return true;
	} else {
		return false;
	}
};

export const unobserveStateChanges = target => stateRegistry.delete(target);

export const getStateObj = () => Object.freeze(history.state === null ? {} : structuredClone(history.state));

export const hasState = key => key in getStateObj();

export const getState = (key = '', fallback = null) => getStateObj()[key] ?? fallback;

export const setState = (prop, value) => Promise.resolve(value).then(val => {
	const state = getStateObj();

	if (state[prop] !== val) {
		replaceState({ ...getStateObj(), [prop]: val }, '', location.href);
	}
});

export const updateState = async (key, cb) => Promise.try(() => cb(getState(key))).then(async val => {
	await setState(key, val);
	return val;
});

export function manageState(key, initialValue = null) {
	return [
		Object.freeze({
			toString: () => getState(key, initialValue).toString(),
			valueOf: () => getState(key, initialValue),
			[Symbol.toPrimitive]: () => getState(key, initialValue),
			[Symbol.toStringTag]: 'StateValue',
			get [Symbol.iterator]() {
				const val = getState(key, initialValue);
				return getState(key, initialValue)[Symbol.iterator];
			},
		}),
		newVal => setState(key, newVal)
	];
};

export function deleteState(key) {
	const state = { ...getStateObj() };
	delete state[key];
	replaceState(state, location.href);
};

export const saveState = (key = 'aegis:state') => localStorage.setItem(key, JSON.stringify(getStateObj()));

export const restoreState = (key = 'aegis:state') => _updateState(JSON.parse(localStorage.getItem(key)), location.href);

export const clearState = () => replaceState({}, location.href);

export function replaceState(state = getStateObj(), url = location.href) {
	if (_updateState(state, url)) {
		if (isChannelOpen) {
			channel.postMessage(_getStateMessage('update'));
		}
	}
}

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
						console.error(`Unhandled broadcast channel message type: ${event.data.type}`);
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
