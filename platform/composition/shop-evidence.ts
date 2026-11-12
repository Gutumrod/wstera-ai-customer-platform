import type { KnowledgeCitation, KnowledgeRetrievalHit, KnowledgeRetrievalPort } from "../contracts/data/knowledge.js";
import type { CatalogItem, CatalogStockStatus, ShopCitation, ShopKnowledgeRepositoryPort, ShopProfile } from "../contracts/data/shop-knowledge.js";
import { SHOP_PROFILE_SOURCE_ID } from "../contracts/data/shop-knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { EvidenceFreshnessPort } from "../modules/ai-engine/support-orchestrator.js";
import { getCustomerShopProfile, searchCatalog } from "../modules/knowledge/shop-knowledge.js";

/**
 * Structured shop facts (profile, catalog rows) travel through the same evidence/citation pipeline as documents.
 * Their citations use a reserved "shop:" source namespace so freshness and display can route them back to the
 * shop repository: sourceId "shop:profile", or "shop:catalog:<sku>"; the chunk is the whole version, never a slice.
 */
const PROFILE_SOURCE = "shop:profile";
const CATALOG_PREFIX = "shop:catalog:";
const MAX_CATALOG_HITS = 3;

const stockLabel: Readonly<Record<CatalogStockStatus, string>> = {
  in_stock: "มีสินค้า", low_stock: "เหลือน้อย", out_of_stock: "สินค้าหมด", made_to_order: "สั่งทำ",
};
const channelLabel: Readonly<Record<string, string>> = {
  phone: "โทรศัพท์", mobile: "มือถือ", line: "LINE", facebook: "Facebook", email: "อีเมล", other: "ช่องทางอื่น",
};

export function isShopCitation(citation: KnowledgeCitation): boolean {
  return citation.sourceId === PROFILE_SOURCE || citation.sourceId.startsWith(CATALOG_PREFIX);
}

function toShopCitation(citation: KnowledgeCitation): ShopCitation {
  return citation.sourceId === PROFILE_SOURCE
    ? { workspaceId: citation.workspaceId, kind: "shop_profile", sourceId: SHOP_PROFILE_SOURCE_ID, sourceVersionId: citation.sourceVersionId }
    : { workspaceId: citation.workspaceId, kind: "catalog_item", sourceId: citation.sourceId.slice(CATALOG_PREFIX.length), sourceVersionId: citation.sourceVersionId };
}

function knowledgeCitation(shop: ShopCitation): KnowledgeCitation {
  const sourceId = shop.kind === "shop_profile" ? PROFILE_SOURCE : `${CATALOG_PREFIX}${shop.sourceId}`;
  return Object.freeze({
    workspaceId: shop.workspaceId, sourceId, sourceVersionId: shop.sourceVersionId,
    chunkId: `${sourceId}@${shop.sourceVersionId}`, locator: Object.freeze({ kind: "chunk" as const, chunkIndex: 0 }),
  });
}

export function profileText(profile: ShopProfile): string {
  const lines = [`ข้อมูลร้าน: ${profile.shopName}`, `ที่อยู่ร้าน (ที่ตั้ง): ${profile.address}`];
  for (const line of profile.hours) lines.push(`เวลาเปิด-ปิด ${line.days}: ${line.hours}`);
  if (profile.hoursNote) lines.push(`หมายเหตุเวลาเปิด-ปิด: ${profile.hoursNote}`);
  for (const contact of profile.contacts) lines.push(`ติดต่อ ${channelLabel[contact.channel] ?? contact.channel}: ${contact.value}${contact.note ? ` (${contact.note})` : ""}`);
  const { warranty, returns, shipping, payment } = profile.policies;
  if (warranty) lines.push(`การรับประกัน: ${warranty}`);
  if (returns) lines.push(`การคืนสินค้า: ${returns}`);
  if (shipping) lines.push(`การจัดส่ง: ${shipping}`);
  if (payment) lines.push(`การชำระเงิน: ${payment}`);
  if (profile.pickupNote) lines.push(`การรับสินค้าที่ร้าน: ${profile.pickupNote}`);
  return lines.join("\n");
}

export function catalogText(item: CatalogItem): string {
  const lines = [`สินค้า: ${item.name} (รหัส ${item.sku})`, `ราคา: ${item.priceThb.toLocaleString("en-US")} บาท`, `สถานะสินค้า: ${stockLabel[item.stockStatus]}`];
  if (item.fitments.length > 0) lines.push(`ใช้ได้กับรุ่น: ${item.fitments.join(", ")}`);
  if (item.note) lines.push(`หมายเหตุ: ${item.note}`);
  return lines.join("\n");
}

