import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type {
  CatalogItemVersion, ShopKnowledgeRepositoryPort, ShopProfileVersion, ShopCitation,
} from "../../../contracts/data/shop-knowledge.js";
import { MAX_CATALOG_ITEMS_PER_WORKSPACE } from "../../../contracts/data/shop-knowledge.js";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";
import { validateCatalogItem, validateShopProfile } from "../shop-knowledge.js";

const profileKey = (workspaceId: string, versionId: string): string => `${workspaceId}\u0000${versionId}`;
const itemKey = (workspaceId: string, sku: string, versionId: string): string => `${workspaceId}\u0000${sku}\u0000${versionId}`;
const now = (): string => new Date().toISOString();

function timestamp(value: string | undefined): string {
  const result = value ?? now();
  if (typeof result !== "string" || !Number.isFinite(Date.parse(result))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return result;
}

function required(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return value.trim();
}

function assertKeys(input: object, allowed: readonly string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
}

export class InMemoryShopKnowledgeRepository implements ShopKnowledgeRepositoryPort {
  private readonly profiles = new Map<string, ShopProfileVersion>();
  private readonly items = new Map<string, CatalogItemVersion>();

  createProfileVersion(workspace: TrustedWorkspaceContext, input: Readonly<{ versionId: string; profile: ShopProfileVersion["profile"]; createdAt?: string }>): ShopProfileVersion {
    assertKeys(input, ["versionId", "profile", "createdAt"]);
    const versionId = required(input.versionId);
    const id = profileKey(workspace.workspaceId, versionId);
    if (this.profiles.has(id)) throw new KnowledgeError("VERSION_CONFLICT");
    const version = Object.freeze({ workspaceId: workspace.workspaceId, versionId,
      profile: validateShopProfile(input.profile), status: "draft" as const, createdAt: timestamp(input.createdAt) });
    this.profiles.set(id, version);
    return version;
  }

  approveProfileVersion(workspace: TrustedWorkspaceContext, versionId: string, input: Readonly<{ approvedBy: string; approvedAt?: string }>): ShopProfileVersion {
    assertKeys(input, ["approvedBy", "approvedAt"]);
    const current = this.profiles.get(profileKey(workspace.workspaceId, versionId));
    if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
    if (current.status !== "draft") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    if ([...this.profiles.values()].some((version) => version.workspaceId === workspace.workspaceId && version.status === "approved")) {
      throw new KnowledgeError("APPROVED_VERSION_EXISTS");
    }
    const next = Object.freeze({ ...current, status: "approved" as const,
      approvedBy: required(input.approvedBy), approvedAt: timestamp(input.approvedAt) });
    this.profiles.set(profileKey(workspace.workspaceId, versionId), next);
    return next;
  }

  revokeProfileVersion(workspace: TrustedWorkspaceContext, versionId: string, input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>): ShopProfileVersion {
    assertKeys(input, ["revokedBy", "reason", "revokedAt"]);
    const current = this.profiles.get(profileKey(workspace.workspaceId, versionId));
    if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
    if (current.status !== "approved") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    const next = Object.freeze({ ...current, status: "revoked" as const,
      revokedBy: required(input.revokedBy), revocationReason: required(input.reason), revokedAt: timestamp(input.revokedAt) });
    this.profiles.set(profileKey(workspace.workspaceId, versionId), next);
    return next;
  }

  getApprovedProfile(workspace: TrustedWorkspaceContext): ShopProfileVersion | null {
    return [...this.profiles.values()].find((version) => version.workspaceId === workspace.workspaceId && version.status === "approved") ?? null;
  }

  createCatalogItemVersion(workspace: TrustedWorkspaceContext, input: Readonly<{ versionId: string; item: CatalogItemVersion["item"]; createdAt?: string }>): CatalogItemVersion {
    assertKeys(input, ["versionId", "item", "createdAt"]);
    const versionId = required(input.versionId);
    const item = validateCatalogItem(input.item);
    const id = itemKey(workspace.workspaceId, item.sku, versionId);
    if (this.items.has(id)) {
      throw new KnowledgeError("VERSION_CONFLICT");
    }
    const count = new Set([...this.items.values()].filter((version) => version.workspaceId === workspace.workspaceId).map((version) => version.item.sku)).size;
    if (!this.items.has(id) && count >= MAX_CATALOG_ITEMS_PER_WORKSPACE && ![...this.items.values()].some((v) => v.workspaceId === workspace.workspaceId && v.item.sku === item.sku)) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const version = Object.freeze({ workspaceId: workspace.workspaceId, versionId, item, status: "draft" as const, createdAt: timestamp(input.createdAt) });
    this.items.set(id, version);
    return version;
  }

  approveCatalogItemVersion(workspace: TrustedWorkspaceContext, sku: string, versionId: string, input: Readonly<{ approvedBy: string; approvedAt?: string }>): CatalogItemVersion {
    assertKeys(input, ["approvedBy", "approvedAt"]);
    const id = itemKey(workspace.workspaceId, sku, versionId);
    const current = this.items.get(id);
    if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
    if (current.status !== "draft") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    if ([...this.items.values()].some((version) => version.workspaceId === workspace.workspaceId && version.item.sku === sku && version.status === "approved")) {
      throw new KnowledgeError("APPROVED_VERSION_EXISTS");
    }
    const next = Object.freeze({ ...current, status: "approved" as const,
      approvedBy: required(input.approvedBy), approvedAt: timestamp(input.approvedAt) });
    this.items.set(id, next);
    return next;
  }

  revokeCatalogItemVersion(workspace: TrustedWorkspaceContext, sku: string, versionId: string, input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>): CatalogItemVersion {
    assertKeys(input, ["revokedBy", "reason", "revokedAt"]);
    const id = itemKey(workspace.workspaceId, sku, versionId);
    const current = this.items.get(id);
    if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
    if (current.status !== "approved") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    const next = Object.freeze({ ...current, status: "revoked" as const,
      revokedBy: required(input.revokedBy), revocationReason: required(input.reason), revokedAt: timestamp(input.revokedAt) });
    this.items.set(id, next);
    return next;
  }

  listApprovedCatalogItems(workspace: TrustedWorkspaceContext): readonly CatalogItemVersion[] {
    return Object.freeze([...this.items.values()]
      .filter((version) => version.workspaceId === workspace.workspaceId && version.status === "approved")
      .sort((a, b) => a.item.sku.localeCompare(b.item.sku)).slice(0, MAX_CATALOG_ITEMS_PER_WORKSPACE));
  }

  isCurrentShopCitation(workspace: TrustedWorkspaceContext, citation: ShopCitation): boolean {
    if (citation.workspaceId !== workspace.workspaceId) return false;
    if (citation.kind === "shop_profile") {
      const version = this.profiles.get(profileKey(workspace.workspaceId, citation.sourceVersionId));
      return citation.sourceId === "shop-profile" && version?.status === "approved";
    }
    const version = this.items.get(itemKey(workspace.workspaceId, citation.sourceId, citation.sourceVersionId));
    return version?.status === "approved";
  }
}
