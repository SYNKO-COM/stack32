import { describe, expect, it } from "vitest";

import { representativeToolId } from "@/lib/integrations/representative-tool";

/**
 * The Structure drawer configures where an app writes, so it must be
 * represented by an action whose required props are destinations. Taking the
 * first bound action asked for a Trello "Card ID" — the id of one existing
 * card — on an agent built to create new ones.
 */
describe("representative tool for an app drawer", () => {
  it("prefers creating over mutating", () => {
    expect(
      representativeToolId([
        "pd:trello-update-card",
        "pd:trello-create-card",
        "pd:trello-remove-label-from-card",
      ]),
    ).toBe("pd:trello-create-card");
  });

  it("prefers creating over reading", () => {
    expect(
      representativeToolId(["pd:trello-list-boards", "pd:trello-create-card"]),
    ).toBe("pd:trello-create-card");
  });

  it("falls back to a neutral action when nothing creates", () => {
    expect(representativeToolId(["pd:trello-update-card", "pd:trello-list-boards"])).toBe(
      "pd:trello-list-boards",
    );
  });

  it("is stable for the same bindings whatever their order", () => {
    const a = representativeToolId(["pd:slack-send-message", "pd:slack-find-message"]);
    const b = representativeToolId(["pd:slack-find-message", "pd:slack-send-message"]);
    expect(a).toBe(b);
    expect(a).toBe("pd:slack-send-message");
  });

  it("handles airtable and notion the same way", () => {
    expect(
      representativeToolId([
        "pd:airtable_oauth-update-record",
        "pd:airtable_oauth-create-single-record",
      ]),
    ).toBe("pd:airtable_oauth-create-single-record");
    expect(
      representativeToolId(["pd:notion-update-page", "pd:notion-create-page"]),
    ).toBe("pd:notion-create-page");
  });

  it("prefers the record the agent writes over the container that holds it", () => {
    // create-board asks for an organisation; create-card asks for the board and
    // list the agent will actually fill.
    expect(
      representativeToolId(["pd:trello-create-board", "pd:trello-create-card"]),
    ).toBe("pd:trello-create-card");
    expect(
      representativeToolId([
        "pd:airtable_oauth-create-base",
        "pd:airtable_oauth-create-single-record",
      ]),
    ).toBe("pd:airtable_oauth-create-single-record");
  });

  it("still uses a container action when it is all there is", () => {
    expect(representativeToolId(["pd:trello-create-board"])).toBe("pd:trello-create-board");
  });

  it("returns nothing when there is nothing bound", () => {
    expect(representativeToolId([])).toBeUndefined();
    expect(representativeToolId(["", "   "])).toBeUndefined();
  });
});
