import { ipcRenderer as ipc } from 'electron';

let loaded: boolean = false;
let issuer: number = -1;
let checkboxIds: string[] = [];
let sourceUrl: string = undefined;

type Purpose = {
  id: number;
  name: string;
  description: string;
  descriptionLegal: string;
};

type CookieWrappingIssuer = { command: 'issuer'; issuer: number };
type CookieWrappingResponse = { command: 'response'; response: object };
type CookieWrappingPolicy = {
  command: 'policy';
  policy: { purposes: Purpose[] };
  sourceUrl: string;
};
type CookieWrapping =
  | CookieWrappingIssuer
  | CookieWrappingResponse
  | CookieWrappingPolicy;

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
  // issuer = -1;
  e.returnValue = false;
  ipc.send('cookie-window', 'close');
};

window.addEventListener('DOMContentLoaded', () => {
  if (!loaded) {
    document.getElementById('submit-btn').addEventListener('click', (e) => {
      if (issuer < 0 || !sourceUrl) {
        console.error('issuer or source undefined');
        return;
      }
      console.log(`These are the settings: `);
      const policyReturn: { [checkId: number]: boolean } = {};
      for (const checkId of checkboxIds) {
        const checked = (document.getElementById(checkId) as HTMLInputElement)
          .checked;
        console.log(`${checkId}: ${checked}`);
        policyReturn[Number(checkId.replace(POLICY_PREFIX, ''))] = checked;
      }
      ipc.send('policy-choice', { issuer, sourceUrl, policyReturn });

      // close window after submission
      ipc.send('cookie-window', 'close');
    });

    document
      .getElementById('whitelist-clear-btn')
      .addEventListener('click', (e) => {
        ipc.send('cookie-whitelist', { issuer, cmd: 'clear' });
      });

    ipc.on('cookieChannel', (evt, arg: CookieWrapping) => {
      // arg: {command: string, [issuer/response]: Object}
      const containerDiv = document.getElementById('policy-container');
      if (arg.command === 'issuer' && issuer !== arg.issuer) {
        console.log(`issuer changed: ${issuer} -> ${arg.issuer}`);
        issuer = arg.issuer;
        containerDiv.innerHTML = '';
      } else if (arg.command === 'response') {
        console.log('response');
        containerDiv.innerHTML = '';
        // TODO: remove unsafe debug output
        document.getElementById('policy-container').innerHTML = JSON.stringify(
          arg.response,
          null,
          2,
        );
      } else if (arg.command === 'policy') {
        console.log('policy');
        containerDiv.innerHTML = '';
        // Create HTML for displaying the policy
        sourceUrl = arg.sourceUrl;
        const headline = createHTML('h3', undefined, `URL: ${sourceUrl}`);
        containerDiv.appendChild(headline);

        const policyList = createHTML('ul', { className: 'policy-list' });
        for (const purpose of arg.policy.purposes) {
          const policyListEntry = createHTML('li', {
            className: 'policy-list-entry',
          });

          const checkbox = createHTML('input', {
            type: 'checkbox',
            id: `${POLICY_PREFIX}${purpose.id}`,
          });
          // Collect ids to read out the values later
          checkboxIds.push(checkbox.id);
          policyListEntry.appendChild(checkbox);

          const label = createHTML(
            'label',
            { for: checkbox.id },
            `${purpose.id}: ${purpose.name}; ${purpose.description}`,
          );
          policyListEntry.appendChild(label);
          policyList.appendChild(policyListEntry);
        }
        containerDiv.appendChild(policyList);
      }
    });
  }
  loaded = true;
});
