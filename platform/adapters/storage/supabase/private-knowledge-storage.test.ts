import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { SupabasePrivateKnowledgeStorage } from "./private-knowledge-storage.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });

test("private storage builds immutable workspace paths and reuses only byte-identical retries", async () => {
  const stored = new Map<string, Uint8Array>();
  const storage = { storage: {
    from(bucket: string) {
      assert.equal(bucket, "knowledge-originals");
      return {
        async upload(path: string, bytes: Uint8Array, options: { upsert: boolean }) {
          assert.equal(options.upsert, false);
          if (stored.has(path)) return { data: null, error: new Error("already exists") };
          stored.set(path, bytes.slice());
          return { data: { path }, error: null };
        },
        async download(path: string) {
          const bytes = stored.get(path);
          return bytes ? { data: new Blob([bytes.slice().buffer]), error: null } : { data: null, error: new Error("not found") };
        },
        async remove(paths: readonly string[]) {
          for (const path of paths) stored.delete(path);
          return { data: null, error: null };
        },
      };
    },
  } } as unknown as SupabaseClient;
  const adapter = new SupabasePrivateKnowledgeStorage(storage);
  const identity = { sourceId: "source-1", versionId: "version-1", filename: "terms.pdf" };
  const bytes = new Uint8Array([1, 2, 3]);
  const first = await adapter.putOriginal(shopA, identity, bytes, "application/pdf");
  assert.deepEqual(first, { path: "shop-a/source-1/version-1/terms.pdf", created: true });
  assert.deepEqual(await adapter.putOriginal(shopA, identity, bytes, "application/pdf"), { ...first, created: false });
  await assert.rejects(adapter.putOriginal(shopA, identity, new Uint8Array([3, 2, 1]), "application/pdf"), /KNOWLEDGE_OBJECT_CONFLICT/);
  await assert.rejects(adapter.removeOriginal(shopA, "shop-b/source-1/version-1/terms.pdf"), /CROSS_WORKSPACE_OBJECT_DELETE_DENIED/);
  await adapter.removeOriginal(shopA, first.path);
  assert.equal(stored.size, 0);
});

test("private storage rejects malformed object identity before contacting the provider", async () => {
  const adapter = new SupabasePrivateKnowledgeStorage({ storage: { from() { throw new Error("must not call provider"); } } } as unknown as SupabaseClient);
  await assert.rejects(adapter.putOriginal(shopA, { sourceId: "../other", versionId: "version-1", filename: "terms.pdf" }, new Uint8Array([1]), "application/pdf"),
    /INVALID_KNOWLEDGE_OBJECT_PATH/);
});
