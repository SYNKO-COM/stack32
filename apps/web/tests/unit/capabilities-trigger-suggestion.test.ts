/**
 * The trigger form opens on the app the prompt already named.
 *
 * A live build from "Quand une carte arrive dans la liste Termine de mon
 * tableau Trello, ..." showed the trigger form with "Événement d'un outil"
 * unticked and the app field empty — the user had to tick the box and type
 * "Trello", having just written it in the sentence above.
 *
 * The builder now sends a `tool_trigger_app` field. This checks the reading of
 * that field, which is what decides the form's opening state.
 */

import { describe, expect, it } from "vitest";

import { appDisplayName } from "@/lib/integrations/app-name";

type Field = { key: string; suggested_value?: string };

/** Mirrors `fieldDefault` in agent-capabilities-form.tsx. */
function fieldDefault(fields: Field[], key: string): string {
  return fields.find((f) => f.key === key)?.suggested_value ?? "";
}

/** The opening state the form derives from the builder's fields. */
function openingState(fields: Field[]) {
  const suggested = fieldDefault(fields, "tool_trigger_app");
  return {
    toolTrigger: suggested !== "",
    appId: suggested,
    appName: appDisplayName(suggested),
  };
}

describe("the capabilities form opening state", () => {
  it("opens on the tool event when the builder named an app", () => {
    const state = openingState([
      { key: "trigger_chat", suggested_value: "true" },
      { key: "schedule_hourly", suggested_value: "false" },
      { key: "tool_trigger_app", suggested_value: "trello" },
    ]);

    expect(state.toolTrigger).toBe(true);
    expect(state.appId).toBe("trello");
    expect(state.appName).toBe("Trello");
  });

  it("leaves the tool event untouched when the prompt named none", () => {
    const state = openingState([
      { key: "trigger_chat", suggested_value: "true" },
      { key: "schedule_hourly", suggested_value: "false" },
      { key: "tool_trigger_app", suggested_value: "" },
    ]);

    expect(state.toolTrigger).toBe(false);
    expect(state.appId).toBe("");
    expect(state.appName).toBe("");
  });

  it("behaves the same for a builder that sends no such field at all", () => {
    // Older runs and any build path that does not set it must still work.
    const state = openingState([{ key: "trigger_chat", suggested_value: "true" }]);

    expect(state.toolTrigger).toBe(false);
    expect(state.appId).toBe("");
  });

  it("shows the app name without the auth flavour", () => {
    const state = openingState([
      { key: "tool_trigger_app", suggested_value: "airtable_oauth" },
    ]);

    expect(state.appId).toBe("airtable_oauth");
    expect(state.appName).toBe("Airtable");
  });
});
