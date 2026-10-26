/**
 * Divina's tools in the shapes each provider wants, and the check every
 * call the model makes goes through before the page acts on it.
 */
import { TOOL_DECLARATIONS } from './gemini';

type GeminiSchema = { type: string; enum?: string[]; properties?: Record<string, GeminiSchema>; required?: string[] };
type JsonSchema = { type: string; enum?: string[]; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean };

/** Gemini writes types in capitals (OBJECT, STRING); JSON Schema doesn't. */
function toJsonSchema(s: GeminiSchema): JsonSchema {
  const out: JsonSchema = { type: s.type.toLowerCase() };
  if (s.enum) out.enum = [...s.enum];
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (s.required) out.required = [...s.required];
  return out;
}

export const JSON_TOOLS = TOOL_DECLARATIONS.map((t) => ({ name: t.name, description: t.description, schema: toJsonSchema(t.parameters as unknown as GeminiSchema) }));

const TYPE_OK: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === 'string' && v.length <= 4000,
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
};

function fits(v: unknown, s: JsonSchema): boolean {
  if (!TYPE_OK[s.type]?.(v)) return false;
  if (s.enum && !s.enum.includes(v as string)) return false;
  if (s.type === 'object') {
    const o = v as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in o)) return false;
    for (const [k, val] of Object.entries(o)) {
      const p = s.properties?.[k];
      if (p && val !== null && val !== undefined && !fits(val, p)) return false;
    }
  }
  return true;
}

/**
 * A call the page may act on: a known tool, with arguments of the right
 * shape. Models that stream arguments can end mid-way; a cut-off or
 * malformed call is dropped rather than half-run.
 */
export function checkedCall(name: string, args: unknown): { name: string; args: Record<string, unknown> } | null {
  const tool = JSON_TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  const a = args ?? {};
  if (!fits(a, tool.schema)) return null;
  if (JSON.stringify(a).length > 8000) return null;
  return { name, args: a as Record<string, unknown> };
}

/** Parse streamed JSON arguments; null if they aren't a complete object. */
export function parseArgs(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
