// main.ts — Figma plugin (Create Figma Plugin runtime)
// Exports selected Variable Collections as Style Dictionary–ready DTCG JSON.
//
// Key points:
//  - Outputs ONE FILE PER MODE (e.g., tokens.light.json, tokens.dark.json)
//  - Uses DTCG schema + "tokens" root (not $tokens), no $modes in final files
//  - Dot-path aliases: {color.bg.surface}, not slash paths
//  - Leaf tokens only: {$type, $value, $description?}
//  - FLOAT -> "dimension" with "px" by default (tweak if you need another unit)

import { emit, on, showUI } from '@create-figma-plugin/utilities';

// ───────────────────────────────────────────────────────────────────────────────
// DTCG types (minimal)
// ───────────────────────────────────────────────────────────────────────────────

type DTCGToken = {
  $type: 'color' | 'dimension' | 'number' | 'string' | 'boolean';
  $value?: any;
  $description?: string;
  // Used only during intermediate build; removed in final output:
  $modes?: Record<string, any>;
};

type DTCGGroup = { [key: string]: DTCGToken | DTCGGroup };

// For final file:
type DTCGFile = {
  $schema?: string;
  $metadata?: { name?: string; description?: string };
  tokens: DTCGGroup;
};

// ───────────────────────────────────────────────────────────────────────────────
// Plugin entry
// ───────────────────────────────────────────────────────────────────────────────

export default async function () {
  const collections = await getLocalVariableCollectionsSummary();
  on('EXPORT_COLLECTIONS', (selectedIds: Set<string>) => {
    exportCollections(Array.from(selectedIds));
  });

  showUI({ height: 480, width: 320 }, { collections });
}

// ───────────────────────────────────────────────────────────────────────────────
// UI helpers
// ───────────────────────────────────────────────────────────────────────────────

type VariableCollectionSummary = {
  id: string;
  name: string;
  modeCount: number;
};

async function getLocalVariableCollectionsSummary(): Promise<
  Array<VariableCollectionSummary>
> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  console.log('collections', collections);
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    modeCount: collection.modes.length,
  }));
}

// ───────────────────────────────────────────────────────────────────────────────
// Export pipeline
// ───────────────────────────────────────────────────────────────────────────────

async function exportCollections(selectedCollections: string[]) {
  const allCollections =
    await figma.variables.getLocalVariableCollectionsAsync();
  const chosen = allCollections.filter((c) =>
    selectedCollections.includes(c.id)
  );
  if (chosen.length === 0) return;

  const allVariables = await figma.variables.getLocalVariablesAsync();

  const files: Array<{ filename: string; content: string }> = [];

  for (const collection of chosen) {
    // Build this collection’s token tree (may contain $modes on leaves)
    const tree = await convertCollectionToIntermediateDTCG(
      collection,
      allVariables
    );

    // Slug for filenames: "Web Semantics" -> "web-semantics"
    const colSlug = toSlug(collection.name);

    const modeNames = collection.modes.map((m) => m.name);
    const hasMultipleModes = modeNames.length > 1;
    const fallback = modeNames.includes('light') ? 'light' : undefined;

    if (!hasMultipleModes) {
      // Single-mode collection → one file without mode suffix
      const mode = modeNames[0] ?? 'default';
      const resolved = resolveMode(tree, mode, fallback);
      const fileContent = {
        $schema: 'https://design-tokens.org/dtcg/schema.json',
        $metadata: {
          name: `Figma Variables — ${collection.name}`,
          description: `Tokens resolved for collection: ${collection.name}`,
        },
        tokens: resolved,
      };
      files.push({
        filename: `tokens.${colSlug}.json`,
        content: JSON.stringify(fileContent, null, 2),
      });
    } else {
      // Multi-mode collection → one file per mode
      for (const mode of modeNames) {
        const resolved = resolveMode(tree, mode, fallback);
        const fileContent = {
          $schema: 'https://design-tokens.org/dtcg/schema.json',
          $metadata: {
            name: `Figma Variables — ${collection.name} (${mode})`,
            description: `Tokens resolved for collection: ${collection.name}, mode: ${mode}`,
          },
          tokens: resolved,
        };
        files.push({
          filename: `tokens.${colSlug}.${mode.toLowerCase()}.json`,
          content: JSON.stringify(fileContent, null, 2),
        });
      }
    }
  }

  // Send a single ZIP to the UI to download once
  emit('DOWNLOAD_ZIP', {
    zipName: `tokens-${Date.now()}.zip`,
    files,
  });
}
// ───────────────────────────────────────────────────────────────────────────────
// Collection → Intermediate DTCG (may contain $modes at leaves)
// ───────────────────────────────────────────────────────────────────────────────

