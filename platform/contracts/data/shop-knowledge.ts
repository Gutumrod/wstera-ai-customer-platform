import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export const MAX_CATALOG_ITEMS_PER_WORKSPACE = 5_000;

/** Same lifecycle words as knowledge versions, minus the extraction states: structured data needs no indexing. */
export type ShopVersionStatus = "draft" | "approved" | "revoked";

export type ShopContactChannel = "phone" | "mobile" | "line" | "facebook" | "email" | "other";

/** Structured shop identity. Every field is customer-facing; internal notes belong in documents with visibility "internal". */
export type ShopProfile = Readonly<{
  shopName: string;
  address: string;
  /** Opening hours as shop-written lines, e.g. { days: "จันทร์, พุธ-ศุกร์", hours: "09:00-18:00" } or { days: "อังคาร", hours: "หยุด" }. */
  hours: readonly Readonly<{ days: string; hours: string }>[];
  hoursNote?: string;
  contacts: readonly Readonly<{ channel: ShopContactChannel; value: string; note?: string }>[];
  policies: Readonly<{ warranty?: string; returns?: string; shipping?: string; payment?: string }>;
  pickupNote?: string;
}>;

export type ShopProfileVersion = Readonly<{
  workspaceId: string;
  versionId: string;
  profile: ShopProfile;
  status: ShopVersionStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}>;

export type CatalogStockStatus = "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";

/** One product as a row; never split into text chunks. */
export type CatalogItem = Readonly<{
  sku: string;
  name: string;
  /** Vehicles it fits, one entry per model, e.g. "Yamaha XMAX ปี 2018-2024". */
  fitments: readonly string[];
  /** Whole baht, VAT included. */
  priceThb: number;
  stockStatus: CatalogStockStatus;
  /** Free shop text (material, load, lead time). Passes the same injection/markup gate as documents. */
  note?: string;
}>;

export type CatalogItemVersion = Readonly<{
  workspaceId: string;
  versionId: string;
  item: CatalogItem;
  status: ShopVersionStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}>;

/** What the answer brain cites: the exact approved version a structured fact came from. */
export type ShopCitation = Readonly<{
  workspaceId: string;
  kind: "shop_profile" | "catalog_item";
  /** "shop-profile" for the profile, the SKU for a catalog item. */
  sourceId: string;
  sourceVersionId: string;
}>;

export type CustomerShopProfile = Readonly<{ profile: ShopProfile; citation: ShopCitation }>;
export type CatalogMatch = Readonly<{ item: CatalogItem; score: number; citation: ShopCitation }>;

export const SHOP_PROFILE_SOURCE_ID = "shop-profile";

type Awaitable<T> = T | Promise<T>;

/**
 * Every method is scoped by the server-resolved workspace; adapters enforce it
 * again at the storage boundary (RLS). Errors are KnowledgeError codes
 * (INVALID_KNOWLEDGE_INPUT, VERSION_NOT_FOUND, VERSION_CONFLICT, APPROVED_VERSION_EXISTS,
 * INVALID_VERSION_TRANSITION, UNSAFE_KNOWLEDGE_TEXT).
 */
export interface ShopKnowledgeRepositoryPort {
  createProfileVersion(workspace: TrustedWorkspaceContext, input: Readonly<{ versionId: string; profile: ShopProfile; createdAt?: string }>): Awaitable<ShopProfileVersion>;
  approveProfileVersion(workspace: TrustedWorkspaceContext, versionId: string, input: Readonly<{ approvedBy: string; approvedAt?: string }>): Awaitable<ShopProfileVersion>;
  revokeProfileVersion(workspace: TrustedWorkspaceContext, versionId: string, input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>): Awaitable<ShopProfileVersion>;
  /** The single approved profile of this workspace, or null. */
  getApprovedProfile(workspace: TrustedWorkspaceContext): Awaitable<ShopProfileVersion | null>;

  createCatalogItemVersion(workspace: TrustedWorkspaceContext, input: Readonly<{ versionId: string; item: CatalogItem; createdAt?: string }>): Awaitable<CatalogItemVersion>;
  /** At most one approved version per (workspace, sku); a second approval is APPROVED_VERSION_EXISTS until the first is revoked. */
  approveCatalogItemVersion(workspace: TrustedWorkspaceContext, sku: string, versionId: string, input: Readonly<{ approvedBy: string; approvedAt?: string }>): Awaitable<CatalogItemVersion>;
  revokeCatalogItemVersion(workspace: TrustedWorkspaceContext, sku: string, versionId: string, input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>): Awaitable<CatalogItemVersion>;
  /** Approved rows only, ordered by sku, bounded by MAX_CATALOG_ITEMS_PER_WORKSPACE. */
  listApprovedCatalogItems(workspace: TrustedWorkspaceContext): Awaitable<readonly CatalogItemVersion[]>;
  /** True only while the cited version is still the approved one. */
  isCurrentShopCitation(workspace: TrustedWorkspaceContext, citation: ShopCitation): Awaitable<boolean>;
}
