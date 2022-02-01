import {
  BrowserView,
  app,
  ipcMain,
  Cookies,
  Event,
  Cookie,
  CookiesSetDetails,
  dialog,
  BrowserWindow,
  webFrame,
} from 'electron';
import { parse as parseUrl } from 'url';
import { getViewMenu } from './menus/view';
import { AppWindow } from './windows';
import { IHistoryItem, IBookmark, ICookiePolicyItem } from '~/interfaces';
import {
  ERROR_PROTOCOL,
  NETWORK_ERROR_HOST,
  WEBUI_BASE_URL,
} from '~/constants/files';
import { NEWTAB_URL } from '~/constants/tabs';
import {
  ZOOM_FACTOR_MIN,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_INCREMENT,
} from '~/constants/web-contents';
import { TabEvent } from '~/interfaces/tabs';
import { Queue } from '~/utils/queue';
import { Application } from './application';
import { getUserAgentForURL } from './user-agent';

import { readFile } from 'fs';
import { join } from 'path';
import { TCData, TCFWindow } from './tcfwindow';
import { v4 as uuid } from 'uuid';
import { request } from 'http';
import { transmitJSON } from './network/request';
import { UUID } from '~/utils';

interface IAuthInfo {
  url: string;
}

type CookieEvent = {
  event: Event;
  cookie: Cookie;
  cause: 'explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite';
  removed: boolean;
};

type TempCookieJar = {
  [url: string]: CookieEvent[];
};

const activationCookie: CookiesSetDetails = {
  url: 'http://localhost',
  name: 'myActivationCookie',
  value: 'useTempJar',
};
const deactivationCookie: CookiesSetDetails = {
  url: 'http://localhost',
  name: 'myActivationCookie',
  value: 'dontUseTempJar',
};

function checkCookie(cookie: Cookie, activation: CookiesSetDetails): boolean {
  return (
    activation.url.includes(cookie.domain) &&
    cookie.name === activation.name &&
    cookie.value === activation.value
  );
}

function checkURL(urlString: string): { valid: boolean; url: URL } {
  if (!urlString || urlString === '') {
    return { valid: false, url: undefined };
  }
  // check scheme or prepend http
  if (!urlString.includes('://')) {
    urlString = `http://${urlString}`;
  }
  return { valid: true, url: new URL(urlString) };
}

export class View {
  public browserView: BrowserView;

  public isNewTab = false;
  public homeUrl: string;
  public favicon = '';
  public incognito = false;

  public errorURL = '';

  private hasError = false;

  private window: AppWindow;

  public bounds: any;

  public lastHistoryId: string;

  public bookmark: IBookmark;

  public findInfo = {
    occurrences: '0/0',
    text: '',
  };

  public requestedAuth: IAuthInfo;
  public requestedPermission: any;

  private historyQueue = new Queue();

  private lastUrl = '';

  private tempCookieJar: TempCookieJar = {};
  private useTempJar: boolean = false;
  private nativeCookieBannerWindow: BrowserWindow;
  private nativeCookieBannerWindowReady = false;

