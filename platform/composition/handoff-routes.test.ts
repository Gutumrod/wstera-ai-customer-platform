import assert from "node:assert/strict";
import test from "node:test";
import { MerchantIdentityError } from "../modules/tenancy/merchant-identity.js";
import { createHandoffRoutes } from "./handoff-routes.js";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

test("every handoff route maps an identity failure raised while resolving the host to 401/403", async () => {
  const context = { params: Promise.resolve({ conversationId: "c1" }) };
  const headers = { origin: "http://localhost:3000", "content-type": "application/json" };
  const cases: Array<[MerchantIdentityError["code"], number]> = [["UNAUTHENTICATED", 401], ["MEMBERSHIP_REQUIRED", 403]];
  for (const [code, status] of cases) {
    const routes = createHandoffRoutes(async () => { throw new MerchantIdentityError(code); });
    const post = () => new Request("http://localhost:3000/x", { method: "POST", headers, body: JSON.stringify({ text: "x", deliveryId: "d" }) });
    const get = () => new Request("http://localhost:3000/x", { headers: { origin: "http://localhost:3000" } });
    const responses = [await routes.list(get()), await routes.messages(get(), context), await routes.claim(post(), context), await routes.reply(post(), context), await routes.release(post(), context)];
    for (const response of responses) {
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: code });
    }
  }
});
