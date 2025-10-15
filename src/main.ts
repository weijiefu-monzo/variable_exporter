import {
  loadFontsAsync,
  once,
  emit,
  on,
  showUI,
  traverseNode,
} from '@create-figma-plugin/utilities';

export default async function () {
  showUI({ height: 200, width: 320 });
}
