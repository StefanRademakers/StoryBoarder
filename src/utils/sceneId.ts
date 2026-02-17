/**
 * Scene ID utility helpers.
 *
 * IMPORTANT DESIGN INTENT
 * -----------------------
 * We intentionally separate:
 * 1) the immutable token (identity)
 * 2) the human-readable slug (renameable)
 *
 * Canonical format:
 *   scene-<slug>-<token>
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
  slug: string;
}

const SCENE_PREFIX = "scene-";
const TOKEN_RE = /^[a-zA-Z0-9]+$/;
const NAME_PART_RE = /^[a-z0-9_]+$/;

/**
 * Parses canonical scene IDs:
 * - scene-<slug>-<token>
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

  const lastDash = remainder.lastIndexOf("-");
  if (lastDash === -1) {
    throw new Error(`Scene ID must be canonical "scene-<slug>-<token>". Received: "${value}"`);
  }

  const token = remainder.slice(lastDash + 1);
  const slug = remainder.slice(0, lastDash);

  if (!slug || !NAME_PART_RE.test(slug)) {
    throw new Error(`Invalid scene slug "${slug}" in "${value}".`);
  }
  if (!token || !TOKEN_RE.test(token)) {
    throw new Error(`Invalid scene token "${token}" in "${value}".`);
  }

  return {
    raw: value,
    token,
    slug,
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
 */
export function buildSceneId(token: string, namePart?: string): string {
  const cleanToken = String(token ?? "").trim();
  if (!TOKEN_RE.test(cleanToken)) {
    throw new Error(`Invalid token "${cleanToken}". Token must match ${TOKEN_RE}.`);
  }

  const cleanName = namePart ? normalizeSceneNamePart(namePart) : "";
  if (!cleanName) {
    throw new Error("Scene name part is required for canonical scene ID.");
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
  return buildSceneId(parsed.token, newNamePart);
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