/** The approved profile as one evidence hit (null when the shop has none or the read fails). */
export async function shopProfileHit(shop: ShopKnowledgeRepositoryPort, workspace: TrustedWorkspaceContext): Promise<KnowledgeRetrievalHit | null> {
  try {
    const current = await getCustomerShopProfile(shop, workspace);
    if (!current) return null;
    const text = profileText(current.profile);
    // An oversized profile would make the extractive gate reject every message; leave it out instead.
    if (text.length > 12_000) return null;
    return Object.freeze({
      sourceId: PROFILE_SOURCE, versionId: current.citation.sourceVersionId, title: "ข้อมูลร้าน", text,
      score: 1, citation: knowledgeCitation(current.citation),
    });
  } catch {
    return null;
  }
}

async function catalogHits(shop: ShopKnowledgeRepositoryPort, workspace: TrustedWorkspaceContext, query: string): Promise<readonly KnowledgeRetrievalHit[]> {
  try {
    const matches = await searchCatalog(shop, workspace, query, MAX_CATALOG_HITS);
    return matches.map((match) => Object.freeze({
      sourceId: `${CATALOG_PREFIX}${match.item.sku}`, versionId: match.citation.sourceVersionId, title: match.item.name,
      text: catalogText(match.item), score: match.score, citation: knowledgeCitation(match.citation),
    }));
  } catch {
    return [];
  }
}

/**
 * Adds matching catalog rows and the shop profile to every document search. The profile is always present
 * (address, hours, contacts, policies are asked about in many phrasings); rows that match the query come first.
 * A failing shop read never breaks document answering.
 */
export function withShopEvidence(base: KnowledgeRetrievalPort, shop: ShopKnowledgeRepositoryPort): KnowledgeRetrievalPort {
  return Object.freeze({
    async search(input: Parameters<KnowledgeRetrievalPort["search"]>[0]) {
      const [documents, catalog, profile] = await Promise.all([
        base.search(input), catalogHits(shop, input.workspace, input.query), shopProfileHit(shop, input.workspace),
      ]);
      const shopHits = [...catalog, ...(profile ? [profile] : [])];
      if (shopHits.length === 0) return documents;
      const hits = [...shopHits, ...(documents.kind === "evidence" ? documents.hits : [])].slice(0, input.limit);
      return Object.freeze({ kind: "evidence" as const, hits: Object.freeze(hits) });
    },
  });
}

/** Broad (query-less) shop evidence for the model gate: the profile. */
export async function shopBroadEvidence(shop: ShopKnowledgeRepositoryPort, workspace: TrustedWorkspaceContext): Promise<readonly KnowledgeRetrievalHit[]> {
  const profile = await shopProfileHit(shop, workspace);
  return profile ? [profile] : [];
}

/** Shop citations are current only while their exact version is still the approved one; others go to the document check. */
export function withShopFreshness(base: EvidenceFreshnessPort, shop: ShopKnowledgeRepositoryPort): EvidenceFreshnessPort {
  return Object.freeze({
    async areCurrentAndApproved(workspace: TrustedWorkspaceContext, citations: readonly KnowledgeCitation[], audience: Parameters<EvidenceFreshnessPort["areCurrentAndApproved"]>[2]) {
      const shopCitations = citations.filter(isShopCitation);
      const documentCitations = citations.filter((citation) => !isShopCitation(citation));
      for (const citation of shopCitations) {
        if (!(await shop.isCurrentShopCitation(workspace, toShopCitation(citation)))) return false;
      }
      return documentCitations.length === 0 ? true : base.areCurrentAndApproved(workspace, documentCitations, audience);
    },
  });
}

/** Customer-readable name of a shop citation (product name or "ข้อมูลร้าน"), or null for document citations. */
export async function describeShopCitations(
  shop: ShopKnowledgeRepositoryPort, workspace: TrustedWorkspaceContext, citations: readonly KnowledgeCitation[],
): Promise<readonly (Readonly<{ title: string }> | null | undefined)[]> {
  let names: Map<string, string> | null = null;
  const result: (Readonly<{ title: string }> | null | undefined)[] = [];
  for (const citation of citations) {
    if (!isShopCitation(citation)) { result.push(undefined); continue; }
    if (citation.sourceId === PROFILE_SOURCE) { result.push({ title: "ข้อมูลร้าน" }); continue; }
    if (names === null) {
      names = new Map();
      try { for (const row of await shop.listApprovedCatalogItems(workspace)) names.set(row.item.sku, row.item.name); } catch { /* fall through to the generic title */ }
    }
    result.push({ title: names.get(citation.sourceId.slice(CATALOG_PREFIX.length)) ?? "สินค้าของร้าน" });
  }
  return result;
}
