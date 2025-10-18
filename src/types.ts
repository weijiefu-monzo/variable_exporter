import { EventHandler } from '@create-figma-plugin/utilities';

export interface InsertCodeHandler extends EventHandler {
  name: 'INSERT_CODE';
  handler: (code: string) => void;
}

export type VariableCollectionSummary = {
  id: string;
  name: string;
  modeCount: number;
};

export interface LoadCollectionsHandler extends EventHandler {
  name: 'LOAD_COLLECTIONS';
  handler: () => void;
}

export interface SetCollectionsHandler extends EventHandler {
  name: 'SET_COLLECTIONS';
  handler: (collections: Array<VariableCollectionSummary>) => void;
}

export interface ExportCollectionsHandler extends EventHandler {
  name: 'EXPORT_COLLECTIONS';
  handler: (selectedCollections: string[]) => void;
}

export interface DownloadFilesHandler extends EventHandler {
  name: 'DOWNLOAD_FILES';
  handler: (files: Array<{ filename: string; content: string }>) => void;
}

// DTCG Format Types
export interface DTCGToken {
  $type: string;
  $value?: string | number | object;
  $modes?: Record<string, string | number | object>;
  $description?: string;
  $extensions?: Record<string, any>;
}

export interface DTCGGroup {
  [key: string]: DTCGToken | DTCGGroup;
}

export interface DTCGCollection {
  $schema: string;
  $name: string;
  $description?: string;
  $modes?: Record<string, any>;
  $tokens: DTCGGroup;
}

export type ZipPayload = {
  zipName: string; // e.g. "tokens-1699999999999.zip"
  files: Array<{ filename: string; content: string }>;
};
