export const isURL = (input: string): boolean => {
  const pattern = /^(?:\w+:)?\/\/([^\s.]+\.\S{2}|localhost[:?\d]*)\S*$/;

  if (pattern.test(input)) {
    return true;
  }
  return pattern.test(`http://${input}`);
};

export const matchesPattern = (pattern: string, url: string) => {
  if (pattern === '<all_urls>') {
    return true;
  }

  const regexp = new RegExp(
    `^${pattern.replace(/\*/g, '.*').replace('/', '\\/')}$`,
  );
  return url.match(regexp) != null;
};

export const getDomain = (url: string): string => {
  let hostname = url;

  if (hostname.includes('http://') || hostname.includes('https://')) {
    hostname = hostname.split('://')[1];
  }

  if (hostname.includes('?')) {
    hostname = hostname.split('?')[0];
  }

  if (hostname.includes('://')) {
    hostname = `${hostname.split('://')[0]}://${hostname.split('/')[2]}`;
  } else {
    hostname = hostname.split('/')[0];
  }

  return hostname;
};

export const prefixHttp = (url: string): string => {
  url = url.trim();
  return url.includes('://') ? url : `http://${url}`;
};

export function checkURL(urlString: string, secure?: boolean): URL | undefined {
  if (!urlString || urlString === '') {
    return undefined;
  }
  // check scheme or prepend http
  if (!urlString.includes('://')) {
    if (secure) {
      urlString = `https://${urlString}`;
    } else {
      urlString = `http://${urlString}`;
    }
  }
  return new URL(urlString);
}

export function matchesScope(url: URL, scope: URL): boolean {
  return (
    url &&
    scope &&
    url.hostname.endsWith(scope.hostname) &&
    (!scope.port || url.port === scope.port)
  );
}
