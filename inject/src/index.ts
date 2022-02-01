import { independent, sites } from '../res/list.json';
import { TCData } from './static';

type StringDict = {
  [name: string]: string[];
};

type removeCallback = (success: boolean) => void;
type addCallback = (tcData: TCData, success: boolean) => void;

type TCFWindow = Window &
  typeof globalThis & {
    __tcfapi(
      fname: string,
      version: number,
      callback: addCallback | removeCallback,
      listenerId?: number,
    ): void;
  };

// Vendor List: https://vendor-list.consensu.org/v2/vendor-list.json
// Vendor List with version https://vendor-list.consensu.org/v2/archives/vendor-list-v{VERSION-Number}.json
// purpose-translation see: https://vendor-list.consensu.org/v2/purposes-de.json
// CMP lists: v2: https://cmplist.consensu.org/v2/cmp-list.json v1: https://cmplist.consensu.org/cmp-list.json

// TODO: next up: cookies, comparison with and without consent and before interacting with the banner
// TCF offers API to CMPs that is compliant to GDPR. CMPs have to be registered with IAB Europe
export function bannerSearcher() {
  if (
    document.body.innerHTML.includes('__tcfapi') &&
    'function' === typeof (window as TCFWindow).__tcfapi
  ) {
    // TODO!! function can be in loaded scripts and not in body. what about iframes?
    // (window as TCFWindow).__tcfapi(
    //   'getTCData',
    //   0,
    //   (tcData: TCData, success: boolean) => {
    //     if (success) {
    //       for (const o of Object.entries(tcData)) {
    //         console.log(o);
    //       }
    //       const div = document.createElement('div');
    //       const textnode = document.createTextNode(tcData.tcString);
    //       div.appendChild(textnode);
    //       div.style.zIndex = '2147483647';
    //       div.style.top = '100px';
    //       div.style.position = 'fixed';
    //       div.style.height = '100px';
    //       div.style.margin = '0 auto';
    //       div.style.color = 'white';
    //       div.style.background = '#BE1E3C';
    //       // document.body.appendChild(div);
    //     }
    //   },
    // );
    // alert('TCF API call found!');
    (window as TCFWindow).__tcfapi(
      'addEventListener',
      0,
      (tcData: TCData, success: boolean) => {
        if (!success) {
          return;
        }
        if (tcData.eventStatus === 'cmpuishown') {
          // show own banner on top while other banner is shown
          alert('show banner');
        } else if (tcData.eventStatus === 'useractioncomplete') {
          // evaluate interaction with own banner and write to tcData?
          alert('interacted with banner');
          // deregister this listener
          (window as TCFWindow).__tcfapi(
            'removeEventListener',
            0,
            (success: boolean) => {},
            tcData.listenerId,
          );
        } else if (tcData.eventStatus === 'tcloaded') {
          // deregister this listener
          (window as TCFWindow).__tcfapi(
            'removeEventListener',
            0,
            (success: boolean) => {},
            tcData.listenerId,
          );
        }
      },
    );
  }
  // else {
  //   console.log('No TCF API call found');
  //   let url = document.baseURI.split('/')[2];
  //   if (url.startsWith('www.')) {
  //     url = url.substring(4);
  //   }
  //   if (url === 'localhost' || url === '127.0.0.1') {
  //     return;
  //   }
  //   if (url in sites) {
  //     const selector = (sites as StringDict)[url].join(',');
  //     const result = document.body.querySelectorAll(selector);
  //     if (result.length > 0) {
  //       for (const r of result) {
  //         console.log(r.outerHTML);
  //       }
  //       alert(`Found CSS Element for site ${url}`);
  //     } else {
  //       alert(
  //         `Did not find CSS Element for site ${url} with selector ${selector}`,
  //       );
  //     }
  //   } else {
  //     const selector = independent.join(',');
  //     const result = document.body.querySelectorAll(selector);
  //     if (result.length > 0) {
  //       for (const r of result) {
  //         console.log(r.outerHTML);
  //       }
  //       alert(`Found general CSS Element`);
  //     } else {
  //       alert('Found nothing');
  //     }
  //   }
  // }
}

bannerSearcher();
