import './react-bridge'; // Must be first to set up React bridge
import { render } from '@create-figma-plugin/ui';
import { emit, on } from '@create-figma-plugin/utilities';
import { h, RefObject } from 'preact';
import '@object-ui/components/styles/primitive.css';
import '@object-ui/components/styles/semantic.css';
import '@object-ui/components/styles/index.css';

function Plugin() {
  return <div>Hello</div>;
}

export default render(Plugin);
