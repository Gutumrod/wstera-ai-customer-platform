import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import { KnowledgeError, MAX_KNOWLEDGE_QUERY_CHARS } from "../../contracts/data/knowledge.js";
import type {
  CatalogItem, CatalogMatch, CatalogStockStatus, CustomerShopProfile, ShopContactChannel,
  ShopKnowledgeRepositoryPort, ShopProfile, ShopProfileVersion, ShopCitation,
} from "../../contracts/data/shop-knowledge.js";
import { SHOP_PROFILE_SOURCE_ID } from "../../contracts/data/shop-knowledge.js";
import { analyzeText } from "./index.js";
import { isInjectionOrMarkup } from "../../adapters/answers/extractive/extractive-answerability-port.js";

const stockStatuses = new Set<CatalogStockStatus>(["in_stock", "low_stock", "out_of_stock", "made_to_order"]);
const contactChannels = new Set<ShopContactChannel>(["phone", "mobile", "line", "facebook", "email", "other"]);
const thaiFiller = /ราคา|เท่าไหร่|เท่าไร|ครับผม|ครับ|ค่ะ|คะ|มี|ไหม/gu;
const tokenPattern = /[a-z0-9]+(?:[-_./][a-z0-9]+)*|[\u0E00-\u0E7F]+/gu;
const latinTokenPattern = /^[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;
// "ADV 350" and "ADV350" are the same model: glue letters to the digits that follow them.
const joinModel = (value: string): string => value.replace(/([a-z])\s+(\d)/gu, "$1$2");
const compact = (value: string): string => value.replace(/[-_./]/gu, "");

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function keysOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function text(value: unknown, max: number, optional = false): string | undefined {
  if (typeof value !== "string") throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  const trimmed = value.trim();
  if (trimmed.length === 0 && optional) return undefined;
  if (trimmed.length === 0 || trimmed.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  if (isInjectionOrMarkup(trimmed)) throw new KnowledgeError("UNSAFE_KNOWLEDGE_TEXT");
  return trimmed;
}

export function validateShopProfile(input: ShopProfile): ShopProfile {
  if (!record(input) || !keysOnly(input, ["shopName", "address", "hours", "hoursNote", "contacts", "policies", "pickupNote"])) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  const shopName = text(input.shopName, 200)!;
  const address = text(input.address, 500)!;
  if (!Array.isArray(input.hours) || input.hours.length > 14 || !Array.isArray(input.contacts) || input.contacts.length > 20
    || !record(input.policies) || !keysOnly(input.policies, ["warranty", "returns", "shipping", "payment"])) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  const hours = Object.freeze(input.hours.map((line) => {
    if (!record(line) || !keysOnly(line, ["days", "hours"])) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    return Object.freeze({ days: text(line.days, 1000)!, hours: text(line.hours, 1000)! });
  }));
  const contacts = Object.freeze(input.contacts.map((entry) => {
    if (!record(entry) || !keysOnly(entry, ["channel", "value", "note"]) || !contactChannels.has(entry.channel as ShopContactChannel)) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const note = entry.note === undefined ? undefined : text(entry.note, 1000, true);
    return Object.freeze({ channel: entry.channel as ShopContactChannel, value: text(entry.value, 1000)!, ...(note ? { note } : {}) });
  }));
  const policies: { warranty?: string; returns?: string; shipping?: string; payment?: string } = {};
  for (const key of ["warranty", "returns", "shipping", "payment"] as const) {
    const value = input.policies[key];
    if (value !== undefined) {
      const normalized = text(value, 1000, true);
      if (normalized) policies[key] = normalized;
    }
  }
  const hoursNote = input.hoursNote === undefined ? undefined : text(input.hoursNote, 1000, true);
  const pickupNote = input.pickupNote === undefined ? undefined : text(input.pickupNote, 1000, true);
  return Object.freeze({ shopName, address, hours, contacts, policies: Object.freeze(policies),
    ...(hoursNote ? { hoursNote } : {}), ...(pickupNote ? { pickupNote } : {}) });
}

export function validateCatalogItem(input: CatalogItem): CatalogItem {
  if (!record(input) || !keysOnly(input, ["sku", "name", "fitments", "priceThb", "stockStatus", "note"])) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  if (typeof input.sku !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(input.sku)
    || !Array.isArray(input.fitments) || input.fitments.length > 30
    || !Number.isInteger(input.priceThb) || input.priceThb < 0 || input.priceThb > 10_000_000
    || !stockStatuses.has(input.stockStatus)) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  const fitments = Object.freeze(input.fitments.map((fitment) => text(fitment, 200)!));
  const name = text(input.name, 200)!;
  const note = input.note === undefined ? undefined : text(input.note, 1000, true);
  return Object.freeze({ sku: input.sku, name, fitments, priceThb: input.priceThb,
    stockStatus: input.stockStatus, ...(note ? { note } : {}) });
}

function citation(workspace: TrustedWorkspaceContext, kind: ShopCitation["kind"], sourceId: string, versionId: string): ShopCitation {
  return Object.freeze({ workspaceId: workspace.workspaceId, kind, sourceId, sourceVersionId: versionId });
}

export async function getCustomerShopProfile(
  repository: ShopKnowledgeRepositoryPort,
  workspace: TrustedWorkspaceContext,
): Promise<CustomerShopProfile | null> {
  const version: ShopProfileVersion | null = await repository.getApprovedProfile(workspace);
  if (!version) return null;
  if (version.workspaceId !== workspace.workspaceId || version.status !== "approved") return null;
  return Object.freeze({ profile: version.profile, citation: citation(workspace, "shop_profile", SHOP_PROFILE_SOURCE_ID, version.versionId) });
}

export async function searchCatalog(
  repository: ShopKnowledgeRepositoryPort,
  workspace: TrustedWorkspaceContext,
  query: string,
  limit = 5,
): Promise<readonly CatalogMatch[]> {
  if (typeof query !== "string" || query.trim().length === 0 || query.length > MAX_KNOWLEDGE_QUERY_CHARS
    || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new KnowledgeError("INVALID_RETRIEVAL_QUERY");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(query)) throw new KnowledgeError("INVALID_RETRIEVAL_QUERY");
  for (let i = 0; i < query.length; i += 1) {
    const code = query.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = query.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new KnowledgeError("INVALID_RETRIEVAL_QUERY");
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new KnowledgeError("INVALID_RETRIEVAL_QUERY");
  }
  const normalized = joinModel(query.normalize("NFKC").toLocaleLowerCase("th-TH"));
  if (isInjectionOrMarkup(normalized)) return Object.freeze([]);
  const cleanQuery = normalized.replace(thaiFiller, " ");
  const queryAnalysis = analyzeText(cleanQuery);
  const latinTokens = [...new Set([...queryAnalysis.terms].filter((token) => latinTokenPattern.test(token) && /[a-z]/u.test(token)))];
  // Thai has no word breaks: use 4-character windows (shorter runs use their own length) and require
  // half of them in the row, so one shared bigram of filler text ("ร้านอยู่ที่ไหน") is not a match.
  const thaiGrams = new Set<string>();
  for (const run of cleanQuery.match(/[\u0E00-\u0E7F]+/gu) ?? []) {
    const chars = Array.from(run);
    if (chars.length < 2) continue;
    const size = Math.min(4, chars.length);
    for (let i = 0; i + size <= chars.length; i += 1) thaiGrams.add(chars.slice(i, i + size).join(""));
  }
  const versions = await repository.listApprovedCatalogItems(workspace);
  const ranked: CatalogMatch[] = [];
  for (const version of versions) {
    if (version.workspaceId !== workspace.workspaceId || version.status !== "approved") continue;
    const item = version.item;
    const haystack = joinModel([item.sku, item.name, ...item.fitments, item.note ?? ""].join(" ").normalize("NFKC").toLocaleLowerCase("th-TH"));
    const haystackTokens = [...(haystack.match(tokenPattern) ?? [])];
    const exactSku = [...(normalized.match(tokenPattern) ?? [])].some((token) => {
      const sku = item.sku.normalize("NFKC").toLocaleLowerCase("th-TH");
      return token === sku || compact(token) === compact(sku);
    });
    if (!exactSku && latinTokens.some((token) => !haystackTokens.some((candidate) => candidate === token || candidate.startsWith(token)))) continue;
    const thaiCoverage = thaiGrams.size ? [...thaiGrams].filter((gram) => haystack.includes(gram)).length / thaiGrams.size : 0;
    if (!exactSku && thaiGrams.size && thaiCoverage < 0.5) continue;
    const latinMatched = latinTokens.filter((token) => haystackTokens.some((candidate) => candidate === token || candidate.startsWith(token))).length;
    const score = exactSku ? 100 : thaiCoverage + (latinTokens.length ? latinMatched / latinTokens.length : 0);
    if (score <= 0) continue;
    ranked.push(Object.freeze({ item, score, citation: citation(workspace, "catalog_item", item.sku, version.versionId) }));
  }
  ranked.sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku));
  return Object.freeze(ranked.slice(0, limit));
}
