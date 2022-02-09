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

type PolicyWithChoice = ServerPolicy & {
  purposeChoice: { [key: PurposeId]: boolean };
  cookieAccessorChoice: { [key: CookieAccessorId]: boolean };
};

type ICookiePolicyNotSupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'unsupported';
};

/**
 * TODO: if purposeChoice is false, accessors depending on that purpose automatically get deactivated
 */
type ICookiePolicySupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'selected' | 'not-selected';
} & Partial<PolicyWithChoice>;

type ICookiePolicyItem =
  | ICookiePolicyNotSupportedItem
  | ICookiePolicySupportedItem;

function generatePolicyString(policy: ICookiePolicySupportedItem): string {
  const { version, purposeChoice, cookieAccessorChoice } = policy;
  return JSON.stringify({ version, purposeChoice, cookieAccessorChoice });
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
  ICookiePolicyItem,
  ServerPolicy,
  PolicyWithChoice,
  PolicyNotSetError,
  PolicyNotFoundError,
  PolicyServiceNotProvidedError,
  generatePolicyString,
};
