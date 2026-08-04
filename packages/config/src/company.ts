/**
 * Centralized legal-entity and brand configuration for Stack32.
 *
 * All legal pages MUST read company information from this file.
 * Placeholders are explicit and must be replaced before production.
 */

export const PLACEHOLDER = "TO_BE_COMPLETED_BEFORE_PRODUCTION" as const;

export interface CompanyInfo {
  brandName: string;
  parentBrand: string;
  legalCompanyName: string;
  legalForm: string;
  shareCapital: string;
  website: string;
  contactEmail: string;
  registeredAddress: string;
  siren: string;
  siret: string;
  rcs: string;
  vatNumber: string;
  publicationDirector: string;
  hostingProvider: string;
  hostingAddress: string;
}

export const company: CompanyInfo = {
  brandName: "Stack32",
  parentBrand: "Synko",
  legalCompanyName: "Zeldia",
  legalForm: "EURL (SARL unipersonnelle)",
  shareCapital: "1 000 EUR",
  website: "https://stack32.com",
  contactEmail: PLACEHOLDER,
  registeredAddress: "23 Rue Pierre Durand, 27140 Gisors, France",
  siren: "951 022 094",
  siret: "951 022 094 00019",
  rcs: "951 022 094 R.C.S. Evreux",
  vatNumber: "FR56951022094",
  publicationDirector: "Evan Ebwea Songue Ngongui",
  hostingProvider: PLACEHOLDER,
  hostingAddress: PLACEHOLDER,
};

/** Fields that legally must be filled before going to production. */
const REQUIRED_BEFORE_PRODUCTION: (keyof CompanyInfo)[] = [
  "contactEmail",
  "hostingProvider",
  "hostingAddress",
];

/** Returns the list of company fields still holding a placeholder value. */
export function getIncompleteCompanyFields(): (keyof CompanyInfo)[] {
  return REQUIRED_BEFORE_PRODUCTION.filter((key) => company[key] === PLACEHOLDER);
}

export function isCompanyInfoComplete(): boolean {
  return getIncompleteCompanyFields().length === 0;
}
