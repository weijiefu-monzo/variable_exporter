import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './react-bridge'; // Must be first to set up React bridge
import { render } from '@create-figma-plugin/ui';
import { emit, on } from '@create-figma-plugin/utilities';
import styles from './styles.css';
import cover from './assets/cover.svg';
import {
  VariableCollectionSummary,
  DownloadFilesHandler,
  ZipPayload,
} from './types';

import { AiFillBulb, AiFillPlayCircle } from 'react-icons/ai';
import FaultyTerminal from './components/FaultyTerminal';
import JSZip from 'jszip';

function Plugin({ collections }: { collections: VariableCollectionSummary[] }) {
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(collections.map((c) => c.id))
  );

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

  useEffect(() => {
    const handleDownloadZip = async ({ files, zipName }: ZipPayload) => {
      try {
        const zip = new JSZip();
        for (const { filename, content } of files) {
          // content is JSON string; if you ever send binary, pass an ArrayBuffer/Uint8Array instead
          zip.file(filename, content);
        }
        const blob = await zip.generateAsync({ type: 'blob' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName || 'tokens.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to create ZIP', err);
      }
    };

    on('DOWNLOAD_ZIP', handleDownloadZip);

    return () => {
      // Cleanup listeners if needed
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.cover}>
        <img
          src={cover}
          alt="Variable Exporter"
          className={styles.coverImage}
        />
        <div className={styles.faultyTerminal}>
          <FaultyTerminal />
        </div>
      </div>
      <div className={styles.content}>
        <h1>TOKEN EXPORTER</h1>
        <p>Select collections to export</p>
      </div>
      <div className={styles.collections}>
        {collections.map((collection) => (
          <label key={collection.id} className={styles.checkbox}>
            <input
              type="checkbox"
              checked={selectedCollections.has(collection.id)}
              onChange={() => handleCollectionToggle(collection.id)}
            />
            <span>
              {collection.name} ({collection.modeCount} modes)
            </span>
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button className={styles.iconButton} onClick={() => {}}>
          <AiFillBulb />
        </button>
        <button
          className={styles.exportButton}
          onClick={() => {
            emit('EXPORT_COLLECTIONS', Array.from(selectedCollections));
          }}
        >
          <AiFillPlayCircle />
          Export
        </button>
      </div>
    </div>
  );
}

export default render(Plugin);