  public constructor(window: AppWindow, url: string, incognito: boolean) {
    this.browserView = new BrowserView({
      webPreferences: {
        preload: `${app.getAppPath()}/build/view-preload.bundle.js`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        enableRemoteModule: false,
        partition: incognito ? 'view_incognito' : 'persist:view',
        plugins: true,
        nativeWindowOpen: true,
        webSecurity: true,
        javascript: true,
        worldSafeExecuteJavaScript: false,
      },
    });

    this.incognito = incognito;

    this.webContents.userAgent = getUserAgentForURL(
      this.webContents.userAgent,
      '',
    );

    (this.webContents as any).windowId = window.win.id;

    this.window = window;
    this.homeUrl = url;

    this.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        const { object: settings } = Application.instance.settings;
        if (settings.doNotTrack) details.requestHeaders['DNT'] = '1';
        callback({ requestHeaders: details.requestHeaders });
      },
    );

    this.nativeCookieBannerWindow = new BrowserWindow({
      parent: this.window.win,
      // modal: true,
      minimizable: false,
      maximizable: false,
      title: 'Cookie Policy Manager',
      show: false,
      webPreferences: {
        preload: join(app.getAppPath(), 'cookiebanner', 'build', 'preload.js'),
      },
    });
    this.nativeCookieBannerWindow.loadFile(
      join(app.getAppPath(), 'cookiebanner', 'res', 'banner.html'),
    );
    this.nativeCookieBannerWindow.once('ready-to-show', () => {
      this.nativeCookieBannerWindowReady = true;
    });

    const cookies = this.webContents.session.cookies;
    // cookies.removeAllListeners();
    // cookies.addListener('changed', (event, cookie, cause, removed) => {
    //   // console.log(cookie.domain);
    //   var url = cookie.domain;
    //   if (url.startsWith('.')) {
    //     url = `www${url}`;
    //   }
    //   if (!url.startsWith('http')) {
    //     url = `http://${url}`;
    //   }
    //   console.log(`Cookie change cause: ${cause}`);

    //   // this.tempCookieJar.emit('changed', event, cookie, cause, removed);
    //   // cookies
    //   //   .set({ url, name: cookie.name, value: cookie.value })
    //   //   .then(() => {
    //   //     console.log('done');
    //   //   })
    //   //   .catch((r) => {
    //   //     console.log(r);
    //   //   });
    //   // deactivation
    //   if (checkCookie(cookie, activationCookie)) {
    //     console.log('activate JAR');
    //     this.useTempJar = true;
    //   } else if (checkCookie(cookie, deactivationCookie)) {
    //     console.log('deactivate JAR');
    //     this.useTempJar = false;
    //   } else {
    //     if (this.useTempJar) {
    //       // cookies
    //       //   .remove(url, cookie.name)
    //       //   .then(() => {
    //       //     console.log(`removed ${cookie.name} from ${cookie.domain}`);
    //       //   })
    //       //   .catch((r) => {
    //       //     console.log(r);
    //       //   });
    //       // cookies.flushStore();
    //       this.addToJar(url, { event, cookie, cause, removed });
    //       this.webContents.session.clearStorageData({ storages: ['cookies'] });
    //     }
    //   }
    //   // console.log(JSON.stringify(this.tempCookieJar, null, 2));
    // });

    // this.webContents.session.cookies.addListener(
    //   'changed',
    //   (event, cookie, cause, removed) => {
    //     console.log(
    //       `Cookies changed: \nEvent: ${JSON.stringify(
    //         event,
    //       )}\nCookie: ${JSON.stringify(cookie)}\nCause: ${JSON.stringify(
    //         cause,
    //       )}\nRemoved: ${removed}`,
    //     );
    //     if (!removed) {
    //       cookies.removeAllListeners()
    //       this.webContents.session.cookies
    //         .set({
    //           url: cookie.domain,
    //           name: cookie.name,
    //           value: '',
    //         })
    //         .then(() => {
    //           console.log(`reset ${cookie.} :: ${cookie.name}`);
    //         })
    //         .catch((reason) => {
    //           console.log(`ERROR: ${reason}`);
    //         });
    //       // this.webContents.session.cookies
    //       //   .remove(cookie.domain, cookie.name)
    //       //   .then((v) => {
    //       //     this.webContents.session.cookies
    //       //       .get({ url: cookie.domain, name: cookie.name })
    //       //       .then((v) => {
    //       //         console.log(v);
    //       //       });
    //       //   })
    //       //   .catch((r) => {
    //       //     console.log('error: ', r);
    //       //   });
    //       this.webContents.session.cookies.flushStore().catch((r) => {
    //         console.log(`could not flush: ${r}`);
    //       });
    //     }
    //     console.log('');
    //   },
    // );

    ///////////////////// Proxy for BurpSuite /////////////////////
    // const proxyConfig: Electron.Config = {
    //   mode: 'fixed_servers',
    //   proxyRules: 'http=127.0.0.1:8080;https=127.0.0.1:8080',
    // };
    // this.webContents.session.setProxy(proxyConfig);
    ///////////////////////////////////////////////////////////////

    ipcMain.handle(`get-error-url-${this.id}`, async (e) => {
      return this.errorURL;
    });

    this.webContents.on('context-menu', (e, params) => {
      const menu = getViewMenu(this.window, params, this.webContents);
      menu.popup();
    });

    this.webContents.addListener('found-in-page', (e, result) => {
      Application.instance.dialogs
        .getDynamic('find')
        .browserView.webContents.send('found-in-page', result);
    });

    this.webContents.addListener('page-title-updated', (e, title) => {
      this.window.updateTitle();
      this.updateData();

      this.emitEvent('title-updated', title);
      this.updateURL(this.webContents.getURL());
    });

    this.webContents.addListener('did-navigate', async (e, url) => {
      this.emitEvent('did-navigate', url);

      await this.addHistoryItem(url);
      this.updateURL(url);
    });

    this.webContents.addListener(
      'did-navigate-in-page',
      async (e, url, isMainFrame) => {
        if (isMainFrame) {
          this.emitEvent('did-navigate', url);

          await this.addHistoryItem(url, true);
          this.updateURL(url);
        }
      },
    );

    this.webContents.addListener('did-stop-loading', () => {
      this.updateNavigationState();
      this.emitEvent('loading', false);
      this.updateURL(this.webContents.getURL());
    });

    this.webContents.addListener('did-start-loading', () => {
      this.hasError = false;
      this.updateNavigationState();
      this.emitEvent('loading', true);
      this.updateURL(this.webContents.getURL());
    });

    this.webContents.addListener('did-start-navigation', async (e, ...args) => {
      this.updateNavigationState();

      this.favicon = '';

      this.emitEvent('load-commit', ...args);
      this.updateURL(this.webContents.getURL());
    });

    this.webContents.on(
      'did-start-navigation',
      (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return;
        const newUA = getUserAgentForURL(this.webContents.userAgent, url);
        if (this.webContents.userAgent !== newUA) {
          this.webContents.userAgent = newUA;
        }
      },
    );

    this.webContents.addListener(
      'new-window',
      (e, url, frameName, disposition) => {
        if (disposition === 'new-window') {
          if (frameName === '_self') {
            e.preventDefault();
            this.window.viewManager.selected.webContents.loadURL(url);
          } else if (frameName === '_blank') {
            e.preventDefault();
            this.window.viewManager.create(
              {
                url,
                active: true,
              },
              true,
            );
          }
        } else if (disposition === 'foreground-tab') {
          e.preventDefault();
          this.window.viewManager.create({ url, active: true }, true);
        } else if (disposition === 'background-tab') {
          e.preventDefault();
          this.window.viewManager.create({ url, active: false }, true);
        }
      },
    );

    this.webContents.addListener('did-finish-load', async () => {
      console.log(
        `finished loading ${this.webContents.getTitle()} ${this.webContents.getURL()}`,
      );

      // setup my HttpRequest to request CookiePolicyManager
      // try {
      const showBanner = this.handleCookiePolicy();
      console.log(`Show banner? ${showBanner}`);

      // if (this.useTempJar) {
      // console.log('clearing browser cookies. Before:');
      // (await this.webContents.session.cookies.get({})).forEach((v) =>
      //   console.log(`${v.domain}: ${v.name}=${v.value}`),
      // );
      // console.log('\n\nJAR before:');
      // Object.entries(this.tempCookieJar).forEach(([k, v]) =>
      //   v.forEach((evt) =>
      //     console.log(
      //       `${k}: ${evt.cookie.domain} :: ${evt.cookie.name}=${evt.cookie.value}`,
      //     ),
      //   ),
      // );
      // console.log('\n\n\n');
      // // cookies
      // //   .set(deactivationCookie)
      // //   .then(() => {
      // this.webContents.session.clearStorageData({
      //   storages: ['cookies'],
      //   origin: 'http://www.metal-hammer.de',
      // });
      // })
      // .catch((r) => {
      //   console.log(r);
      // })
      // .finally(async () => {
      //   cookies.set(activationCookie);
      // console.log('\n\n\nSession after');
      // (await this.webContents.session.cookies.get({})).forEach((v) =>
      //   console.log(`${v.domain}: ${v.name}=${v.value}`),
      // );
      // console.log('\n\nJAR after:');
      // Object.entries(this.tempCookieJar).forEach(([k, v]) =>
      //   v.forEach((evt) =>
      //     console.log(
      //       `${k}: ${evt.cookie.domain} :: ${evt.cookie.name}=${evt.cookie.value}`,
      //     ),
      //   ),
      // );
      // });
      // }

      if (this.webContents.getURL() !== 'http://localhost:4444/newtab.html') {
        // search for __tcfapi, see view-preload.ts
        // this.send('tcfapi-grabber');

        // show cookie banner; TODO: only show when no policy present
        if (this.nativeCookieBannerWindowReady) {
          this.nativeCookieBannerWindow.show();
          this.nativeCookieBannerWindow.webContents.openDevTools();
          this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
            command: 'issuer',
            issuer: this.webContents.id,
          });
          // } else {
          //   console.log('Window not ready yet :(');
        }
      }

      // inject my js window
      // readFile(
      //   join(app.getAppPath(), 'inject/build/inject.js'),
      //   'utf-8',
      //   (err, data) => {
      //     // console.log( );
      //     console.log('reading file...');
      //     this.cookieNomster = data;
      //     if (err) console.log(err, data);
      //   },
      // );
      // await this.webContents.executeJavaScript(this.cookieNomster);

      // console.log(result);
      //console.log('executed script');
    });

    ipcMain.on('cookie-window', (evt, arg) => {
      if (arg === 'close') {
        this.nativeCookieBannerWindow.hide();
      } else {
        // only needed for debug
        console.log(`Message received: ${arg}`);
      }
    });

    // send received TCData from the Content window to the Banner window
    ipcMain.on('tcdata', (evt, tcdata) => {
      this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
        command: 'response',
        response: tcdata,
      });
    });

    // interaction with the cookie banner ///////////////////////////////////////////////
    ipcMain.on(
      'cookie-whitelist',
      async (evt, arg: { issuer: number; cmd?: string }) => {
        // This event is sent to all instances (tabs, windows) so we have to filter with the "issuer"
        if (arg.issuer === this.webContents.id) {
          if (arg.cmd === 'clear') {
            await Application.instance.storage.clearCookiePolicy();
            console.log('cleared');
            // } else if (arg.cmd === 'add') {
            //   console.log('DEPRECATED: add');
            // const url = new URL(this.webContents.getURL());
            // console.log(url);
            // const item: ICookiePolicyItem = {
            //   url: url.hostname,
            //   allowed: true,
            // };
            // await Application.instance.storage.addCookiePolicyItem(item);

            // const l = await Application.instance.storage.find<ICookiePolicyItem>(
            //   { scope: 'cookiewhitelist', query: {} },
            // );
            // l.forEach((i) => {
            //   console.log(i);
            // });
          } else {
            console.log(`unknown command: "${arg.cmd}"`);
          }
        }
      },
    );

    ipcMain.on(
      'policy-choice',
      async (
        evt,
        arg: {
          issuer: number;
          visitorId: UUID;
          policyReturn: { [key: string]: boolean };
        },
      ) => {
        const { issuer, visitorId, policyReturn } = arg;
        if (issuer === this.webContents.id) {
          // Save choice in database
          const item: ICookiePolicyItem = {
            visitorId,
            purposes: policyReturn,
            isSet: true,
          };
          Application.instance.storage.addOrUpdateCookiePolicyItem(item);

          console.log('Successfully added entry to policy storage.');
          const origin = (
            await Application.instance.storage.findOne<ICookiePolicyItem>({
              scope: 'cookiepolicy',
              query: { visitorId },
            })
          ).url;
          let url: URL = checkURL(origin).url;

          // Send choice to server
          transmitJSON(url, {
            policyReturn,
            visitorId,
          })
            .then(async () => {
              console.log('Successfully transmitted user policy.');
              // now set cookie with visitorId and re-request other cookies
              await cookies.set({
                url: origin,
                name: 'visitorId',
                value: visitorId,
              });
              this.webContents.reload();
            })
            .catch((error) => {
              console.log(error);
            });
        }
      },
    );

    this.webContents.addListener(
      'did-fail-load',
      (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
        // ignore -3 (ABORTED) - An operation was aborted (due to user action).
        if (isMainFrame && errorCode !== -3) {
          this.errorURL = validatedURL;

          this.hasError = true;

          this.webContents.loadURL(
            `${ERROR_PROTOCOL}://${NETWORK_ERROR_HOST}/${errorCode}`,
          );
        }
      },
    );

    this.webContents.addListener(
      'page-favicon-updated',
      async (e, favicons) => {
        this.favicon = favicons[0];

        this.updateData();

        try {
          let fav = this.favicon;

          if (fav.startsWith('http')) {
            fav = await Application.instance.storage.addFavicon(fav);
          }

          this.emitEvent('favicon-updated', fav);
        } catch (e) {
          this.favicon = '';
          // console.error(e);
        }
      },
    );

    this.webContents.addListener('zoom-changed', (e, zoomDirection) => {
      const newZoomFactor =
        this.webContents.zoomFactor +
        (zoomDirection === 'in'
          ? ZOOM_FACTOR_INCREMENT
          : -ZOOM_FACTOR_INCREMENT);

      if (
        newZoomFactor <= ZOOM_FACTOR_MAX &&
        newZoomFactor >= ZOOM_FACTOR_MIN
      ) {
        this.webContents.zoomFactor = newZoomFactor;
        this.emitEvent('zoom-updated', this.webContents.zoomFactor);
        window.viewManager.emitZoomUpdate();
      } else {
        e.preventDefault();
      }
    });

    this.webContents.addListener(
      'certificate-error',
      (
        event: Electron.Event,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: Function,
      ) => {
        console.log(certificate, error, url);
        // TODO: properly handle insecure websites.
        event.preventDefault();
        callback(true);
      },
    );

    this.webContents.addListener('media-started-playing', () => {
      this.emitEvent('media-playing', true);
    });

    this.webContents.addListener('media-paused', () => {
      this.emitEvent('media-paused', true);
    });

    if (url.startsWith(NEWTAB_URL)) this.isNewTab = true;

    this.webContents.loadURL(url);

    this.browserView.setAutoResize({
      width: true,
      height: true,
      horizontal: false,
      vertical: false,
    });
  }

  /**
   * chack for present policy and request one if necessary
   * @returns true if native cookie banner should be displayed
   */
  private handleCookiePolicy(): boolean {
    const { valid, url } = checkURL(this.webContents.getURL());
    if (!valid || url.hostname === 'localhost') {
      return false;
    }
    const policy = Application.instance.storage.findPolicyByURL(url.href);
    if (policy && policy.isSet) {
      console.log(`Policy existing:`);
      console.log(policy);
      return false;
    }
    // generate UUID for this site and send it to [hostname]/CookiePolicyManager
    const visitorId = policy ? policy.visitorId : uuid();
    const visitedSite = url.href;
    type ResponseType = {
      visitorId: UUID;
      scope: string;
      purposes: { [key: string]: Object };
    };
    transmitJSON(url, { visitorId, visitedSite })
      .then((response: ResponseType) => {
        if (
          !checkURL(response.scope).valid ||
          !visitedSite.includes(response.scope)
        ) {
          // TODO Check that scope is at least website domain
          console.error(
            `Defined scope (${response.scope}) does not contain browsed URL (${visitedSite}) or is invalid!`,
          );
          return;
        }
        // Store in CookiePolicy
        const item: ICookiePolicyItem = {
          isSet: false,
          url: url.origin,
          scope: response.scope,
          visitorId: visitorId,
        };
        Application.instance.storage.addOrUpdateCookiePolicyItem(item);

        this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
          command: 'policy',
          policy: response,
          url: url,
        });
        console.log('Received Policy template from server.');
      })
      .catch((error) => {
        console.log(error);
      });
    return true;
  }

  private addToJar(url: string, cookieEvent: CookieEvent): void {
    if (!Object.keys(this.tempCookieJar).includes(url)) {
      this.tempCookieJar[url] = [];
    }
    this.tempCookieJar[url].push(cookieEvent);
  }

  public get webContents() {
    return this.browserView.webContents;
  }

  public get url() {
    return this.webContents.getURL();
  }

  public get title() {
    return this.webContents.getTitle();
  }

  public get id() {
    return this.webContents.id;
  }

  public get isSelected() {
    return this.id === this.window.viewManager.selectedId;
  }

  public updateNavigationState() {
    if (this.browserView.webContents.isDestroyed()) return;

    if (this.window.viewManager.selectedId === this.id) {
      this.window.send('update-navigation-state', {
        canGoBack: this.webContents.canGoBack(),
        canGoForward: this.webContents.canGoForward(),
      });
    }
  }

  public destroy() {
    (this.browserView.webContents as any).destroy();
    this.browserView = null;
  }

  public async updateCredentials() {
    if (
      !process.env.ENABLE_AUTOFILL ||
      this.browserView.webContents.isDestroyed()
    )
      return;

    const item = await Application.instance.storage.findOne<any>({
      scope: 'formfill',
      query: {
        url: this.hostname,
      },
    });

    this.emitEvent('credentials', item != null);
  }

  public async addHistoryItem(url: string, inPage = false) {
    if (
      url !== this.lastUrl &&
      !url.startsWith(WEBUI_BASE_URL) &&
      !url.startsWith(`${ERROR_PROTOCOL}://`) &&
      !this.incognito
    ) {
      const historyItem: IHistoryItem = {
        title: this.title,
        url,
        favicon: this.favicon,
        date: new Date().getTime(),
      };

      await this.historyQueue.enqueue(async () => {
        this.lastHistoryId = (
          await Application.instance.storage.insert<IHistoryItem>({
            scope: 'history',
            item: historyItem,
          })
        )._id;

        historyItem._id = this.lastHistoryId;

        Application.instance.storage.history.push(historyItem);
      });
    } else if (!inPage) {
      await this.historyQueue.enqueue(async () => {
        this.lastHistoryId = '';
      });
    }
  }

  public updateURL = (url: string) => {
    if (this.lastUrl === url) return;

    this.emitEvent('url-updated', this.hasError ? this.errorURL : url);

    this.lastUrl = url;

    this.isNewTab = url.startsWith(NEWTAB_URL);

    this.updateData();

    if (process.env.ENABLE_AUTOFILL) this.updateCredentials();

    this.updateBookmark();
  };

  public updateBookmark() {
    this.bookmark = Application.instance.storage.bookmarks.find(
      (x) => x.url === this.url,
    );

    if (!this.isSelected) return;

    this.window.send('is-bookmarked', !!this.bookmark);
  }

  public async updateData() {
    if (!this.incognito) {
      const id = this.lastHistoryId;
      if (id) {
        const { title, url, favicon } = this;

        this.historyQueue.enqueue(async () => {
          await Application.instance.storage.update({
            scope: 'history',
            query: {
              _id: id,
            },
            value: {
              title,
              url,
              favicon,
            },
            multi: false,
          });

          const item = Application.instance.storage.history.find(
            (x) => x._id === id,
          );

          if (item) {
            item.title = title;
            item.url = url;
            item.favicon = favicon;
          }
        });
      }
    }
  }

  public send(channel: string, ...args: any[]) {
    this.webContents.send(channel, ...args);
  }

  public get hostname() {
    return parseUrl(this.url).hostname;
  }

  public emitEvent(event: TabEvent, ...args: any[]) {
    this.window.send('tab-event', event, this.id, args);
  }
}
