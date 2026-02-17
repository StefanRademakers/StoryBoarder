/**
 * Scene ID utility helpers.
 *
 * IMPORTANT DESIGN INTENT
 * -----------------------
 * We intentionally separate:
 * 1) the immutable token (identity)
 * 2) the human-readable slug (renameable)
 *
 * Canonical new format:
 *   scene-<slug>-<token>
 *
 * Legacy format (must remain supported):
 *   scene-<token>
 *
 * Parsing rule:
 *   Parse from RIGHT to LEFT for the token.
 *   This makes token extraction stable even when the slug changes.
 *
 * Why this exists:
 * - To keep on-disk references stable and avoid data loss.
 * - To make scene folders easier for humans to read.
 * - To provide one source of truth for ID parsing/validation logic.
 *
 * NOTE TO FUTURE AI/CODEX AGENTS:
 * Do NOT infer token from scene names or folder names heuristically.
 * Always use these helpers (parse from right-most dash after "scene-").
 */

export interface ParsedSceneId {
  raw: string;
  token: string;
  slug: string | null;
  isLegacy: boolean;
}

const SCENE_PREFIX = "scene-";
const TOKEN_RE = /^[a-zA-Z0-9]+$/;
const LEGACY_TOKEN_RE = /^[a-zA-Z0-9-]+$/;
const NAME_PART_RE = /^[a-z0-9_]+$/;

/**
 * Parses scene IDs in both supported forms:
 * - scene-<token> (legacy token may include dashes, e.g. UUID)
 * - scene-<slug>-<token>
 *
 * Token extraction is right-to-left.
 * Throws on invalid IDs.
 */
export function parseSceneId(raw: string): ParsedSceneId {
  const value = String(raw ?? "").trim();
  if (!value.startsWith(SCENE_PREFIX)) {
    throw new Error(`Scene ID must start with "${SCENE_PREFIX}". Received: "${value}"`);
  }

  const remainder = value.slice(SCENE_PREFIX.length);
  if (!remainder) {
    throw new Error(`Scene ID is missing token. Received: "${value}"`);
  }

  // RIGHT-TO-LEFT parse for canonical IDs:
  // - scene-<slug>-<token> where slug has no dashes and token is [a-zA-Z0-9]+.
  // Fallback for legacy IDs:
  // - If canonical split is not valid, treat entire remainder as legacy token.
  //   This preserves existing UUID-style IDs: scene-52d8e...-... .
  const lastDash = remainder.lastIndexOf("-");
  if (lastDash !== -1) {
    const canonicalToken = remainder.slice(lastDash + 1);
    const canonicalSlug = remainder.slice(0, lastDash);
    if (canonicalSlug && NAME_PART_RE.test(canonicalSlug) && TOKEN_RE.test(canonicalToken)) {
      return {
        raw: value,
        token: canonicalToken,
        slug: canonicalSlug,
        isLegacy: false,
      };
    }
  }

  // Legacy path: whole remainder is treated as token.
  const token = remainder;
  const slug = null;

  if (!token || !LEGACY_TOKEN_RE.test(token)) {
    throw new Error(`Invalid scene token "${token}" in "${value}".`);
  }

  return {
    raw: value,
    token,
    slug,
    isLegacy: true,
  };
}

/**
 * Converts a user-facing scene name to a safe slug segment.
 *
 * Rules:
 * - lowercase
 * - allow only [a-z0-9_]
 * - dash '-' is NOT allowed in slug (explicit product rule)
 * - spaces and dashes become underscore
 * - collapse duplicate underscores
 * - trim leading/trailing underscores
 */
export function normalizeSceneNamePart(name: string): string {
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "scene";
}

/**
 * Builds a canonical ID.
 *
 * - If namePart is provided, returns: scene-<normalizedNamePart>-<token>
 * - If namePart is empty/undefined, returns legacy-compatible: scene-<token>
 *
 * NOTE:
 * Prefer passing a namePart for new IDs to keep folders human-readable.
 */
export function buildSceneId(token: string, namePart?: string): string {
  const cleanToken = String(token ?? "").trim();
  if (!TOKEN_RE.test(cleanToken)) {
    throw new Error(`Invalid token "${cleanToken}". Token must match ${TOKEN_RE}.`);
  }

  const cleanName = namePart ? normalizeSceneNamePart(namePart) : "";
  if (!cleanName) {
    return `${SCENE_PREFIX}${cleanToken}`;
  }
  return `${SCENE_PREFIX}${cleanName}-${cleanToken}`;
}

/**
 * Renames only the slug portion, preserving the immutable token.
 *
 * Example:
 * - input id:  scene-1770907764254
 * - new name:  "Kantoor Intro"
 * - output id: scene-kantoor_intro-1770907764254
 */
export function renameSceneIdPreservingToken(currentId: string, newNamePart: string): string {
  const parsed = parseSceneId(currentId);
  return buildSceneId(canonicalizeSceneToken(parsed.token), newNamePart);
}

/**
 * Returns true for supported scene IDs, false otherwise.
 * Useful for guard checks where throwing is not desirable.
 */
export function isValidSceneId(value: string): boolean {
  try {
    parseSceneId(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts legacy tokens (e.g. UUID with dashes) into canonical token format.
 *
 * Identity is preserved semantically (same underlying token characters),
 * while making the token compatible with canonical scene ID format.
 */
function canonicalizeSceneToken(token: string): string {
  const clean = String(token ?? "").trim();
  if (TOKEN_RE.test(clean)) {
    return clean;
  }
  const compact = clean.replace(/[^a-zA-Z0-9]+/g, "");
  if (TOKEN_RE.test(compact)) {
    return compact;
  }
  throw new Error(`Cannot canonicalize scene token "${token}" to canonical format.`);
}