async function convertCollectionToIntermediateDTCG(
  collection: VariableCollection,
  allVariables: Variable[]
): Promise<DTCGGroup> {
  const varsInCollection = allVariables.filter(
    (v) => v.variableCollectionId === collection.id
  );

  const root: DTCGGroup = {};

  for (const variable of varsInCollection) {
    const path = toDotPath(variable.name).split('.');
    setLeafToken(root, path, variable, collection, allVariables);
  }

  return root;
}

function setLeafToken(
  root: DTCGGroup,
  path: string[],
  variable: Variable,
  collection: VariableCollection,
  allVariables: Variable[]
) {
  const last = path[path.length - 1];
  let cursor: DTCGGroup = root;

  for (let i = 0; i < path.length - 1; i++) {
    const seg = sanitizeSegment(path[i]);
    if (
      !cursor[seg] ||
      typeof cursor[seg] !== 'object' ||
      isLeaf(cursor[seg])
    ) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as DTCGGroup;
  }

  const name = sanitizeSegment(last);
  cursor[name] = buildTokenWithModes(variable, collection, allVariables);
}

function isLeaf(node: any): node is DTCGToken {
  return (
    node &&
    typeof node === 'object' &&
    ('$type' in node || '$value' in node || '$modes' in node)
  );
}

// Build a token that either has a single $value or $modes (when values differ by mode)
function buildTokenWithModes(
  variable: Variable,
  collection: VariableCollection,
  allVariables: Variable[]
): DTCGToken {
  // Gather values per mode
  const perMode: Record<string, any> = {};
  let hasAnyModeValue = false;
  let tokenType: DTCGToken['$type'] | null = null; // Capture type from first coerceTypeAndUnits call for FLOAT

  for (const m of collection.modes) {
    const raw = variable.valuesByMode[m.modeId];
    if (raw !== undefined) {
      const converted = convertVariableValue(variable, raw, allVariables);
      const coerced = coerceTypeAndUnits(variable, converted);
      // Capture type from first call for FLOAT types (type depends on scopes, not value)
      if (tokenType === null && variable.resolvedType === 'FLOAT') {
        tokenType = coerced.type;
      }
      perMode[m.name] = coerced.value;
      hasAnyModeValue = true;
    }
  }

  // If no explicit values found, try a naive fallback to the first mode that has a value
  if (!hasAnyModeValue) {
    for (const m of collection.modes) {
      const raw = variable.valuesByMode[m.modeId];
      if (raw !== undefined) {
        const converted = convertVariableValue(variable, raw, allVariables);
        const coerced = coerceTypeAndUnits(variable, converted);
        // Capture type from first call for FLOAT types
        if (tokenType === null && variable.resolvedType === 'FLOAT') {
          tokenType = coerced.type;
        }
        perMode[m.name] = coerced.value;
        hasAnyModeValue = true;
        break;
      }
    }
  }

  // Decide if modes actually differ
  const unique = new Set(Object.values(perMode).map((v) => JSON.stringify(v)));

  // For FLOAT types, use the type from coerceTypeAndUnits (considers scopes)
  // For other types, use mapDtcgType
  const finalTokenType =
    tokenType !== null ? tokenType : mapDtcgType(variable.resolvedType);

  const token: DTCGToken = { $type: finalTokenType };

  if (unique.size > 1) {
    token.$modes = perMode;
  } else {
    // Single value (choose any)
    const anyMode = Object.keys(perMode)[0];
    if (anyMode !== undefined) {
      token.$value = perMode[anyMode];
    }
  }

  if (variable.description) token.$description = variable.description;
  return token;
}

