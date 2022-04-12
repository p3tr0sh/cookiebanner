import { Flavor } from '~/utils';
import { v4 as genUUID } from 'uuid';

type PurposeId = Flavor<number, 'PurposeId'>;
type CookieAccessorId = Flavor<number, 'CookieAccessorId'>;
type VisitorId = Flavor<string, 'VisitorId'>;

type Purpose = {
  id: PurposeId;
  name: string;
  description: string;
  descriptionLegal: string;
};

type CookieAccessor = {
  id: CookieAccessorId;
  name: string;
  purposes: PurposeId[];
  scope: string;
};

type ServerPolicy = {
  scope: string;
  version: number;
  purposes: Purpose[];
  cookieAccessors: CookieAccessor[];
};

type PolicyChoice = {
  visitorId: VisitorId;
  consentTimestamp: number;
  purposeChoice: { [key: PurposeId]: boolean };
  cookieAccessorChoice: { [key: CookieAccessorId]: boolean };
};

type CookieLogEntry = {
  setter: string;
  url: string;
  name: string;
};

type CookieLog = {
  cookies: CookieLogEntry[];
};

type PolicyWithChoice = ServerPolicy & PolicyChoice;

type CookiePolicyNotSupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'unsupported';
  ignored?: boolean;
};

type CookiePolicyHead = {
  _id?: string;
  sourceUrl: string;
  state: 'selected' | 'not-selected';
};

type CookiePolicyExternal = CookiePolicyHead &
  Partial<PolicyWithChoice & CookieLog>;

type CookiePolicyInternal = CookiePolicyHead & PolicyWithChoice & CookieLog;

type CookiePolicyInternalItem =
  | CookiePolicyNotSupportedItem
  | CookiePolicyInternal;

type CookiePolicyExternalItem =
  | CookiePolicyNotSupportedItem
  | CookiePolicyExternal;

function extractPolicyChoice({
  version,
  visitorId,
  consentTimestamp,
  purposeChoice,
  cookieAccessorChoice,
}: CookiePolicyInternal): { version: number } & PolicyChoice {
  return {
    version,
    visitorId,
    consentTimestamp,
    purposeChoice,
    cookieAccessorChoice,
  };
}

function getVisitorId({ visitorId }: CookiePolicyInternal): string {
  return visitorId;
}

function generatePolicyInternals(
  external: CookiePolicyExternal,
): Partial<PolicyChoice & CookieLog> {
  let choice: Partial<PolicyChoice & CookieLog> = {
    cookies: [],
    visitorId: genUUID(),
    consentTimestamp: Date.now(),
  };
  if (!external.purposeChoice && !!external.purposes) {
    choice = {
      ...choice,
      purposeChoice: external.purposes.reduce<{ [key: PurposeId]: boolean }>(
        (r, purpose) => ({ ...r, [purpose.id]: false }),
        {},
      ),
    };
  }
  if (!external.cookieAccessorChoice && !!external.cookieAccessors) {
    choice = {
      ...choice,
      cookieAccessorChoice: external.cookieAccessors.reduce<{
        [key: CookieAccessorId]: boolean;
      }>((r, accessor) => ({ ...r, [accessor.id]: false }), {}),
    };
  }
  return choice;
}

function mergePolicy(
  oldItem: CookiePolicyInternalItem,
  newItem: CookiePolicyExternalItem,
): CookiePolicyInternalItem {
  // if new item is not supportet just override
  if (newItem.state === 'unsupported') {
    return newItem;
  }
  // if old Item was unsupported, transform newItem to InternalItem
  if (oldItem.state === 'unsupported') {
    return {
      ...generatePolicyInternals(newItem),
      ...newItem,
    } as CookiePolicyInternalItem;
  }
  // merge
  let item = generatePolicyInternals(newItem);
  item = {
    ...item,
    ...oldItem,
    ...newItem,
    visitorId: oldItem.visitorId,
    consentTimestamp: item.consentTimestamp,
  };
  return item as CookiePolicyInternalItem;
}

function arraysMatch(a: Array<string>, b: Array<string>): boolean {
  return (
    a.every((value) => b.includes(value)) &&
    b.every((value) => a.includes(value))
  );
}

function shallowEqual<T extends { [key: string]: any }>(a: T, b: T): boolean {
  if (!arraysMatch(Object.keys(a), Object.keys(b))) {
    return false;
  }
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

class PolicyNotSetError extends Error {
  constructor() {
    super(
      'PolicyNotSetError: Nothing to worry about. Page will be reloaded with policy in place.',
    );
    Object.setPrototypeOf(this, PolicyNotSetError.prototype);
  }
}

class PolicyNotFoundError extends Error {
  constructor() {
    super('PolicyNotFoundError: Requested policy is not in the local storage');
    Object.setPrototypeOf(this, PolicyNotFoundError.prototype);
  }
}

class PolicyServiceNotProvidedError extends Error {
  constructor() {
    super('Policy service is not provided by this server.');
    Object.setPrototypeOf(this, PolicyServiceNotProvidedError.prototype);
  }
}

export {
  Purpose,
  CookieAccessor,
  CookieLogEntry,
  CookiePolicyInternalItem,
  CookiePolicyExternalItem,
  CookiePolicyNotSupportedItem,
  PolicyWithChoice,
  ServerPolicy,
  PolicyNotSetError,
  PolicyNotFoundError,
  PolicyServiceNotProvidedError,
  extractPolicyChoice,
  getVisitorId,
  mergePolicy,
  generatePolicyInternals,
  shallowEqual,
};
