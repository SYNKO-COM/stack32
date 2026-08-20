import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentFile,
  resolveAttachmentMimeType,
} from "@/lib/chat/attachment-allowlist";

describe("attachment-allowlist", () => {
  it("resolves common images and pdf from type or extension", () => {
    expect(resolveAttachmentMimeType({ name: "a.png", type: "image/png" })).toBe(
      "image/png",
    );
    expect(resolveAttachmentMimeType({ name: "a.jpg", type: "image/jpg" })).toBe(
      "image/jpeg",
    );
    expect(resolveAttachmentMimeType({ name: "doc.PDF", type: "" })).toBe(
      "application/pdf",
    );
  });

  it("maps source/code extensions to allowed text types", () => {
    expect(resolveAttachmentMimeType({ name: "app.ts", type: "" })).toBe("text/plain");
    expect(resolveAttachmentMimeType({ name: "x.py", type: "application/octet-stream" })).toBe(
      "text/plain",
    );
    expect(resolveAttachmentMimeType({ name: "c.yml", type: "" })).toBe("text/yaml");
  });

  it("rejects unknown types and oversize files", () => {
    expect(resolveAttachmentMimeType({ name: "x.exe", type: "" })).toBeNull();
    expect(
      resolveAttachmentMimeType({ name: "x.bin", type: "application/octet-stream" }),
    ).toBeNull();
    expect(
      isAllowedAttachmentFile({
        name: "ok.png",
        type: "image/png",
        size: ATTACHMENT_MAX_BYTES + 1,
      }),
    ).toBe(false);
    expect(
      isAllowedAttachmentFile({ name: "ok.png", type: "image/png", size: 12 }),
    ).toBe(true);
  });
});
