import { UUID } from '~/utils';

export interface ICookiePolicyItem {
  _id?: string;
  url?: string;
  scope?: string;
  isSet?: boolean;
  thirdParty?: string[];
  visitorId: UUID;
  purposes?: { [key: string]: boolean };
}