// ───────────────────────────────────────────────────────────────────────────────
// Mode resolver: removes $modes and sets concrete $value for a chosen mode
// ───────────────────────────────────────────────────────────────────────────────

function resolveMode(
  tree: DTCGGroup,
  modeName: string,
  fallbackMode?: string
): DTCGGroup {
  const out: DTCGGroup = {};

  for (const [key, value] of Object.entries(tree)) {
    if (isLeaf(value)) {
      const t = value as DTCGToken;
      const { $modes, ...rest } = t;
      if ($modes) {
        const hasExact = Object.prototype.hasOwnProperty.call($modes, modeName);
        const chosen = hasExact
          ? $modes[modeName]
          : fallbackMode && $modes[fallbackMode] !== undefined
            ? $modes[fallbackMode]
            : t.$value;
        out[key] = { ...rest, $value: chosen };
      } else {
        out[key] = { ...rest };
      }
    } else {
      out[key] = resolveMode(value as DTCGGroup, modeName, fallbackMode);
    }
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Value & type conversion helpers
// ───────────────────────────────────────────────────────────────────────────────

function mapDtcgType(resolved: VariableResolvedDataType): DTCGToken['$type'] {
  switch (resolved) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      // We’ll coerce to "dimension" with px by default; can be "number" if no unit.
      return 'dimension';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
}

// Normalize alias/color/primitive values from Figma
function convertVariableValue(
  variable: Variable,
  value: VariableValue,
  allVariables: Variable[]
): any {
  // Aliases
  if (typeof value === 'object' && 'type' in value) {
    if (value.type === 'VARIABLE_ALIAS') {
      const ref = allVariables.find((v) => v.id === value.id);
      if (ref) {
        return `{${toDotPath(ref.name)}}`; // dot-path alias
      }
      return `{${value.id}}`;
    }
  }

  // Color (Figma color in 0–1)
  if (variable.resolvedType === 'COLOR' && isRGBA(value)) {
    const r = Math.round(value.r * 255);
    const g = Math.round(value.g * 255);
    const b = Math.round(value.b * 255);
    const a = value.a ?? 1;
    if (a >= 0.999) {
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } else {
      return `rgba(${r}, ${g}, ${b}, ${round2(a)})`;
    }
  }

  // Primitive passthrough
  return value;
}

function isRGBA(x: any): x is RGBA {
  return x && typeof x === 'object' && 'r' in x && 'g' in x && 'b' in x;
}

// Coerce FLOAT to dimension (px) by default; keep others as-is
function coerceTypeAndUnits(
  variable: Variable,
  raw: any
): { type: DTCGToken['$type']; value: any } {
  console.log(variable, variable.name, variable.scopes.length);
  switch (variable.resolvedType) {
    case 'FLOAT': {
      // Check if value is an alias (reference to another token)
      if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
        // For aliases, show the referenced value as-is (e.g., "{spacing.small}")
        // Determine type based on scopes
        return variable.scopes.length === 0
          ? { type: 'number', value: raw }
          : { type: 'dimension', value: raw };
      }
      // if already a string with unit, keep it; else append "px"
      if (typeof raw === 'string' && /[a-z%]+$/i.test(raw)) {
        return { type: 'dimension', value: raw };
      }
      const n = typeof raw === 'number' ? raw : Number(raw);
      // If scope length is 0, set type to number with raw number value
      if (variable.scopes.length === 0) {
        return { type: 'number', value: n };
      }
      // If scope length is more than 0, set type to dimension and append "px"
      return { type: 'dimension', value: `${n}px` };
    }
    case 'BOOLEAN':
      return { type: 'boolean', value: Boolean(raw) };
    case 'STRING':
      return { type: 'string', value: String(raw) };
    case 'COLOR':
      return { type: 'color', value: raw };
    default:
      return { type: 'string', value: raw };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────

function toDotPath(name: string): string {
  return name
    .trim()
    .replace(/[\/\s]+/g, '.')
    .replace(/\.+/g, '.');
}

function sanitizeSegment(seg: string): string {
  return seg
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // spaces & punctuation -> dashes
    .replace(/^-+|-+$/g, '') // trim dashes
    .replace(/--+/g, '-'); // collapse repeats
}
