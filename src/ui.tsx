import * as React from 'react';
import './react-bridge'; // Must be first to set up React bridge
import { render } from '@create-figma-plugin/ui';
import { emit, on } from '@create-figma-plugin/utilities';
import { h, RefObject } from 'preact';
import '@object-ui/components/styles/primitive.css';
import '@object-ui/components/styles/semantic.css';
import '@object-ui/components/styles/index.css';
import {
  Button,
  Page,
  Checkbox,
  IconButton,
  Group,
} from '@object-ui/components';
import { VariableCollectionSummary, DownloadFilesHandler } from './types';
import styles from './styles.css';

import { AiFillBulb } from 'react-icons/ai';

function Plugin({ collections }: { collections: VariableCollectionSummary[] }) {
  const [selectedCollections, setSelectedCollections] = React.useState<
    Set<string>
  >(new Set(collections.map((c) => c.id)));

  const handleCollectionToggle = (collectionId: string) => {
    setSelectedCollections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId);
      } else {
        newSet.add(collectionId);
      }
      return newSet;
    });
  };

  const downloadFile = (content: string, filename: string) => {
    console.log(`Downloading file: ${filename}`);

    // Create a data URL for the JSON content
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;

    // Create a temporary link element and trigger download
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`Download triggered for: ${filename}`);
  };

  React.useEffect(() => {
    const handleDownloadFiles = async (
      files: Array<{ filename: string; content: string }>
    ) => {
      console.log(
        `Received ${files.length} files to download:`,
        files.map((f) => f.filename)
      );

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(
          `Processing file ${i + 1}/${files.length}: ${file.filename}`
        );
        downloadFile(file.content, file.filename);

        // Add a small delay between downloads to prevent browser blocking
        if (i < files.length - 1) {
          console.log('Waiting 100ms before next download...');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log('All downloads completed');
    };

    on('DOWNLOAD_FILES', handleDownloadFiles);

    return () => {
      // Cleanup listeners if needed
    };
  }, []);

  return (
    <Page>
      <h1>Select collections to export</h1>
      <div className={styles.collections}>
        {collections.map((collection) => (
          <Checkbox
            key={collection.id}
            id={collection.id}
            label={`${collection.name} (${collection.modeCount} modes)`}
            checked={selectedCollections.has(collection.id)}
            onChange={() => handleCollectionToggle(collection.id)}
          />
        ))}
      </div>
      <Group>
        <IconButton onClick={() => {}} size="large">
          <AiFillBulb />
        </IconButton>
        <Button
          fullWidth
          size="large"
          color="primary"
          onClick={() => {
            emit('EXPORT_COLLECTIONS', Array.from(selectedCollections));
          }}
        >
          Export
        </Button>
      </Group>
    </Page>
  );
}

export default render(Plugin);
