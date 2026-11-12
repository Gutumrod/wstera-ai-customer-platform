import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import {
  MAX_CATALOG_ITEMS_PER_WORKSPACE,
  SHOP_PROFILE_SOURCE_ID,
  type CatalogItem,
  type CatalogItemVersion,
  type CatalogStockStatus,
  type ShopCitation,
  type ShopKnowledgeRepositoryPort,
  type ShopProfile,
  type ShopProfileVersion,
  type ShopVersionStatus,
} from "../../../contracts/data/shop-knowledge.js";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "./knowledge-repository.js";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

type ProfileRow = PostgresRow & {
  workspace_id: string;
  version_id: string;
  profile: ShopProfile | string;
  status: ShopVersionStatus;
  created_at: Date | string;
  approved_at: Date | string | null;
  approved_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

type CatalogRow = PostgresRow & {
  workspace_id: string;
  sku: string;
  version_id: string;
  name: string;
  fitments: readonly string[] | string[] | string;
  price_thb: number;
  stock_status: CatalogStockStatus;
  note: string | null;
  status: ShopVersionStatus;
  created_at: Date | string;
  approved_at: Date | string | null;
  approved_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return date.toISOString();
}

function asNullableIso(value: Date | string | null): string | undefined {
  return value === null ? undefined : asIso(value);
}

function asStringArray(value: CatalogRow["fitments"]): readonly string[] {
  if (Array.isArray(value)) return Object.freeze([...value].map((entry) => String(entry)));
  if (typeof value === "string") {
    // PGlite may surface text[] as a PostgreSQL array literal; fall back conservatively.
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1);
      if (inner.length === 0) return Object.freeze([]);
      return Object.freeze(inner.split(",").map((part) => part.replace(/^"|"$/gu, "").replace(/\\"/gu, '"')));
    }
  }
  return Object.freeze([]);
}

function asProfile(value: ProfileRow["profile"]): ShopProfile {
  if (typeof value === "string") return JSON.parse(value) as ShopProfile;
  if (isRecord(value)) return value as unknown as ShopProfile;
  return JSON.parse(JSON.stringify(value)) as ShopProfile;
}

function freezeProfile(profile: ShopProfile): ShopProfile {
  return Object.freeze({
    ...profile,
    hours: Object.freeze((profile.hours ?? []).map((line) => Object.freeze({ ...line }))),
    contacts: Object.freeze((profile.contacts ?? []).map((contact) => Object.freeze({ ...contact }))),
    policies: Object.freeze({ ...(profile.policies ?? {}) }),
  });
}

function freezeCatalogItem(item: CatalogItem): CatalogItem {
  return Object.freeze({
    ...item,
    fitments: Object.freeze([...item.fitments]),
  });
}

function mapProfileVersion(row: ProfileRow): ShopProfileVersion {
  return Object.freeze({
    workspaceId: row.workspace_id,
    versionId: row.version_id,
    profile: freezeProfile(asProfile(row.profile)),
    status: row.status,
    createdAt: asIso(row.created_at),
    ...(asNullableIso(row.approved_at) ? { approvedAt: asNullableIso(row.approved_at), approvedBy: row.approved_by! } : {}),
    ...(asNullableIso(row.revoked_at) ? {
      revokedAt: asNullableIso(row.revoked_at),
      revokedBy: row.revoked_by!,
      revocationReason: row.revocation_reason!,
    } : {}),
  });
}

function mapCatalogVersion(row: CatalogRow): CatalogItemVersion {
  const item: CatalogItem = {
    sku: row.sku,
    name: row.name,
    fitments: asStringArray(row.fitments),
    priceThb: Number(row.price_thb),
    stockStatus: row.stock_status,
    ...(row.note !== null ? { note: row.note } : {}),
  };
  return Object.freeze({
    workspaceId: row.workspace_id,
    versionId: row.version_id,
    item: freezeCatalogItem(item),
    status: row.status,
    createdAt: asIso(row.created_at),
    ...(asNullableIso(row.approved_at) ? { approvedAt: asNullableIso(row.approved_at), approvedBy: row.approved_by! } : {}),
    ...(asNullableIso(row.revoked_at) ? {
      revokedAt: asNullableIso(row.revoked_at),
      revokedBy: row.revoked_by!,
      revocationReason: row.revocation_reason!,
    } : {}),
  });
}

function isPostgresError(error: unknown): error is { code: string; constraint?: string } {
  return isRecord(error) && typeof error.code === "string";
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof KnowledgeError) throw error;
  if (isPostgresError(error)) {
    if (error.code === "23505" && (error.constraint === "shop_profile_one_approved_per_workspace"
      || error.constraint === "catalog_item_one_approved_per_sku")) {
      throw new KnowledgeError("APPROVED_VERSION_EXISTS");
    }
    if (error.code === "23505") throw new KnowledgeError("VERSION_CONFLICT");
    if (error.code === "42501") throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
    if (error.code === "23514") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
  }
  throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
}

async function loadProfileVersion(
  query: PostgresQueryPort,
  workspaceId: string,
  versionId: string,
): Promise<ShopProfileVersion | null> {
  const result = await query.query<ProfileRow>(
    `SELECT workspace_id, version_id, profile, status, created_at, approved_at, approved_by, revoked_at, revoked_by, revocation_reason
     FROM aicp.shop_profile_versions WHERE workspace_id = $1 AND version_id = $2`,
    [workspaceId, versionId],
  );
  return result.rows[0] ? mapProfileVersion(result.rows[0]) : null;
}

async function loadCatalogVersion(
  query: PostgresQueryPort,
  workspaceId: string,
  sku: string,
  versionId: string,
): Promise<CatalogItemVersion | null> {
  const result = await query.query<CatalogRow>(
    `SELECT workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, status, created_at,
            approved_at, approved_by, revoked_at, revoked_by, revocation_reason
     FROM aicp.catalog_item_versions WHERE workspace_id = $1 AND sku = $2 AND version_id = $3`,
    [workspaceId, sku, versionId],
  );
  return result.rows[0] ? mapCatalogVersion(result.rows[0]) : null;
}

/**
 * PostgreSQL implementation of the structured shop-knowledge repository.
 * Runs every operation inside a workspace-scoped transaction (SET LOCAL app.workspace_id)
 * so RLS enforces tenant isolation at the storage boundary.
 */
export class PostgresShopKnowledgeRepository implements ShopKnowledgeRepositoryPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  private async scoped<T>(workspace: TrustedWorkspaceContext, operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
    if (!isRecord(workspace) || typeof workspace.workspaceId !== "string" || !identifierPattern.test(workspace.workspaceId)) {
      throw new KnowledgeError("UNTRUSTED_WORKSPACE_SELECTOR");
    }
    try {
      return await this.database.transaction(async (query) => {
        await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
        return operation(query);
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async createProfileVersion(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{ versionId: string; profile: ShopProfile; createdAt?: string }>,
  ): Promise<ShopProfileVersion> {
    const { validateShopProfile } = await import("../../../modules/knowledge/shop-knowledge.js");
    const profile = validateShopProfile(input.profile);
    if (typeof input.versionId !== "string" || !identifierPattern.test(input.versionId)) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const createdAt = input.createdAt ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(createdAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    return this.scoped(workspace, async (query) => {
      const inserted = await query.query<ProfileRow>(
        `INSERT INTO aicp.shop_profile_versions (workspace_id, version_id, profile, created_at)
         VALUES ($1, $2, $3::jsonb, $4)
         RETURNING workspace_id, version_id, profile, status, created_at, approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, input.versionId, JSON.stringify(profile), createdAt],
      );
      if (!inserted.rows[0]) throw new KnowledgeError("VERSION_CONFLICT");
      return mapProfileVersion(inserted.rows[0]);
    });
  }

  async approveProfileVersion(
    workspace: TrustedWorkspaceContext,
    versionId: string,
    input: Readonly<{ approvedBy: string; approvedAt?: string }>,
  ): Promise<ShopProfileVersion> {
    if (!isRecord(input) || typeof input.approvedBy !== "string" || !identifierPattern.test(input.approvedBy)
      || (input.approvedAt !== undefined && !Number.isFinite(Date.parse(input.approvedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const approvedAt = input.approvedAt ?? new Date().toISOString();
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<ProfileRow>(
        `UPDATE aicp.shop_profile_versions SET status = 'approved', approved_at = $3, approved_by = $4
         WHERE workspace_id = $1 AND version_id = $2 AND status = 'draft'
         RETURNING workspace_id, version_id, profile, status, created_at, approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, versionId, approvedAt, input.approvedBy],
      );
      if (!updated.rows[0]) {
        const current = await loadProfileVersion(query, workspace.workspaceId, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("INVALID_VERSION_TRANSITION");
      }
      return mapProfileVersion(updated.rows[0]);
    });
  }

  async revokeProfileVersion(
    workspace: TrustedWorkspaceContext,
    versionId: string,
    input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>,
  ): Promise<ShopProfileVersion> {
    if (!isRecord(input) || typeof input.revokedBy !== "string" || !identifierPattern.test(input.revokedBy)
      || typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.length > 500
      || (input.revokedAt !== undefined && !Number.isFinite(Date.parse(input.revokedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const revokedAt = input.revokedAt ?? new Date().toISOString();
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<ProfileRow>(
        `UPDATE aicp.shop_profile_versions SET status = 'revoked', revoked_at = $3, revoked_by = $4, revocation_reason = $5
         WHERE workspace_id = $1 AND version_id = $2 AND status = 'approved'
         RETURNING workspace_id, version_id, profile, status, created_at, approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, versionId, revokedAt, input.revokedBy, input.reason],
      );
      if (!updated.rows[0]) {
        const current = await loadProfileVersion(query, workspace.workspaceId, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("INVALID_VERSION_TRANSITION");
      }
      return mapProfileVersion(updated.rows[0]);
    });
  }

  async getApprovedProfile(workspace: TrustedWorkspaceContext): Promise<ShopProfileVersion | null> {
    return this.scoped(workspace, async (query) => {
      const result = await query.query<ProfileRow>(
        `SELECT workspace_id, version_id, profile, status, created_at, approved_at, approved_by, revoked_at, revoked_by, revocation_reason
         FROM aicp.shop_profile_versions WHERE workspace_id = $1 AND status = 'approved' LIMIT 1`,
        [workspace.workspaceId],
      );
      return result.rows[0] ? mapProfileVersion(result.rows[0]) : null;
    });
  }

  async createCatalogItemVersion(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{ versionId: string; item: CatalogItem; createdAt?: string }>,
  ): Promise<CatalogItemVersion> {
    const { validateCatalogItem } = await import("../../../modules/knowledge/shop-knowledge.js");
    const item = validateCatalogItem(input.item);
    if (typeof input.versionId !== "string" || !identifierPattern.test(input.versionId)) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const createdAt = input.createdAt ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(createdAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    return this.scoped(workspace, async (query) => {
      const inserted = await query.query<CatalogRow>(
        `INSERT INTO aicp.catalog_item_versions
           (workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, created_at)
         VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)
         RETURNING workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, item.sku, input.versionId, item.name, [...item.fitments], item.priceThb, item.stockStatus, item.note ?? null, createdAt],
      );
      if (!inserted.rows[0]) throw new KnowledgeError("VERSION_CONFLICT");
      return mapCatalogVersion(inserted.rows[0]);
    });
  }

  async approveCatalogItemVersion(
    workspace: TrustedWorkspaceContext,
    sku: string,
    versionId: string,
    input: Readonly<{ approvedBy: string; approvedAt?: string }>,
  ): Promise<CatalogItemVersion> {
    if (!isRecord(input) || typeof input.approvedBy !== "string" || !identifierPattern.test(input.approvedBy)
      || (input.approvedAt !== undefined && !Number.isFinite(Date.parse(input.approvedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const approvedAt = input.approvedAt ?? new Date().toISOString();
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<CatalogRow>(
        `UPDATE aicp.catalog_item_versions SET status = 'approved', approved_at = $4, approved_by = $5
         WHERE workspace_id = $1 AND sku = $2 AND version_id = $3 AND status = 'draft'
         RETURNING workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, sku, versionId, approvedAt, input.approvedBy],
      );
      if (!updated.rows[0]) {
        const current = await loadCatalogVersion(query, workspace.workspaceId, sku, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("INVALID_VERSION_TRANSITION");
      }
      return mapCatalogVersion(updated.rows[0]);
    });
  }

  async revokeCatalogItemVersion(
    workspace: TrustedWorkspaceContext,
    sku: string,
    versionId: string,
    input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>,
  ): Promise<CatalogItemVersion> {
    if (!isRecord(input) || typeof input.revokedBy !== "string" || !identifierPattern.test(input.revokedBy)
      || typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.length > 500
      || (input.revokedAt !== undefined && !Number.isFinite(Date.parse(input.revokedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const revokedAt = input.revokedAt ?? new Date().toISOString();
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<CatalogRow>(
        `UPDATE aicp.catalog_item_versions SET status = 'revoked', revoked_at = $4, revoked_by = $5, revocation_reason = $6
         WHERE workspace_id = $1 AND sku = $2 AND version_id = $3 AND status = 'approved'
         RETURNING workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, sku, versionId, revokedAt, input.revokedBy, input.reason],
      );
      if (!updated.rows[0]) {
        const current = await loadCatalogVersion(query, workspace.workspaceId, sku, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("INVALID_VERSION_TRANSITION");
      }
      return mapCatalogVersion(updated.rows[0]);
    });
  }

  async listApprovedCatalogItems(workspace: TrustedWorkspaceContext): Promise<readonly CatalogItemVersion[]> {
    return this.scoped(workspace, async (query) => {
      const result = await query.query<CatalogRow>(
        `SELECT workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, status, created_at,
                approved_at, approved_by, revoked_at, revoked_by, revocation_reason
         FROM aicp.catalog_item_versions
         WHERE workspace_id = $1 AND status = 'approved'
         ORDER BY sku
         LIMIT $2`,
        [workspace.workspaceId, MAX_CATALOG_ITEMS_PER_WORKSPACE],
      );
      return Object.freeze(result.rows.map(mapCatalogVersion));
    });
  }

  async isCurrentShopCitation(workspace: TrustedWorkspaceContext, citation: ShopCitation): Promise<boolean> {
    if (citation.workspaceId !== workspace.workspaceId) return false;
    return this.scoped(workspace, async (query) => {
      if (citation.kind === "shop_profile") {
        if (citation.sourceId !== SHOP_PROFILE_SOURCE_ID) return false;
        const result = await query.query<PostgresRow>(
          `SELECT 1 AS current FROM aicp.shop_profile_versions
           WHERE workspace_id = $1 AND version_id = $2 AND status = 'approved'`,
          [workspace.workspaceId, citation.sourceVersionId],
        );
        return result.rows.length === 1;
      }
      if (citation.kind === "catalog_item") {
        const result = await query.query<PostgresRow>(
          `SELECT 1 AS current FROM aicp.catalog_item_versions
           WHERE workspace_id = $1 AND sku = $2 AND version_id = $3 AND status = 'approved'`,
          [workspace.workspaceId, citation.sourceId, citation.sourceVersionId],
        );
        return result.rows.length === 1;
      }
      return false;
    });
  }
}
