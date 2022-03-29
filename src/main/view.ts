import { BrowserView, app, ipcMain, Cookie, BrowserWindow } from 'electron';
import { parse as parseUrl } from 'url';
import { getViewMenu } from './menus/view';
import { AppWindow } from './windows';
import {
  IHistoryItem,
  IBookmark,
  generatePolicyString,
  PolicyNotSetError,
  PolicyServiceNotProvidedError,
  PolicyNotFoundError,
  CookiePolicyExternalItem,
  CookiePolicyInternalItem,
  PolicyWithChoice,
  ServerPolicy,
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
import { checkURL, matchesScope } from '~/utils';

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
  private cookieJar: Cookie[] = [];

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

    this.createBanner();
    this.nativeCookieBannerWindow.destroy();

    const cookies = this.webContents.session.cookies;

    cookies.addListener('changed', (event, cookie, cause, removed) => {
      if (!this.isSelected) return;
      // Delete cookie directly after it is set when it is not allowed by the policy

      const loading = this.webContents.isLoading();

      const allowed =
        cookie.name === 'cookiepolicy' ||
        Application.instance.storage.isCookieAllowed(
          cookie,
          this.webContents.getURL(),
        );

      if (!allowed && !removed) {
        if (loading) {
          this.cookieJar.push(cookie);
        } else {
          const cookieUrl = checkURL(cookie.domain, !!cookie.secure);
          this.webContents.session.cookies
            .remove(cookieUrl.href, cookie.name)
            .then(() => {
              console.log(`Removed cookie ${cookieUrl.href}:${cookie.name}`);
            })
            .catch((r) => console.log(`Could not remove cookie: ${r}`));
        }
      } else if (allowed) {
        // update cookie log to delete cookies when policy is adjusted later on
        Application.instance.storage.updateCookieLog(
          removed ? 'remove' : 'add',
          cookie,
          this.webContents.getURL(),
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
      // setup my HttpRequest to request CookiePolicyManager
      this.handleCookiePolicy()
        .then((showBanner) => {
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

    ipcMain.on('banner-history-back', (_, arg: { issuer: number }) => {
      if (arg.issuer === this.webContents.id) {
        if (this.webContents.canGoBack()) {
          this.webContents.goBack();
        } else {
          this.webContents.loadURL(NEWTAB_URL);
        }
        this.nativeCookieBannerWindow.destroy();
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
    ipcMain.on('banner-clear-policies', async (_, arg: { issuer: number }) => {
      if (arg.issuer === this.webContents.id) {
        await Application.instance.storage.clearCookiePolicy();
        console.log('cleared');
        this.nativeCookieBannerWindow.destroy();
        // this.webContents.reload();
      }
    });

    ipcMain.on('banner-close', (_, arg: { issuer: number }) => {
      if (arg.issuer === this.webContents.id) {
        this.nativeCookieBannerWindow.destroy();
      }
    });

    ipcMain.on(
      'policy-choice',
      async (
        _,
        {
          issuer,
          sourceUrl,
          policy,
        }: {
          issuer: number;
          sourceUrl: string;
          policy: PolicyWithChoice;
        },
      ) => {
        if (issuer !== this.webContents.id) {
          return;
        }
        // close banner window
        this.nativeCookieBannerWindow.destroy();
        // Save choice in database
        const item: CookiePolicyExternalItem = {
          state: 'selected',
          sourceUrl,
          purposeChoice: policy.purposeChoice,
          cookieAccessorChoice: policy.cookieAccessorChoice,
        };
        await Application.instance.storage.addOrUpdateCookiePolicy(item);

        const updatedPolicy = await Application.instance.storage.findOne<CookiePolicyInternalItem>(
          {
            scope: 'cookiepolicy',
            query: { sourceUrl },
          },
        );

        if (updatedPolicy.state !== 'selected') {
          throw new Error('Oh no! updated policy is invalid.');
        }
        // remove all cookies that don't comply the updated policy
        for (const logEntry of updatedPolicy.cookies) {
          this.webContents.session.cookies
            .get({ url: logEntry.url, name: logEntry.name })
            .then((cookies) =>
              cookies.forEach((cookie) => {
                if (
                  !Application.instance.storage.isCookieAllowed(
                    cookie,
                    sourceUrl,
                  )
                ) {
                  this.webContents.session.cookies.remove(
                    logEntry.url,
                    logEntry.name,
                  );
                  Application.instance.storage.updateCookieLog(
                    'remove',
                    cookie,
                    sourceUrl,
                  );
                }
              }),
            );
        }
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

  private sendToBanner(command: 'message' | 'policy') {
    if (command === 'message') {
      this.nativeCookieBannerWindow.webContents.send('banner-show', {
        issuer: this.webContents.id,
        mode: 'message',
        headline: `Website does not support CookiePolicyManager`,
        message: `Your Browser can not control the privacy regarding cookies of the target website "${this.webContents.getURL()}".`,
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
      this.nativeCookieBannerWindow.webContents.send('banner-show', {
        issuer: this.webContents.id,
        mode: 'policy',
        sourceUrl: url.origin,
        policy,
      });
    }
  }

  private async deleteUnwantedCookies() {
    // TODO: do not search all cookies. only search cookies that were set since last wipe.
    if (this.cookieJar.length === 0) {
      return;
    }
    console.log(`Deleting ${this.cookieJar.length} Cookies...`);
    for (const cookie of this.cookieJar) {
      if (cookie.name !== 'cookiepolicy') {
        const cookieUrl = checkURL(cookie.domain, !!cookie.secure).href;
        await this.webContents.session.cookies.remove(cookieUrl, cookie.name);
      }
    }
    this.cookieJar = [];
    console.log('Deletion done.');
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

  private setPolicyCookie(policy: CookiePolicyInternalItem): Promise<void> {
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

  private async setPolicyCookieFromStorage(url: URL): Promise<boolean> {
    const policy = Application.instance.storage.findPolicyByURL(url.href);
    if (policy) {
      // Load Policy from storage (if existing)
      if (
        !(await this.isCookiePolicySet(url.hostname)) &&
        policy.state !== 'unsupported'
      ) {
        await this.setPolicyCookie(policy);
        // send policy to banner
        throw new PolicyNotSetError();
      }
      if (policy.state === 'unsupported' || policy.state === 'not-selected') {
        // always show banner for not supported websites or not selected policies
        return true;
      }
      // console.log(policy);
      return false;
    }
    throw new PolicyNotFoundError();
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
    try {
      const showBanner = await this.setPolicyCookieFromStorage(url);
      return showBanner;
    } catch (e) {
      if (!(e instanceof PolicyNotFoundError)) {
        throw e;
      }
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
      // website does not support policyManager, show warning on banner
      // console.log('Site does not provide the CookiePolicyManager interface.');
      const item: CookiePolicyExternalItem = {
        sourceUrl: url.origin,
        state: 'unsupported',
      };
      await Application.instance.storage.addOrUpdateCookiePolicy(item);
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
    const item: CookiePolicyExternalItem = {
      ...response,
      sourceUrl: url.origin,
      state: 'not-selected',
    };
    await Application.instance.storage.addOrUpdateCookiePolicy(item);
    // TODO: requests new policies with version number

    return true;
  }

  private createBanner() {
    if (
      this.nativeCookieBannerWindow &&
      !this.nativeCookieBannerWindow.isDestroyed()
    ) {
      this.nativeCookieBannerWindow.destroy();
    }
    this.nativeCookieBannerWindow = new BrowserWindow({
      parent: this.window.win,
      modal: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      fullscreenable: false,
      title: 'Cookie Policy Manager',
      show: false,
      webPreferences: {
        preload: join(app.getAppPath(), 'cookiebanner', 'build', 'preload.js'),
      },
    });
    this.nativeCookieBannerWindow.loadFile(
      join('cookiebanner', 'res', 'banner.html'),
    );
  }

  public openCookieBanner(toggle?: boolean) {
    if (toggle && !this.nativeCookieBannerWindow.isDestroyed()) {
      this.nativeCookieBannerWindow.destroy();
      return;
    }
    this.createBanner();
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
    setTimeout(() => {
      // give the IPC some time to send policy data to the banner before opening it
      this.nativeCookieBannerWindow.show();
    }, 50);
    // this.nativeCookieBannerWindow.webContents.openDevTools({
    //   mode: 'detach',
    // });
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
