import "server-only";
import { createHandoffRoutes } from "../../../composition/handoff-routes.js";
import { createMerchantHandoffHost } from "../../../composition/merchant-handoff-host.js";
import { requireMerchantIdentity } from "./identity.js";

/** Identity is resolved inside each route's try block so auth failures map to 401/403, not a bare 500. */
export function requireHandoffRoutes() {
  return createHandoffRoutes(async () => {
    const { identity } = await requireMerchantIdentity();
    return createMerchantHandoffHost(identity);
  });
}
