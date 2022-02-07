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
  policy: { purposes: Purpose[]; purposeChoice?: { [key: number]: boolean } };
  sourceUrl: string;
  issuer: number;
};
type CookieWrappingMessage = {
  command: 'message';
  issuer: number;
  headline: string;
  message: string;
};
type CookieWrapping =
  | CookieWrappingIssuer
  | CookieWrappingResponse
  | CookieWrappingPolicy
  | CookieWrappingMessage;

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

function historyBack() {
  console.log('clicked button');
  closeWindow();
  ipc.send('cookie-window', { issuer, action: 'historyBack' });
}

function resetWindow() {
  const pc = createHTML('div', { id: 'policy-container' });
  const sbtn = createHTML('button', { id: 'submit-btn' }, 'Submit Preferences');
  const wbtn = createHTML(
    'button',
    { id: 'whitelist-clear-btn' },
    '<Clear Whitelist>',
  );
  document.body.innerHTML = '';
  sbtn.addEventListener('click', () => {
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
    closeWindow();
  });
  wbtn.addEventListener('click', (e) => {
    ipc.send('cookie-whitelist', { issuer, cmd: 'clear' });
    closeWindow();
  });
  document.body.appendChild(pc);
  document.body.appendChild(sbtn);
  document.body.appendChild(wbtn);
}

function closeWindow() {
  // restore defaults:
  resetWindow();
  ipc.send('cookie-window', { issuer, action: 'close' });
}

window.onbeforeunload = (e: BeforeUnloadEvent) => {
  // prevent window from being closed by decorations
  e.preventDefault();
  // issuer = -1;
  e.returnValue = false;
  closeWindow();
};

window.addEventListener('DOMContentLoaded', () => {
  if (!loaded) {
    resetWindow();

    ipc.on('cookieChannel', (evt, arg: CookieWrapping) => {
      // arg: {command: string, [issuer/response]: Object}
      const containerDiv = document.getElementById('policy-container');
      if (arg.command === 'issuer' && issuer !== arg.issuer) {
        console.log(`issuer changed: ${issuer} -> ${arg.issuer}`);
        issuer = arg.issuer;
      } else if (arg.command === 'response') {
        console.log('response');
        // TODO: remove unsafe debug output
        document.getElementById('policy-container').innerHTML = JSON.stringify(
          arg.response,
          null,
          2,
        );
      } else if (arg.command === 'policy') {
        console.log('policy');
        issuer = arg.issuer;
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
          }) as HTMLInputElement;
          checkbox.checked =
            arg.policy.purposeChoice && arg.policy.purposeChoice[purpose.id];
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
      } else if (arg.command === 'message') {
        console.log('somehow this got painted without removing first');
        issuer = arg.issuer;
        const headline = createHTML('h3', undefined, arg.headline);
        containerDiv.appendChild(headline);
        const text = createHTML('p', undefined, arg.message);
        containerDiv.appendChild(text);
        // remove default buttons and place "history back" button
        document.getElementById('submit-btn').remove();
        document.getElementById('whitelist-clear-btn').remove();
        const backButton = createHTML('button', { id: 'back' }, 'Go back');
        backButton.addEventListener('click', () => historyBack());
        containerDiv.appendChild(backButton);
      }
    });
  }
  loaded = true;
});
