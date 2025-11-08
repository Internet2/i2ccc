export interface CookieOptions {
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  secure?: boolean;
}

const DEFAULT_OPTIONS: Required<Pick<CookieOptions, 'path' | 'sameSite'>> = {
  path: '/',
  sameSite: 'Lax',
};

const isBrowser = typeof document !== 'undefined';

const parseCookies = (): Record<string, string> => {
  if (!isBrowser) {
    return {};
  }

  return document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }

      const name = decodeURIComponent(entry.slice(0, separatorIndex));
      const value = decodeURIComponent(entry.slice(separatorIndex + 1));
      acc[name] = value;
      return acc;
    }, {});
};

export const getCookie = (name: string): string | undefined => {
  const cookies = parseCookies();
  return cookies[name];
};

export const getCookiesByPrefix = (prefix: string): Record<string, string> => {
  const cookies = parseCookies();
  return Object.keys(cookies).reduce<Record<string, string>>((acc, key) => {
    if (key.startsWith(prefix)) {
      acc[key] = cookies[key];
    }
    return acc;
  }, {});
};

export const setCookie = (name: string, value: string, options?: CookieOptions) => {
  if (!isBrowser) {
    return;
  }

  const { maxAgeSeconds, path, sameSite, secure } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);

  let cookieString = `${encodedName}=${encodedValue}`;

  if (path) {
    cookieString += `; Path=${path}`;
  }

  if (typeof maxAgeSeconds === 'number') {
    cookieString += `; Max-Age=${maxAgeSeconds}`;
  }

  if (sameSite) {
    cookieString += `; SameSite=${sameSite}`;
  }

  if (secure) {
    cookieString += '; Secure';
  }

  document.cookie = cookieString;
};

export const deleteCookie = (name: string) => {
  setCookie(name, '', { maxAgeSeconds: 0 });
};
