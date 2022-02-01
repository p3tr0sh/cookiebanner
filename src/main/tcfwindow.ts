/**
 * https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md#tcdata
 */
type TCData = {
  tcString: string; //'base64url-encoded TC string with segments'
  tcfPolicyVersion: number;
  cmpId: number;
  cmpVersion: number;

  /**
   * true - GDPR Applies
   * false - GDPR Does not apply
   * undefined - unknown whether GDPR Applies
   * see the section: "What does the gdprApplies value mean?"
   */
  gdprApplies: boolean | undefined;

  /*
   * see addEventListener command
   */
  eventStatus: string;

  /**
   * see Ping Status Codes in following table
   */
  cmpStatus: string;

  /**
   * If this TCData is sent to the callback of addEventListener: number,
   * the unique ID assigned by the CMP to the listener function registered
   * via addEventListener.
   * Others: undefined.
   */
  listenerId: number | undefined;

  /*
   * true - if using a service-specific or publisher-specific TC String
   * false - if using a global TC String.
   */
  isServiceSpecific: boolean;

  /**
   * true - CMP is using publisher-customized stack descriptions
   * false - CMP is NOT using publisher-customized stack descriptions
   */
  useNonStandardStacks: boolean;

  /**
   * Country code of the country that determines the legislation of
   * reference.  Normally corresponds to the country code of the country
   * in which the publisher's business entity is established.
   */
  publisherCC: string; //'Two-letter ISO 3166-1 alpha-2 code'

  /**
   * Only exists on service-specific TC
   *
   * true - Purpose 1 not disclosed at all. CMPs use PublisherCC to
   * indicate the publisher's country of establishment to help Vendors
   * determine whether the vendor requires Purpose 1 consent.
   *
   * false - There is no special Purpose 1 treatment status. Purpose 1 was
   * disclosed normally (consent) as expected by TCF Policy
   */
  purposeOneTreatment: boolean;

  /**
   * Only exists on global-scope TC
   */
  outOfBand: {
    allowedVendors: {
      /**
       * true - Vendor is allowed to use an Out-of-Band Legal Basis
       * false | undefined - Vendor is NOT allowed to use an Out-of-Band Legal Basis
       */
      [vendorid: number]: boolean;
    };
    disclosedVendors: {
      /**
       * true - Vendor has been disclosed to the user
       * false | undefined - Vendor has been disclosed to the user
       */
      [vendorid: number]: boolean;
    };
  };
  purpose: {
    consents: {
      /**
       * true - Consent
       * false | undefined - No Consent.
       */
      [purposeid: number]: boolean;
    };
    legitimateInterests: {
      /**
       * true - Legitimate Interest Established
       * false | undefined - No Legitimate Interest Established
       */
      [purposeid: number]: boolean;
    };
  };
  vendor: {
    consents: {
      /**
       * true - Consent
       * false | undefined - No Consent
       */
      [vendorid: number]: boolean;
    };
    legitimateInterests: {
      /**
       * true - Legitimate Interest Established
       * false | undefined - No Legitimate Interest Established
       */
      [vendorid: number]: boolean;
    };
  };
  specialFeatureOptins: {
    /**
     * true - Special Feature Opted Into
     * false | undefined - Special Feature NOT Opted Into
     */
    [specialfeatureid: number]: boolean;
  };
  publisher: {
    consents: {
      /**
       * true - Consent
       * false | undefined - No Consent
       */
      [purposeid: number]: boolean;
    };
    legitimateInterests: {
      /**
       * true - Legitimate Interest Established
       * false | undefined - No Legitimate Interest Established
       */
      [purposeid: number]: boolean;
    };
    customPurpose: {
      consents: {
        /**
         * true - Consent
         * false | undefined - No Consent
         */
        [purposeid: number]: boolean;
      };
      legitimateInterests: {
        /**
         * true - Legitimate Interest Established
         * false | undefined - No Legitimate Interest Established
         */
        [purposeid: number]: boolean;
      };
    };
    restrictions: {
      [purposeid: number]: {
        /**
         * 0 - Not Allowed
         * 1 - Require Consent
         * 2 - Require Legitimate Interest
         */
        [vendorid: number]: 0 | 1 | 2;
      };
    };
  };
};

type removeCallback = (success: boolean) => void;
type addCallback = (tcData: TCData, success: boolean) => void;

type TCFWindow = Window &
  typeof globalThis & {
    __tcfapi(
      fname: string,
      version: number,
      callback: addCallback | removeCallback,
      listenerId?: number,
    ): void;
  };

export { TCFWindow, TCData };
