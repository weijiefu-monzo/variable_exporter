import { emit, on, showUI } from '@create-figma-plugin/utilities';

import {
  LoadCollectionsHandler,
  SetCollectionsHandler,
  VariableCollectionSummary,
  ExportCollectionsHandler,
  DTCGCollection,
  DTCGToken,
  DTCGGroup,
} from './types';

export default async function () {
  const collections = await getLocalVariableCollectionsSummary();

  on('EXPORT_COLLECTIONS', (selectedCollections) => {
    const selectedArray = Array.from(selectedCollections);
    exportCollections(selectedArray as string[]);
  });

  showUI({ height: 480, width: 320 }, { collections });
}

const getLocalVariableCollectionsSummary = async (): Promise<
  Array<VariableCollectionSummary>
> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  console.log('Collections:', collections);
  return collections.map(function (collection) {
    return {
      id: collection.id,
      name: collection.name,
      modeCount: collection.modes.length,
    };
  });
};

const exportCollections = async (selectedCollections: string[]) => {
  console.log('Selected collections:', selectedCollections);

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const selectedCollectionsData = collections.filter((collection) =>
    selectedCollections.includes(collection.id)
  );

  console.log(
    `Processing ${selectedCollectionsData.length} collections for export`
  );

  try {
    // Get all variables once to use for reference resolution
    const allVariables = await figma.variables.getLocalVariablesAsync();

    // Combine all collections into a single DTCG file
    const combinedTokens: DTCGGroup = {};
    const collectionNames: string[] = [];

    for (const collection of selectedCollectionsData) {
      console.log(`Converting collection: ${collection.name}`);

      // Convert collection to DTCG format
      const dtcgCollection = await convertCollectionToDTCG(
        collection,
        allVariables
      );

      // Add collection name to list
      collectionNames.push(collection.name);

      // Add tokens to combined structure with collection name as prefix
      const collectionKey = collection.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase();
      combinedTokens[collectionKey] = dtcgCollection.$tokens;

      console.log(`Added collection tokens: ${collectionKey}`);
    }

    // Group all colors from all collections at the root level
    groupAllColorsAtRoot(combinedTokens);

    // Create combined DTCG collection with modes
    const combinedModes: Record<string, any> = {};
    let hasMultipleModes = false;

    // Collect all unique modes from all collections
    for (const collection of selectedCollectionsData) {
      for (const mode of collection.modes) {
        if (!combinedModes[mode.name]) {
          combinedModes[mode.name] = {};
        }
      }
    }

    // Only use $modes if there are actually multiple unique modes
    hasMultipleModes = Object.keys(combinedModes).length > 1;

    // Add fallback relationships
    if (hasMultipleModes) {
      for (const modeName of Object.keys(combinedModes)) {
        if (modeName !== 'light' && !combinedModes[modeName].$fallback) {
          if (combinedModes['light']) {
            combinedModes[modeName].$fallback = 'light';
          }
        }
      }
    }

    const combinedCollection: DTCGCollection = {
      $schema: 'https://specs.visual-tokens.com/format/1.0.0',
      $name: 'Figma Variable Collections',
      $description: `Combined design tokens from collections: ${collectionNames.join(', ')}`,
      $tokens: combinedTokens,
    };

    // Only include $modes if there are multiple modes
    if (hasMultipleModes) {
      combinedCollection.$modes = combinedModes;
    }

    // Create filename
    const filename = 'figma_variable_collections.json';

    console.log(`Sending combined file to UI thread for download: ${filename}`);

    // Send single file to UI thread for download
    emit('DOWNLOAD_FILES', [
      {
        filename,
        content: JSON.stringify(combinedCollection, null, 2),
      },
    ]);
  } catch (error) {
    console.error('Failed to export collections:', error);
  }
};

