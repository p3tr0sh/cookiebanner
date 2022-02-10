type Purpose = {
  id: number;
  name: string;
  description: string;
  descriptionLegal: string;
};

type CookieAccessor = {
  id: number;
  name: string;
  purposes: number[];
  scope: string;
};

type Policy = {
  sourceUrl: string;
  purposes: Purpose[];
  purposeChoice?: { [purposeId: number]: boolean };
  cookieAccessors: CookieAccessor[];
  cookieAccessorChoice?: { [cookieAccessorId: number]: boolean };
};

type CookieWrappingIssuer = { command: 'issuer'; issuer: number };
type CookieWrappingResponse = { command: 'response'; response: object };
type CookieWrappingPolicy = {
  command: 'policy';
  policy: Policy;
  sourceUrl: string;
  issuer: number;
};
type CookieWrappingMessage = {
  command: 'message';
  issuer: number;
  headline: string;
  message: string;
};
type CookieWrapping =
  | CookieWrappingIssuer
  | CookieWrappingResponse
  | CookieWrappingPolicy
  | CookieWrappingMessage;

export { Purpose, CookieWrapping, Policy };
