import { ipcRenderer as ipc } from 'electron';

let loaded: boolean = false;
let issuer: number = -1;
let checkboxIds: string[] = [];
// let url: URL = undefined;
let visitorId = '';

type Purpose = { name: string; description: string; descriptionLegal: string };

const POLICY_PREFIX = 'policy-';

function createHTML(
  tag: string,
  attrs?: { [k: string]: string },
  text?: string,
): HTMLElement {
  const out = document.createElement(tag);
  if (text !== undefined) {
    const txt = document.createTextNode(text);
    out.appendChild(txt);
  }
  if (attrs !== undefined) {
    for (const [k, v] of Object.entries(attrs)) {
      out.setAttribute(k, v);
    }
  }
  return out;
}

window.onbeforeunload = (e: BeforeUnloadEvent) => {
  // prevent window from being closed by decorations
  e.preventDefault();
  issuer = -1;
  e.returnValue = false;
  ipc.send('cookie-window', 'close');
};

window.addEventListener('DOMContentLoaded', () => {
  if (!loaded) {
    document.getElementById('submit-btn').addEventListener('click', (e) => {
      if (issuer < 0 || visitorId === '') {
        console.error('issuer or visitorId undefined');
        return;
      }
      console.log(`These are the settings: `);
      const policyReturn: { [checkId: string]: boolean } = {};
      for (const checkId of checkboxIds) {
        const checked = (document.getElementById(checkId) as HTMLInputElement)
          .checked;
        console.log(`${checkId}: ${checked}`);
        policyReturn[checkId.replace(POLICY_PREFIX, '')] = checked;
      }
      ipc.send('policy-choice', { issuer, visitorId, policyReturn });

      // close window after submission
      // issuer = -1;
      // ipc.send('cookie-window', 'close');
    });

    document
      .getElementById('whitelist-clear-btn')
      .addEventListener('click', (e) => {
        ipc.send('cookie-whitelist', { issuer, cmd: 'clear' });
      });

    ipc.on('cookieChannel', (evt, arg) => {
      // arg: {command: string, [issuer/response]: Object}
      if (typeof arg === 'object' && typeof arg['command'] === 'string') {
        // remove the old dynamic content before displayin the new one
        document
          .getElementById('policy-container')
          .childNodes.forEach((e) => e.remove());
        if (arg['command'] === 'issuer') {
          issuer = arg['issuer'];
          console.log(`Cookie Channel Issuer: ${issuer}`);
        } else if (arg['command'] === 'response') {
          // TODO: remove unsafe debug output
          document.getElementById(
            'policy-container',
          ).innerHTML = JSON.stringify(arg['response'], null, 2);
        } else if (arg['command'] === 'policy') {
          // Create HTML for displaying the policy
          visitorId = arg['policy']['visitorId'];
          const visitorIdP = createHTML(
            'p',
            undefined,
            `Visitor ID: ${visitorId}`,
          );
          document.getElementById('policy-container').appendChild(visitorIdP);

          const policyList = createHTML('ul', { className: 'policy-list' });
          for (const [k, v] of Object.entries<Purpose>(
            arg['policy']['purposes'],
          )) {
            const policyListEntry = createHTML('li', {
              className: 'policy-list-entry',
            });

            const checkbox = createHTML('input', {
              type: 'checkbox',
              id: `${POLICY_PREFIX}${k}`,
            });
            // Collect ids to read out the values later
            checkboxIds.push(checkbox.id);
            policyListEntry.appendChild(checkbox);

            const label = createHTML(
              'label',
              { for: checkbox.id },
              `${k}: ${v.name}`,
            );
            policyListEntry.appendChild(label);
            policyList.appendChild(policyListEntry);
          }
          document.getElementById('policy-container').appendChild(policyList);
        } else {
          console.log(`Unknown command "${arg['command']}"`);
        }
      } else {
        console.log('Invalid argument for cookieChannel');
      }
    });
  }
  loaded = true;
});
