import { describe, expect, it } from "vitest";

/**
 * The ready card builds its markdown as an array of lines with "" spacers
 * between paragraphs, plus one optional line for tone. `filter(Boolean)` was
 * meant to drop the optional line, but "" is falsy too — so every blank line
 * disappeared and the card rendered
 * "**Ton** — Professionnel Prochaine étape : ..." as a single run-on line.
 */
function buildMarkdown({ name, role, tone }: { name: string; role: string; tone?: string }) {
  return [
    `${name} est prêt.`,
    "",
    `### ${name}`,
    "",
    `**Ce qu'il fait** — ${role}`,
    tone ? `**Ton** — ${tone}` : null,
    "",
    "Prochaine étape : connecter un cerveau (LLM).",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

describe("ready card markdown", () => {
  it("keeps a blank line before the next-step paragraph", () => {
    const md = buildMarkdown({ name: "Prospect Inbox", role: "Surveille Gmail", tone: "Professionnel" });
    expect(md).toContain("**Ton** — Professionnel\n\nProchaine étape");
    expect(md).not.toContain("Professionnel Prochaine étape");
  });

  it("still separates paragraphs when there is no tone", () => {
    const md = buildMarkdown({ name: "Prospect Inbox", role: "Surveille Gmail" });
    expect(md).toContain("Surveille Gmail\n\nProchaine étape");
    expect(md).not.toContain("null");
  });

  it("keeps the heading on its own line", () => {
    const md = buildMarkdown({ name: "Prospect Inbox", role: "Surveille Gmail", tone: "Professionnel" });
    expect(md.split("\n")[1]).toBe("");
    expect(md).toContain("\n### Prospect Inbox\n");
  });
});
