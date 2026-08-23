/**
 * Which of an app's bound actions should stand for it in the Structure drawer.
 *
 * The drawer answers one question — "where does this app write?" — so it needs
 * an action whose required props are destinations. Taking whichever action
 * happened to be bound first asked for a Trello **Card ID**: the id of a single
 * existing card, on an agent whose whole job is to create new ones. There is no
 * value a person could put there.
 *
 * A creating action never carries the id of the record it is about to make, so
 * its required props are exactly the destination — board and list, base and
 * table, the channel. That makes it the honest representative.
 */
const CREATING_VERBS = [
  "create",
  "add",
  "send",
  "new",
  "post",
  "insert",
  "append",
  "upsert",
];

const MUTATING_VERBS = ["update", "delete", "remove", "archive", "modify", "move"];

/**
 * Objects that hold other objects. Creating one is setting up a workspace, not
 * the path the agent writes down every run — and it asks for a different
 * destination: `trello-create-board` wants an organisation, where
 * `trello-create-card` wants the board and list the agent will actually fill.
 */
const CONTAINER_OBJECTS = [
  "board",
  "base",
  "workspace",
  "database",
  "worksheet",
  "spreadsheet",
  "label",
  "list",
  "channel",
  "project",
  "folder",
  "table",
  "field",
  "column",
];

function actionOf(toolId: string): string {
  return String(toolId || "")
    .replace(/^pd:/, "")
    .toLowerCase();
}

function createsAContainer(action: string): boolean {
  // Only when the container is what the verb makes: `trello-create-board`,
  // `slack-create-channel`. A container named as the destination —
  // `slack-send-message-to-channel` — is the opposite: it is exactly the
  // action we want to represent the app.
  return CREATING_VERBS.some((v) =>
    CONTAINER_OBJECTS.some(
      (o) => action.endsWith(`-${v}-${o}`) || action.endsWith(`-${v}-${o}s`),
    ),
  );
}

function score(toolId: string): number {
  const action = actionOf(toolId);
  if (CREATING_VERBS.some((v) => action.includes(`-${v}-`) || action.includes(`-${v}`))) {
    return createsAContainer(action) ? 1 : 0;
  }
  if (MUTATING_VERBS.some((v) => action.includes(`-${v}-`) || action.includes(`-${v}`))) {
    return 3;
  }
  return 2;
}

export function representativeToolId(toolIds: readonly string[]): string | undefined {
  const usable = toolIds.filter((id) => typeof id === "string" && id.trim().length > 0);
  if (usable.length === 0) return undefined;
  // Among equally good actions the shortest name is the canonical one: an app
  // calls its everyday write `create-page` and reserves longer names for the
  // variants — `create-page-from-database`, `send-file-upload`. Original order
  // breaks any remaining tie, so the drawer asks the same thing every visit.
  return [...usable].sort(
    (a, b) => score(a) - score(b) || actionOf(a).length - actionOf(b).length,
  )[0];
}
