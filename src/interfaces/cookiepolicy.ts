type Purpose = {
  id: number;
  name: string;
  description: string;
  descriptionLegal: string;
};

type ThirdParty = {
  id: number;
  name: string;
  purposes: number[];
  scope: string;
};

type ServerPolicy = {
  scope: string;
  version: number;
  purposes: Purpose[];
  thirdParties: ThirdParty[];
};

type ICookiePolicyItem = {
  _id?: string;
  sourceUrl: string;
  // version?: string;
  // scope?: string;
  // purposes?: Purpose[];
  purposeChoice?: { [key: number]: boolean };
  // thirdParties?: ThirdParty[];
  thirdPartyChoice?: { [key: number]: boolean };
} & Partial<ServerPolicy>;

function generatePolicyString(policy: ICookiePolicyItem): string {
  return JSON.stringify({
    version: policy.version,
    purposeChoice: policy.purposeChoice,
    thirdPartyChoice: policy.thirdPartyChoice,
  });
}

export {
  Purpose,
  ThirdParty,
  ICookiePolicyItem,
  ServerPolicy,
  generatePolicyString,
};
