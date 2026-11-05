import "server-only";
import { createHandoffRoutes } from "../../../composition/handoff-routes.js";
import { createMerchantHandoffHost } from "../../../composition/merchant-handoff-host.js";
import { requireMerchantIdentity } from "./identity.js";

export async function requireHandoffRoutes() {
  const { identity } = await requireMerchantIdentity();
  const host = await createMerchantHandoffHost(identity);
  return createHandoffRoutes(async () => host);
}
