import { BrowserView, app, ipcMain, Cookie, BrowserWindow } from 'electron';
import { parse as parseUrl } from 'url';
import { getViewMenu } from './menus/view';
import { AppWindow } from './windows';
import {
  IHistoryItem,
  IBookmark,
  ICookiePolicyItem,
  ServerPolicy,
  generatePolicyString,
  PolicyNotSetError,
  PolicyServiceNotProvidedError,
  PolicyNotFoundError,
} from '~/interfaces';
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

import { join } from 'path';
import { transmitJSON } from './network/request';
import { checkURL, matchesScope, UUID } from '~/utils';

interface IAuthInfo {
  url: string;
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

  private nativeCookieBannerWindow: BrowserWindow;
  private nativeCookieBannerWindowReady = false;
  private cookiesBeforeLoading: Cookie[] = [];

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
      join('cookiebanner', 'res', 'banner.html'),
    );
    this.nativeCookieBannerWindow.once('ready-to-show', () => {
      this.nativeCookieBannerWindowReady = true;
    });

    const cookies = this.webContents.session.cookies;

    cookies.addListener('changed', (event, cookie, cause, removed) => {
      // console.log(cookie.domain);
      var url = cookie.domain;
      if (url.startsWith('.')) {
        url = `www${url}`;
      }
      if (!url.startsWith('http')) {
        url = `http://${url}`;
      }
      // TODO: build diff here?
      if (cookie.httpOnly) {
        console.log(
          `[HTTP only cookie] -- Cookie change: ${JSON.stringify(cookie)}`,
        );
      }
    });

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
        // this.webContents.stopPainting();
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

    this.webContents.addListener('did-finish-load', () => {
      console.log(
        `finished loading ${this.webContents.getTitle()} ${this.webContents.getURL()}`,
      );

      // setup my HttpRequest to request CookiePolicyManager
      this.handleCookiePolicy()
        .then((showBanner) => {
          console.log(`Show banner? ${showBanner}`);

          // TODO: remove all unwanted cookies after page finished loading and user selected policy
          // This is how to clear the storage
          // this.webContents.session.clearStorageData({
          //   storages: ['cookies'],
          //   origin: 'http://www.metal-hammer.de',
          // });

          // search for __tcfapi, see view-preload.ts
          // this.send('tcfapi-grabber');

          if (showBanner) {
            this.openCookieBanner();
          }
          // Delete cookies after page is loaded
          this.deleteUnwantedCookies();
        })
        .catch((r) => {
          if (r instanceof PolicyServiceNotProvidedError) {
            // Stop loading the page and dosplay message.
            console.log('STOPPING website load');
            this.webContents.stop();
            this.openCookieBanner();
          } else if (r instanceof PolicyNotSetError) {
            this.webContents.reload();
          } else {
            console.log('Error happened');
            console.log(r);
          }
        });
    });

    ipcMain.on(
      'cookie-window',
      (evt, arg: { issuer: number; action: 'close' | 'historyBack' }) => {
        if (arg.issuer === this.webContents.id) {
          if (arg.action === 'close') {
            this.nativeCookieBannerWindow.hide();
          } else if (arg.action === 'historyBack') {
            if (this.webContents.canGoBack()) {
              this.webContents.goBack();
            } else {
              this.webContents.loadURL(NEWTAB_URL);
            }
          }
        }
      },
    );

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
            this.webContents.reload();
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
          sourceUrl: string;
          policyReturn: { [key: number]: boolean };
        },
      ) => {
        const { issuer, sourceUrl, policyReturn } = arg;
        if (issuer !== this.webContents.id) {
          return;
        }
        // Save choice in database
        const item: ICookiePolicyItem = {
          state: 'selected',
          sourceUrl,
          purposeChoice: policyReturn,
        };
        await Application.instance.storage.addOrUpdateCookiePolicyItem(item);

        console.log('Successfully added entry to policy storage.');
        const updatedPolicy = await Application.instance.storage.findOne<ICookiePolicyItem>(
          {
            scope: 'cookiepolicy',
            query: { sourceUrl },
          },
        );
        // now set cookie with policy and re-request site to load cookies from server
        // TODO: set with expiration or load this cookie upon loading a website and then reload page
        this.setPolicyCookie(updatedPolicy)
          .then(() => this.webContents.reload())
          .catch((r) => console.log(r));
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

  private sendToBanner(command: 'message' | 'issuer' | 'policy') {
    if (command === 'message') {
      this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
        command: 'message',
        issuer: this.webContents.id,
        headline: `Website does not support CookiePolicyManager`,
        message: `Your Browser can not control the privacy regarding cookies of the target website "${this.webContents.getURL()}".`,
      });
    } else if (command === 'issuer') {
      this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
        command: 'issuer',
        issuer: this.webContents.id,
      });
    } else if (command === 'policy') {
      const url = checkURL(this.webContents.getURL());
      if (!url) {
        throw new Error('Site not loaded, can not send policy to banner.');
      }
      const policy = Application.instance.storage.findPolicyByURL(url.href);
      if (!policy) {
        throw new PolicyNotFoundError();
      }
      this.nativeCookieBannerWindow.webContents.send('cookieChannel', {
        command: 'policy',
        policy: policy,
        sourceUrl: url.origin,
        issuer: this.webContents.id,
      });
    }
  }

  private async deleteUnwantedCookies() {
    const allCookies = await this.webContents.session.cookies.get({});
    let origins = new Set<string>();
    for (const cookie of allCookies) {
      if (!Application.instance.storage.isCookieAllowed(cookie)) {
        const origin = checkURL(cookie.domain).origin;
        origins.add(origin);
      }
    }

    for (const origin of origins) {
      this.webContents.session
        .clearStorageData({
          storages: ['cookies'],
          origin,
        })
        .then(() => {
          console.log(`Removed Cookies from ${origin}`);
        })
        .catch((r) => console.log(r));
    }
  }

  private isCookiePolicySet(domain: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.webContents.session.cookies
        .get({ domain, name: 'cookiepolicy' })
        .then((c) => {
          resolve(c.length > 0);
        })
        .catch((r) => reject(r));
    });
  }

  private setPolicyCookie(policy: ICookiePolicyItem): Promise<void> {
    if (policy.state === 'unsupported') {
      return new Promise<void>((resolve) => resolve());
    }
    const scope = checkURL(policy.scope);
    return this.webContents.session.cookies.set({
      url: scope.href,
      domain: scope.hostname,
      name: 'cookiepolicy',
      value: generatePolicyString(policy),
    });
  }

  /**
   * check for present policy and request one if necessary
   * @param urlString defaults to the currently loaded site
   * @returns true if native cookie banner should be displayed
   */
  private async handleCookiePolicy(): Promise<boolean> {
    const url = checkURL(this.webContents.getURL());
    if (!url || url.hostname === 'localhost') {
      return false;
    }
    const policy = Application.instance.storage.findPolicyByURL(url.href);
    if (policy) {
      console.log(
        `Policy existing: (maybe ask for newer version. expiration?)`,
      );
      // Load Policy from storage (if existing)
      if (
        !(await this.isCookiePolicySet(url.hostname)) &&
        policy.state !== 'unsupported'
      ) {
        await this.setPolicyCookie(policy);
        // send policy to banner
        // this.sendToBanner('policy');
        throw new PolicyNotSetError();
      }
      if (policy.state === 'unsupported' || policy.state === 'not-selected') {
        // always show banner for not supported websites or not selected policies
        return true;
      }
      // console.log(policy);
      return false;
    }
    // request policy from [hostname]/CookiePolicyManager, save it and show banner
    const visitedSite = url.href;
    console.log(`Request ServerPolicy`);
    let response: ServerPolicy;
    try {
      response = await transmitJSON(url, {
        version: 0,
        visitedSite,
      });
    } catch (e) {
      // TODO: how to react on pages without cookiepolicy? show warning on banner?
      // console.log('Site does not provide the CookiePolicyManager interface.');
      const item: ICookiePolicyItem = {
        sourceUrl: url.origin,
        state: 'unsupported',
      };
      await Application.instance.storage.addOrUpdateCookiePolicyItem(item);
      throw new PolicyServiceNotProvidedError();
    }
    const scopeURL = checkURL(response.scope);
    // visited site has to be in scope
    if (!scopeURL || !matchesScope(url, scopeURL)) {
      console.error(
        `Policy scope (${response.scope}) does not apply to browsed URL (${visitedSite}) or is invalid!`,
      );
      return false;
    }
    // Store in CookiePolicy
    const item: ICookiePolicyItem = {
      ...response,
      sourceUrl: url.origin,
      state: 'not-selected',
    };
    Application.instance.storage
      .addOrUpdateCookiePolicyItem(item)
      .then(() => {
        // this.sendToBanner('policy');
        console.log('Received Policy template from server.');
      })
      .catch((r) => console.log(`Could not set policy: ${r}`));
    // TODO: requests new policies with version number

    return true;
  }

  public openCookieBanner(toggle?: boolean) {
    if (this.nativeCookieBannerWindowReady) {
      if (toggle && this.nativeCookieBannerWindow.isVisible()) {
        this.nativeCookieBannerWindow.hide();
      } else {
        // decide what screen to show: message or policy
        const policy = Application.instance.storage.findPolicyByURL(
          this.webContents.getURL(),
        );
        if (!policy) {
          console.log('No policy existing, not even Blacklist entry');
          return;
        }
        if (policy.state !== 'unsupported') {
          this.sendToBanner('policy');
        } else {
          this.sendToBanner('message');
        }
        this.nativeCookieBannerWindow.show();
        this.nativeCookieBannerWindow.webContents.openDevTools();
      }
    }
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
