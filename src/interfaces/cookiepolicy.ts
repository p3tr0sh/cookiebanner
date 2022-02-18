import { Flavor } from '~/utils';

type PurposeId = Flavor<number, 'PurposeId'>;
type CookieAccessorId = Flavor<number, 'CookieAccessorId'>;

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
  purposeChoice: { [key: PurposeId]: boolean };
  cookieAccessorChoice: { [key: CookieAccessorId]: boolean };
};

type PolicyWithChoice = ServerPolicy & PolicyChoice;

type CookiePolicyNotSupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'unsupported';
};

type CookiePolicyHead = {
  _id?: string;
  sourceUrl: string;
  state: 'selected' | 'not-selected';
};

type CookiePolicyExternal = CookiePolicyHead & Partial<PolicyWithChoice>;

type CookiePolicyInternal = CookiePolicyHead & PolicyWithChoice;

type CookiePolicyInternalItem =
  | CookiePolicyNotSupportedItem
  | CookiePolicyInternal;

type CookiePolicyExternalItem =
  | CookiePolicyNotSupportedItem
  | CookiePolicyExternal;

function generatePolicyString(policy: CookiePolicyInternal): string {
  const { version, purposeChoice, cookieAccessorChoice } = policy;
  return JSON.stringify({ version, purposeChoice, cookieAccessorChoice });
}

function generateChoice(external: CookiePolicyExternal): Partial<PolicyChoice> {
  let choice = {};
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
    return newItem as CookiePolicyInternalItem;
  }
  // merge
  let item = generateChoice(newItem);
  item = { ...item, ...oldItem };
  item = { ...item, ...newItem };
  return item as CookiePolicyInternalItem;
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
  CookiePolicyInternalItem,
  CookiePolicyExternalItem,
  PolicyWithChoice,
  ServerPolicy,
  PolicyNotSetError,
  PolicyNotFoundError,
  PolicyServiceNotProvidedError,
  generatePolicyString,
  mergePolicy,
  generateChoice,
};
