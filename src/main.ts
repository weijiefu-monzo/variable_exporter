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

  showUI({ height: 320, width: 320 }, { collections });
}

const getLocalVariableCollectionsSummary = async (): Promise<
  Array<VariableCollectionSummary>
> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
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
    // Combine all collections into a single DTCG file
    const combinedTokens: DTCGGroup = {};
    const collectionNames: string[] = [];

    for (const collection of selectedCollectionsData) {
      console.log(`Converting collection: ${collection.name}`);

      // Convert collection to DTCG format
      const dtcgCollection = await convertCollectionToDTCG(collection);

      // Add collection name to list
      collectionNames.push(collection.name);

      // Add tokens to combined structure with collection name as prefix
      const collectionKey = collection.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase();
      combinedTokens[collectionKey] = dtcgCollection.$tokens;

      console.log(`Added collection tokens: ${collectionKey}`);
    }

    // Create combined DTCG collection
    const combinedCollection: DTCGCollection = {
      $schema: 'https://specs.visual-tokens.com/format/1.0.0',
      $name: 'Figma Variable Collections',
      $description: `Combined design tokens from collections: ${collectionNames.join(', ')}`,
      $tokens: combinedTokens,
    };

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
  collection: VariableCollection
): Promise<DTCGCollection> => {
  const variables = await figma.variables.getLocalVariablesAsync();
  const collectionVariables = variables.filter(
    (variable) => variable.variableCollectionId === collection.id
  );

  const tokens: DTCGGroup = {};

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
    const token = convertVariableToDTCGToken(variable, collection);
    currentGroup[tokenName] = token;
  }

  return {
    $schema: 'https://specs.visual-tokens.com/format/1.0.0',
    $name: collection.name,
    $description: `Design tokens exported from Figma collection: ${collection.name}`,
    $tokens: tokens,
  };
};

const convertVariableToDTCGToken = (
  variable: Variable,
  collection: VariableCollection
): DTCGToken => {
  const token: DTCGToken = {
    $type: getDTCGTypeFromVariableType(variable.resolvedType),
    $value: getVariableValue(variable, collection),
  };

  if (variable.description) {
    token.$description = variable.description;
  }

  // Add extensions for additional metadata
  token.$extensions = {
    'com.figma.variable': {
      id: variable.id,
      key: variable.key,
      variableCollectionId: variable.variableCollectionId,
      hiddenFromPublishing: variable.hiddenFromPublishing,
      scopes: variable.scopes,
      codeSyntax: variable.codeSyntax,
    },
  };

  return token;
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

const getVariableValue = (
  variable: Variable,
  collection: VariableCollection
): string | number | object => {
  // Get the value from the first mode (you might want to handle multiple modes differently)
  const modeId = collection.modes[0]?.modeId;
  if (!modeId) return '';

  const value = variable.valuesByMode[modeId];

  if (typeof value === 'object' && 'type' in value) {
    switch (value.type) {
      case 'VARIABLE_ALIAS':
        return `{${value.id}}`;
      case 'VARIABLE_ALIAS':
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
