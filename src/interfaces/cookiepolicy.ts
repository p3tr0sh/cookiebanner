import { Flavor } from '~/utils';

type PurposeId = Flavor<number, 'PurposeId'>;
type ThirdPartyId = Flavor<number, 'ThirdPartyId'>;

type Purpose = {
  id: PurposeId;
  name: string;
  description: string;
  descriptionLegal: string;
};

type ThirdParty = {
  id: ThirdPartyId;
  name: string;
  purposes: PurposeId[];
  scope: string;
};

type ServerPolicy = {
  scope: string;
  version: number;
  purposes: Purpose[];
  thirdParties: ThirdParty[];
};

type ICookiePolicyNotSupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'unsupported';
};

// TODO: model first party and third parties as CookieAccessors
type ICookiePolicySupportedItem = {
  _id?: string;
  sourceUrl: string;
  state: 'selected' | 'not-selected';
  purposeChoice?: { [key: PurposeId]: boolean };
  thirdPartyChoice?: { [key: ThirdPartyId]: boolean };
} & Partial<ServerPolicy>;

type ICookiePolicyItem =
  | ICookiePolicyNotSupportedItem
  | ICookiePolicySupportedItem;

function generatePolicyString(policy: ICookiePolicySupportedItem): string {
  return JSON.stringify({
    version: policy.version,
    purposeChoice: policy.purposeChoice,
    thirdPartyChoice: policy.thirdPartyChoice,
  });
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
  ThirdParty,
  ICookiePolicyItem,
  ServerPolicy,
  PolicyNotSetError,
  PolicyNotFoundError,
  PolicyServiceNotProvidedError,
  generatePolicyString,
};