const convertCollectionToDTCG = async (
  collection: VariableCollection,
  allVariables: Variable[]
): Promise<DTCGCollection> => {
  const collectionVariables = allVariables.filter(
    (variable) => variable.variableCollectionId === collection.id
  );

  const tokens: DTCGGroup = {};

  // Create modes mapping from collection modes with fallback support
  const modes: Record<string, any> = {};
  let hasMultipleModes = collection.modes.length > 1;

  if (hasMultipleModes) {
    for (const mode of collection.modes) {
      modes[mode.name] = {};
    }

    // Add fallback relationships if they exist
    for (const mode of collection.modes) {
      if (mode.name !== 'light' && !modes[mode.name].$fallback) {
        // Check if there's a light mode to fall back to
        if (modes['light']) {
          modes[mode.name].$fallback = 'light';
        }
      }
    }
  }

  // Group variables by their path (e.g., "color.primary.500")
  for (const variable of collectionVariables) {
    const path = variable.name.split('.');
    let currentGroup = tokens;

    // Navigate/create the nested structure
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (
        !currentGroup[segment] ||
        (typeof currentGroup[segment] === 'object' &&
          !('$type' in currentGroup[segment]))
      ) {
        currentGroup[segment] = {};
      }
      currentGroup = currentGroup[segment] as DTCGGroup;
    }

    // Add the token
    const tokenName = path[path.length - 1];
    const token = convertVariableToDTCGToken(
      variable,
      collection,
      allVariables
    );
    currentGroup[tokenName] = token;
  }

  // Add $type to color groups
  addTypeToColorGroups(tokens);

  const collectionResult: DTCGCollection = {
    $schema: 'https://specs.visual-tokens.com/format/1.0.0',
    $name: collection.name,
    $description: `Design tokens exported from Figma collection: ${collection.name}`,
    $tokens: tokens,
  };

  // Only include $modes if there are multiple modes
  if (hasMultipleModes) {
    collectionResult.$modes = modes;
  }

  return collectionResult;
};

const convertVariableToDTCGToken = (
  variable: Variable,
  collection: VariableCollection,
  allVariables: Variable[]
): DTCGToken => {
  const token: DTCGToken = {
    $type: getDTCGTypeFromVariableType(variable.resolvedType),
  };

  // Check if variable has values for multiple modes
  const modeValues: Record<string, string | number | object> = {};
  let hasMultipleModes = false;
  let hasValuesInMultipleModes = false;

  for (const mode of collection.modes) {
    const value = variable.valuesByMode[mode.modeId];
    if (value !== undefined) {
      const convertedValue = getVariableValueForMode(
        variable,
        value,
        allVariables
      );
      modeValues[mode.name] = convertedValue;
      hasValuesInMultipleModes = true;
    } else {
      // Handle fallback - try to find a value from a fallback mode
      const fallbackMode = getFallbackMode(mode.name, collection.modes);
      if (fallbackMode) {
        const fallbackValue = variable.valuesByMode[fallbackMode.modeId];
        if (fallbackValue !== undefined) {
          const convertedValue = getVariableValueForMode(
            variable,
            fallbackValue,
            allVariables
          );
          modeValues[mode.name] = convertedValue;
          hasValuesInMultipleModes = true;
        }
      }
    }
  }

  // Only use $modes if there are actually multiple modes AND values differ between modes
  if (collection.modes.length > 1 && hasValuesInMultipleModes) {
    // Check if values are actually different between modes
    const uniqueValues = new Set(Object.values(modeValues));
    hasMultipleModes = uniqueValues.size > 1;
  }

  if (hasMultipleModes) {
    token.$modes = modeValues;
  } else {
    // Use single value - get the first available value
    const firstMode = collection.modes[0];
    const firstValue = variable.valuesByMode[firstMode.modeId];
    if (firstValue !== undefined) {
      token.$value = getVariableValueForMode(
        variable,
        firstValue,
        allVariables
      );
    } else {
      // Fallback to the first available value from any mode
      for (const mode of collection.modes) {
        const value = variable.valuesByMode[mode.modeId];
        if (value !== undefined) {
          token.$value = getVariableValueForMode(variable, value, allVariables);
          break;
        }
      }
    }
  }

  if (variable.description) {
    token.$description = variable.description;
  }

  return token;
};

const getFallbackMode = (modeName: string, allModes: any[]): any | null => {
  // Simple fallback logic: dark mode falls back to light mode
  if (modeName === 'dark') {
    return allModes.find((mode) => mode.name === 'light') || null;
  }
  return null;
};

