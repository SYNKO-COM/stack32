import { describe, expect, it } from "vitest";

import { translateTriggerLabel } from "@/lib/integrations/trigger-labels";

describe("translateTriggerLabel", () => {
  it("keeps English when the UI is not French", () => {
    expect(translateTriggerLabel("New Email Received", "en")).toBe("New Email Received");
    expect(translateTriggerLabel("New Email Received")).toBe("New Email Received");
  });

  it("translates Gmail events in French", () => {
    expect(translateTriggerLabel("New Email Received", "fr")).toBe("Nouvel e-mail reçu");
    expect(translateTriggerLabel("New Sent Email", "fr-FR")).toBe("Nouvel e-mail envoyé");
    expect(translateTriggerLabel("New Labeled Email", "fr")).toBe("Nouvel e-mail étiqueté");
    expect(translateTriggerLabel("New Email Matching Search", "fr")).toBe(
      "Nouvel e-mail correspondant à une recherche",
    );
    expect(translateTriggerLabel("New Attachment Received", "fr")).toBe(
      "Nouvelle pièce jointe reçue",
    );
  });

  it("keeps unknown names and IDs unchanged", () => {
    expect(translateTriggerLabel("Obscure Vendor Zap", "fr")).toBe("Obscure Vendor Zap");
    expect(translateTriggerLabel("gmail-new-email-received", "fr")).toBe(
      "gmail-new-email-received",
    );
  });

  it("translates Instant suffix without changing the id", () => {
    expect(translateTriggerLabel("New Spreadsheet Row (Instant)", "fr")).toBe(
      "Nouvelle ligne de tableur (instantané)",
    );
  });
});
