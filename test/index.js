import { observeStateChanges, unobserveStateChanges, manageState, watchState, saveState, setState, observeDOMState, bindState, stateKeyAttribute, stateAttrAttribute, createStateHandler, stateStyleAttribute, stateStyle, stateKey } from '@aegisjsproject/state';
import { html } from '@aegisjsproject/core/parsers/html.js';
import { AegisComponent } from '@aegisjsproject/component/base.js';
import { SYMBOLS, TRIGGERS } from '@aegisjsproject/component/consts.js';
import { registerCallback, observeEvents } from '@aegisjsproject/callback-registry/callbackRegistry.js';
import { EVENTS } from '@aegisjsproject/callback-registry/events.js';

const STATE_CHANGED = 'aegis:state:changed';
const [msg, setMessage] = manageState('msg', 'Hello, World!');
const [list, setList] = manageState('list', [1]);
const [hidden, setHidden] = manageState('hidden', false);
const [open, setOpen] = manageState('open', false);
const [fill, setFill] = manageState('fill', '#ff0000');
const [bg, setBg] = manageState('bg', 'inherit');

const iter = Iterator.range(list.at(-1) + 1, Infinity);
const pushItem = registerCallback('push:item', () => setList(list.concat(iter.next().value)));

class StatefulElemenet extends AegisComponent {
	constructor() {
		super({
			template: html`
				<div part="container">
					<input type="file" accept="image/*" ${EVENTS.onChange}="${({ target }) => setState('file', target.files.length === 1 ? target.files[0] : null )}" />
					<input type="color" value="${bg}" ${EVENTS.onChange}="${({ target }) => setBg(target.value)}" />
					<p part="message" id="msg">${msg}</p>
					<p>Update below to change message.</p>
					<textarea ${EVENTS.onChange}="${({ target }) => setMessage(target.value)}" id="msg-input" cols="80" rows="12">${msg}</textarea>
					<details>
						<summary>State Data</summary>
						<pre><code id="state"></code></pre>
					</details>
					<button type="button" class="btn btn-primary" ${EVENTS.onClick}="${pushItem}">Add item</button>
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
	<button type="button" ${EVENTS.onClick}="${() => setHidden(! hidden.valueOf())}" class="btn btn-system-accent">Toggle</button>
	<button type="button" ${EVENTS.onClick}="${() => setOpen(true)}" class="btn btn-system-accent">Show Modal</button>
	<dialog id="test-dialog" ${EVENTS.onClose}="${() => setOpen(false)}">
		<div>
			<button type="button" ${EVENTS.onClick}="${() => setOpen(false)}" class="btn btn-rejct btn-danger">Close</button>
			<p>Well, guess it works!</p>
			<input type="color" ${EVENTS.onChange}="${({ target }) => setFill(target.value)}" value="${fill}" />
			<br />
			<svg id="svg-test" viewBox="0 0 100 100" fill="${fill}" height="500" width="500" ${stateKeyAttribute}="fill" ${stateAttrAttribute}="fill">
				<rect x="0" y="0" rx="10" ry="10" height="500" width="500"></rect>
			</svg>
		</div>
	</dialog>
`);

const dialog = document.getElementById('test-dialog');
StatefulElemenet.register('stateful-el');
document.body.dataset[stateKey] = 'bg';
document.body.dataset[stateStyle] = 'background-color';
watchState();
observeEvents(document.body);
observeDOMState();
bindState('#root', 'hidden', { attr: 'hidden' });
bindState('#img-result', 'file', { attr: 'src' });
createStateHandler('#test-dialog', 'open', (open, dialog) => open ? dialog.showModal() : dialog.close());

if (open.valueOf()) {
	dialog.showModal();
}
