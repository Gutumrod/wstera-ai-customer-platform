import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveMerchantBinding, MerchantMembershipRepositoryPort } from "../../contracts/tenancy/merchant.js";
import { MerchantIdentityError, resolveMerchantIdentity } from "./merchant-identity.js";

function membershipRepository(bindings: readonly ActiveMerchantBinding[]): MerchantMembershipRepositoryPort {
  return { async listActiveBindings() { return bindings; } };
}

const shopA: ActiveMerchantBinding = Object.freeze({
  workspaceId: "shop-a", role: "owner", connectionId: "web-shop-a", channel: "web",
});

test("merchant workspace identity is derived from active membership and owned web connection", async () => {
  const identity = await resolveMerchantIdentity(membershipRepository([shopA]), "synthetic-user-id");
  assert.equal(identity.workspace.workspaceId, "shop-a");
  assert.equal(identity.workspace.connectionId, "web-shop-a");
  assert.equal(identity.role, "owner");
});

test("workspace selection fails closed when membership or web connection is missing or ambiguous", async (t) => {
  await t.test("no membership", async () => {
    await assert.rejects(resolveMerchantIdentity(membershipRepository([]), "synthetic-user-id"),
      (error: unknown) => error instanceof MerchantIdentityError && error.code === "MEMBERSHIP_REQUIRED");
  });
  await t.test("multiple workspaces", async () => {
    await assert.rejects(resolveMerchantIdentity(membershipRepository([
      shopA, Object.freeze({ ...shopA, workspaceId: "shop-b", connectionId: "web-shop-b", role: "staff" }),
    ]), "synthetic-user-id"), (error: unknown) => error instanceof MerchantIdentityError && error.code === "WORKSPACE_AMBIGUOUS");
  });
  await t.test("no web connection", async () => {
    await assert.rejects(resolveMerchantIdentity(membershipRepository([
      Object.freeze({ ...shopA, channel: "line" as const }),
    ]), "synthetic-user-id"), (error: unknown) => error instanceof MerchantIdentityError && error.code === "WEB_CONNECTION_REQUIRED");
  });
  await t.test("repository errors fail closed", async () => {
    const broken: MerchantMembershipRepositoryPort = { async listActiveBindings() { throw new Error("database failure"); } };
    await assert.rejects(resolveMerchantIdentity(broken, "synthetic-user-id"),
      (error: unknown) => error instanceof MerchantIdentityError && error.code === "MEMBERSHIP_REQUIRED");
  });
});