const getDTCGTypeFromVariableType = (
  variableType: VariableResolvedDataType
): string => {
  switch (variableType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'dimension';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
};

const getVariableValueForMode = (
  variable: Variable,
  value: VariableValue,
  allVariables: Variable[]
): string | number | object => {
  if (typeof value === 'object' && 'type' in value) {
    switch (value.type) {
      case 'VARIABLE_ALIAS':
        // Find the referenced variable and return its name instead of ID
        const referencedVariable = allVariables.find((v) => v.id === value.id);
        if (referencedVariable) {
          const convertedName = referencedVariable.name.replace(/\//g, '.');
          console.log(
            `Resolved variable reference: ${value.id} -> ${convertedName}`
          );
          return `{${convertedName}}`;
        }
        console.warn(`Could not find referenced variable with ID: ${value.id}`);
        return `{${value.id}}`;
      default:
        return value.toString();
    }
  }

  if (
    variable.resolvedType === 'COLOR' &&
    typeof value === 'object' &&
    'r' in value
  ) {
    // Convert RGB to hex
    const r = Math.round(value.r * 255);
    const g = Math.round(value.g * 255);
    const b = Math.round(value.b * 255);
    const a = 'a' in value ? Math.round(value.a * 255) : 255;

    if (a === 255) {
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } else {
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
    }
  }

  return value?.toString() || '';
};

const getVariableValue = (
  variable: Variable,
  collection: VariableCollection,
  allVariables: Variable[]
): string | number | object => {
  // Get the value from the first mode (you might want to handle multiple modes differently)
  const modeId = collection.modes[0]?.modeId;
  if (!modeId) return '';

  const value = variable.valuesByMode[modeId];
  return getVariableValueForMode(variable, value, allVariables);
};

const hasColorValue = (value: any): boolean => {
  return (
    typeof value === 'string' &&
    (value.startsWith('#') || value.startsWith('rgba'))
  );
};

const hasColorModes = (modes: any): boolean => {
  if (!modes || typeof modes !== 'object') return false;
  return Object.values(modes).some((value) => hasColorValue(value));
};

const groupAllColorsAtRoot = (tokens: DTCGGroup): void => {
  const allColorTokens: DTCGGroup = {};
  const otherTokens: DTCGGroup = {};

  // Extract all color tokens from all collections
  for (const [collectionKey, collectionValue] of Object.entries(tokens)) {
    if (typeof collectionValue === 'object' && !('$type' in collectionValue)) {
      const collectionTokens = collectionValue as DTCGGroup;
      const collectionColors: DTCGGroup = {};
      const collectionOtherTokens: DTCGGroup = {};

      for (const [tokenKey, tokenValue] of Object.entries(collectionTokens)) {
        if (
          typeof tokenValue === 'object' &&
          '$type' in tokenValue &&
          tokenValue.$type === 'color' &&
          (hasColorValue(tokenValue.$value) || hasColorModes(tokenValue.$modes))
        ) {
          // Only group tokens that have actual color values (hex or rgba), not variable references
          const cleanToken: any = { ...tokenValue };
          delete cleanToken.$type;

          // Parse token name by "/" separators to create nested structure
          const nameParts = tokenKey.split('/');
          let currentGroup = collectionColors;

          // Navigate/create the nested structure
          for (let i = 0; i < nameParts.length - 1; i++) {
            const segment = nameParts[i];
            if (!currentGroup[segment]) {
              currentGroup[segment] = {};
            }
            currentGroup = currentGroup[segment] as DTCGGroup;
          }

          // Add the final token
          const finalTokenName = nameParts[nameParts.length - 1];
          currentGroup[finalTokenName] = cleanToken;
        } else {
          // This is a non-color token, apply grouping by "/" separators
          const nameParts = tokenKey.split('/');
          let currentGroup = collectionOtherTokens;

          // Navigate/create the nested structure
          for (let i = 0; i < nameParts.length - 1; i++) {
            const segment = nameParts[i];
            if (!currentGroup[segment]) {
              currentGroup[segment] = {};
            }
            currentGroup = currentGroup[segment] as DTCGGroup;
          }

          // Add the final token
          const finalTokenName = nameParts[nameParts.length - 1];
          currentGroup[finalTokenName] = tokenValue;
        }
      }

      // If this collection has colors, add them to the colors group
      if (Object.keys(collectionColors).length > 0) {
        allColorTokens[collectionKey] = collectionColors;
      }

      // If this collection has other tokens, keep them
      if (Object.keys(collectionOtherTokens).length > 0) {
        otherTokens[collectionKey] = collectionOtherTokens;
      }
    } else {
      otherTokens[collectionKey] = collectionValue;
    }
  }

  // If we have color tokens, create a colors group at root level
  if (Object.keys(allColorTokens).length > 0) {
    const colorsGroup: any = {
      $type: 'color',
      ...allColorTokens,
    };

    // Clear the original tokens and add the new structure
    Object.keys(tokens).forEach((key) => delete tokens[key]);
    tokens.colors = colorsGroup;

    // Add back other tokens
    Object.assign(tokens, otherTokens);
  }
};

const addTypeToColorGroups = (tokens: DTCGGroup): void => {
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value === 'object' && !('$type' in value)) {
      // Check if this group contains color tokens
      const hasColorTokens = Object.values(value).some(
        (token) =>
          typeof token === 'object' &&
          '$type' in token &&
          token.$type === 'color'
      );

      if (hasColorTokens) {
        // Add $type to the group
        (value as any).$type = 'color';
      }

      // Recursively process nested groups
      addTypeToColorGroups(value as DTCGGroup);
    }
  }
};
