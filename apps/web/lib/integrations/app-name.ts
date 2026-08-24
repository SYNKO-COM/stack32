/**
 * Turn a Pipedream app slug into the name a person would recognise.
 *
 * Pipedream distinguishes how you authenticate inside the slug itself:
 * `airtable_oauth` and `airtable_api_key` are the same product to the user,
 * and `slack_bot` is still Slack. Showing "Airtable Oauth" in a drawer leaks
 * our plumbing into a screen meant for someone who has never heard of OAuth.
 *
 * Stripping the suffix is a rule about how the catalogue is written, so it
 * holds for apps nobody has looked at yet — the curated map below only exists
 * for names that title-casing alone would get wrong.
 */

/** Auth flavour and version markers Pipedream appends to an app slug. */
const AUTH_FLAVOUR_SUFFIX =
  /_(oauth|oauth2|api_key|apikey|api|bot|user|admin|developer_app|v\d+)$/i;

/** Names that title-casing the slug would spell wrong. */
const KNOWN_NAMES: Record<string, string> = {
  google: "Google",
  slack: "Slack",
  notion: "Notion",
  stripe: "Stripe",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
  microsoft_outlook: "Outlook",
  x_ai: "xAI",
  xai: "xAI",
  mistral_ai: "Mistral",
  openai: "OpenAI",
  anthropic: "Anthropic",
  github: "GitHub",
  gitlab: "GitLab",
  hubspot: "HubSpot",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  typeform: "Typeform",
  pipedream: "Apps",
};

/** Strip every auth flavour marker, not just the last one. */
function baseSlug(slug: string): string {
  let out = slug;
  // `x_api_key_v2` carries two markers; peel until nothing is left to peel.
  for (let i = 0; i < 3 && AUTH_FLAVOUR_SUFFIX.test(out); i += 1) {
    const stripped = out.replace(AUTH_FLAVOUR_SUFFIX, "");
    // Never strip the app away entirely: `api` on its own is the whole name.
    if (!stripped) break;
    out = stripped;
  }
  return out;
}

export function appDisplayName(raw: string | null | undefined): string {
  const slug = (raw ?? "").trim().toLowerCase().replace(/^(pd|pipedream):/i, "");
  if (!slug) return "";

  if (KNOWN_NAMES[slug]) return KNOWN_NAMES[slug];

  const base = baseSlug(slug);
  if (KNOWN_NAMES[base]) return KNOWN_NAMES[base];

  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
