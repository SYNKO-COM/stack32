/**
 * Plain-language labels for Pipedream static props shown in Structure.
 * Prefer app_hints labels when present; fall back to this map, then humanize.
 */

export type PropCopy = {
  label: string;
  hint?: string;
};

const PROP_COPY: Record<string, PropCopy> = {
  sheetId: {
    label: "Fichier Google Sheets",
    hint: "Le classeur (fichier) que l’agent doit utiliser",
  },
  spreadsheetId: {
    label: "Fichier Google Sheets",
    hint: "Le classeur (fichier) que l’agent doit utiliser",
  },
  worksheetId: {
    label: "Feuille",
    hint: "L’onglet à l’intérieur du fichier (ex. Feuille 1)",
  },
  worksheetIds: {
    label: "Feuilles",
    hint: "Les onglets à surveiller dans le fichier",
  },
  drive: {
    label: "Drive",
    hint: "Mon Drive, ou un Drive partagé de l’équipe",
  },
  driveId: {
    label: "Drive",
    hint: "Mon Drive, ou un Drive partagé de l’équipe",
  },
  watchDrive: {
    label: "Surveiller tout le Drive",
    hint: "Oui = réagir aux changements dans le Drive entier",
  },
  hasHeaders: {
    label: "La première ligne contient des titres",
    hint: "Oui si la ligne du haut nomme les colonnes",
  },
  headerRowNumber: {
    label: "Ligne des titres",
    hint: "Numéro de la ligne qui contient les noms de colonnes (souvent 1)",
  },
  channel: {
    label: "Canal Slack",
    hint: "Le canal où l’agent peut écrire ou lire",
  },
  channelId: {
    label: "Canal",
    hint: "Le salon / canal concerné",
  },
  conversation: {
    label: "Conversation",
    hint: "Canal ou discussion directe",
  },
  inboxId: {
    label: "Boîte de réception",
    hint: "La boîte HubSpot (inbox) à utiliser",
  },
  threadId: {
    label: "Fil de discussion",
    hint: "La conversation précise dans la boîte",
  },
  calendarId: {
    label: "Agenda",
    hint: "Quel calendrier Google utiliser",
  },
  pageId: {
    label: "Page Notion",
    hint: "La page que l’agent doit lire ou mettre à jour",
  },
  page_id: {
    label: "Page Notion",
    hint: "La page que l’agent doit lire ou mettre à jour",
  },
  parentPageId: {
    label: "Page parente",
    hint: "La page sous laquelle créer le contenu",
  },
  databaseId: {
    label: "Base Notion",
    hint: "La base (tableau) Notion concernée",
  },
  database_id: {
    label: "Base Notion",
    hint: "La base (tableau) Notion concernée",
  },
  designType: {
    label: "Type de design Canva",
    hint: "Modèle prêt à l’emploi, ou taille personnalisée",
  },
  name: {
    label: "Modèle",
    hint: "Quel format de design (doc, présentation…)",
  },
  customer: {
    label: "Client Stripe",
    hint: "Le client concerné dans Stripe",
  },
  customerId: {
    label: "Client Stripe",
    hint: "Le client concerné dans Stripe",
  },
  account: {
    label: "Compte",
    hint: "Compte Stripe ou Connect à utiliser",
  },
  stripeAccount: {
    label: "Compte Connect",
    hint: "Compte Stripe Connect (vendeur) à utiliser",
  },
  baseId: {
    label: "Base Airtable",
    hint: "La base (espace) Airtable",
  },
  base: {
    label: "Base Airtable",
    hint: "La base (espace) Airtable",
  },
  tableId: {
    label: "Table",
    hint: "La table (feuille) dans la base",
  },
  table: {
    label: "Table",
    hint: "La table (feuille) dans la base",
  },
  documentId: {
    label: "Document",
    hint: "Le Google Doc à utiliser",
  },
  docId: {
    label: "Document",
    hint: "Le Google Doc à utiliser",
  },
  folderId: {
    label: "Dossier",
    hint: "Le dossier Google Drive cible",
  },
  fileId: {
    label: "Fichier",
    hint: "Le fichier Google Drive cible",
  },
  owner: {
    label: "Propriétaire du dépôt",
    hint: "Organisation ou utilisateur GitHub",
  },
  repo: {
    label: "Dépôt",
    hint: "Nom du projet GitHub",
  },
  repository: {
    label: "Dépôt",
    hint: "Nom du projet GitHub",
  },
};

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Strip markdown links from Pipedream descriptions for beginner UI. */
export function plainHint(text?: string | null): string | undefined {
  if (!text) return undefined;
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

export function resolvePropCopy(
  name: string,
  opts?: {
    label?: string | null;
    description?: string | null;
    hintLabel?: string | null;
    hintWhy?: string | null;
  },
): PropCopy {
  const fromMap = PROP_COPY[name] ?? PROP_COPY[name.toLowerCase()];
  const label =
    (opts?.hintLabel || "").trim() ||
    fromMap?.label ||
    (opts?.label && opts.label !== name ? opts.label : "") ||
    humanizeKey(name);
  const hint =
    (opts?.hintWhy || "").trim() ||
    fromMap?.hint ||
    plainHint(opts?.description);
  return { label, hint };
}
