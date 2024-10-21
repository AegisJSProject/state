import { observeStateChanges, unobserveStateChanges, manageState, watchState, saveState } from '@aegisjsproject/state';
import { html } from '@aegisjsproject/core/parsers/html.js';
import { AegisComponent } from '@aegisjsproject/component/base.js';
import { SYMBOLS, TRIGGERS } from '@aegisjsproject/component/consts.js';
import { registerCallback } from '@aegisjsproject/core/callbackRegistry.js';
import { EVENTS } from '@aegisjsproject/core/events.js';

const STATE_CHANGED = 'aegis:state:changed';

const [msg, setMessage] = manageState('msg', 'Hello, World!');
const [list] = manageState('list', ['one', 'two', 'three']);
const updateMessage = registerCallback('update:msg', ({ target }) => setMessage(target.value));

class StatefulElemenet extends AegisComponent {
	constructor() {
		super({
			template: html`
				<div part="container">
					<p part="message" id="msg">${msg}</p>
					<p>Update below to change message.</p>
					<textarea ${EVENTS.onChange}="${updateMessage}" id="msg-input" cols="80" rows="12">${msg}</textarea>
					<details>
						<summary>State Data</summary>
						<pre><code id="state"></code></pre>
					</details>
					<ol id="log" part="log"></ol>
					<ul id="list">${Array.from(list, item => `<li>${item}</li>`)}
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

StatefulElemenet.register('stateful-el');
watchState();
