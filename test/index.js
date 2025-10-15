import {
	observeStateChanges, unobserveStateChanges, manageState, watchState, saveState, setState, observeDOMState, bindState,
	stateKeyAttribute, stateAttrAttribute, createStateHandler, changeHandler as change, stateStyle, stateKey, statePropertyAttr,
	onStateChange,
} from '@aegisjsproject/state/state.js';
import { html } from '@aegisjsproject/core/parsers/html.js';
import { AegisComponent } from '@aegisjsproject/component/base.js';
import { SYMBOLS, TRIGGERS } from '@aegisjsproject/component/consts.js';
import { registerCallback, observeEvents } from '@aegisjsproject/callback-registry/callbackRegistry.js';
import { onClick, onChange, onClose, onInput } from '@aegisjsproject/callback-registry/events.js';

function debounce(callback, delay = 100, { thisArg } = {}) {
	let timeout = NaN;

	return function(...args) {
		if (! Number.isNaN(timeout)) {
			clearTimeout(timeout);
		}

		setTimeout(() => {
			callback.apply(thisArg, args);
			timeout = NaN;
		}, delay);
	};
}

const STATE_CHANGED = 'aegis:state:changed';
const changeHandler = registerCallback('aegis:change', debounce(change));
const [msg, setMessage] = manageState('msg', 'Hello, World!');
const [list, setList] = manageState('list', [1]);
const [hidden, setHidden] = manageState('hidden', false);
const [open, setOpen] = manageState('open', false);
const [fill, setFill] = manageState('fill', '#ff0000');
const [bg, setBg] = manageState('bg', 'inherit');
const [content, setContent] = manageState('content', 'Bacon Ipsum');
const iter = Iterator.range(list.at(-1) + 1, Infinity);
const pushItem = registerCallback('push:item', () => setList(list.concat(iter.next().value)));
registerCallback('state:fill:set', () => setFill(`#${crypto.getRandomValues(new Uint8Array(3)).toHex()}`));
onStateChange(console.log);

class StatefulElemenet extends AegisComponent {
	constructor() {
		super({
			template: html`
				<div part="container">
					<input type="file" accept="image/*" ${onChange}="${({ target }) => setState('file', target.files.length === 1 ? target.files[0] : null )}" />
					<input type="color" value="${bg}" ${onChange}="${({ target }) => setBg(target.value)}" />
					<p part="message" id="msg">${msg}</p>
					<p>Update below to change message.</p>
					<textarea ${onChange}="${({ target }) => setMessage(target.value)}" id="msg-input" cols="80" rows="12">${msg}</textarea>
					<details>
						<summary>State Data</summary>
						<pre><code id="state"></code></pre>
					</details>
					<button type="button" class="btn btn-primary" ${onClick}="${pushItem}">Add item</button>
					<ol id="log" part="log"></ol>
					<ul id="list">${Array.from(list, item => `<li>${item}</li>`).join('\n')}
				</div>
			`,
			styles: `#msg {
				white-space: pre-wrap;
			}`
		});
	}

	async [SYMBOLS.render](type, { timestamp, state, shadow, diff }) {
		const record = document.createElement('li');
		record.textContent = `${type} @ ${timestamp}`;
		shadow.getElementById('log').append(record);

		switch(type) {
			case TRIGGERS.connected:
				observeDOMState(shadow.firstElementChild);
				observeStateChanges(arg => this.triggerUpdate(STATE_CHANGED, arg), 'msg', 'list');
				break;

			case TRIGGERS.disconnected:
				unobserveStateChanges(this);
				break;

			case STATE_CHANGED:
				saveState();

				if (diff.includes('msg')) {
					shadow.getElementById('msg').textContent = state.msg;
					const input = shadow.getElementById('msg-input');

					if (input.value !== state.msg) {
						input.value = state.msg;
					}
				}

				if (diff.includes('list')) {
					shadow.getElementById('list').replaceChildren(...Array.from(
						state.list,
						item => {
							const li = document.createElement('li');
							li.textContent = item;
							return li;
						}
					));
				}

				shadow.getElementById('state').textContent = JSON.stringify(state, null, 4);
				break;
		}
	}
}
document.body.append(html`
	<button type="button" popovertarget="popover" popovertargetaction="show">Show Popover</button>
	<p ${stateKey}="msg" ${statePropertyAttr}="innerHTML">${msg}</p>
	<button type="button" ${onClick}="${() => setHidden((state = hidden.valueOf()) => ! state)}" class="btn btn-system-accent">Toggle</button>
	<button type="button" ${onClick}="${() => setOpen(true)}" class="btn btn-system-accent">Show Modal</button>
	<input type="checkbox" name="open" ${onChange}="${changeHandler}" ${stateKeyAttribute}="open" ${statePropertyAttr}="checked" />
	<input type="file" accept="image/*" name="icon" ${onChange}="${changeHandler}" />
	<input type="text" ${onChange}="${changeHandler}" />
	<div contenteditable="true" data-name="nonInput" ${onInput}="${changeHandler}">${history.state?.nonInput ?? 'Lorem Ipsum!'}</div>
	<div ${onChange}="${changeHandler}">
		<label>
			<span>One</span>
			<input type="radio" name="radio" value="1" />
		</label>
		<label>
			<span>Two</span>
			<input type="radio" name="radio" value="2" />
		</label>
		<label>
			<span>Three</span>
			<input type="radio" name="radio" value="3" />
		</label>
	</div>
	<dialog id="test-dialog" ${onClose}="${() => setOpen(false)}">
		<div>
			<button type="button" ${onClick}="${() => setOpen(false)}" class="btn btn-rejct btn-danger">Close</button>
			<input type="checkbox" name="open" ${onChange}="${changeHandler}" ${stateKeyAttribute}="open" ${statePropertyAttr}="checked" />
			<p>Well, guess it works!</p>
			<input type="color" name="fill" ${onChange}="${changeHandler}" value="${fill}" ${stateKeyAttribute}="fill" ${stateAttrAttribute}="value" />
			<br />
			<svg id="svg-test" viewBox="0 0 100 100" fill="${fill}" height="500" width="500" ${stateKeyAttribute}="fill" ${stateAttrAttribute}="fill">
				<rect x="0" y="0" rx="10" ry="10" height="500" width="500"></rect>
			</svg>
		</div>
	</dialog>
`);

const popover = html`
	<div popover="auto" id="popover">
		<template shadowrootmode="open">
			<button type="button" popovertarget="popover" popovertargetaction="hide" part="button">Close</button>
			<div part="content">
				<slot name="content">No Content</slot>
			</div>
			<p contenteditable="true" ${onInput}="${({ target }) => setContent(target.textContent)}">${content}</p>
		</template>
		<p ${stateKeyAttribute}="content" slot="content">${content}</p>
	</div>
`;

const dialog = document.getElementById('test-dialog');
StatefulElemenet.register('stateful-el');
document.body.dataset[stateKey] = 'bg';
document.body.dataset[stateStyle] = 'background-color';
watchState();
observeEvents(document.documentElement);
observeDOMState(document.documentElement);
observeEvents(popover.firstElementChild.shadowRoot);
observeDOMState(popover.firstChild.shadowRoot);
bindState('#root', 'hidden', { attr: 'hidden' });
bindState('#img-result', 'file', { attr: 'src' });
createStateHandler('#test-dialog', 'open', (open, dialog) => open ? dialog.showModal() : dialog.close());
// popover.firstElementChild.shadowRoot.adoptedStyleSheets =

document.body.append(popover);
if (open.valueOf()) {
	dialog.showModal();
}
