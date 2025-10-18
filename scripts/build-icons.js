#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../src/assets/icons');
const OUTPUT_FILE = path.join(__dirname, '../src/components/Icon.tsx');

function toCamelCase(str) {
  return str
    .replace(/^Icon/, '') // Remove Icon prefix
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, char => char.toUpperCase());
}

function extractSvgData(svgContent) {
  // Extract viewBox from SVG
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24';
  
  // Extract inner content
  const contentMatch = svgContent.match(/<svg[^>]*>(.*?)<\/svg>/s);
  const content = contentMatch ? contentMatch[1].trim() : svgContent;
  
  return { viewBox, content };
}

function generateIconComponent() {
  if (!fs.existsSync(ICONS_DIR)) {
    console.error(`Icons directory not found: ${ICONS_DIR}`);
    return;
  }

  const svgFiles = fs.readdirSync(ICONS_DIR).filter(file => file.endsWith('.svg'));
  
  if (svgFiles.length === 0) {
    console.log('No SVG files found in icons directory');
    return;
  }

  let iconComponents = [];
  let iconExports = [];

  svgFiles.forEach(file => {
    const iconName = toCamelCase(path.basename(file, '.svg'));
    const filePath = path.join(ICONS_DIR, file);
    const svgContent = fs.readFileSync(filePath, 'utf8');
    const { viewBox, content } = extractSvgData(svgContent);
    
    // Create individual icon component
    iconComponents.push(`
const ${iconName}Icon = (props: IconProps) => (
  <Icon {...props} viewBox="${viewBox}" dangerouslySetInnerHTML={{ __html: \`${content}\` }} />
);`);

    iconExports.push(`  ${iconName}: ${iconName}Icon,`);
  });

  const componentCode = `import { h } from 'preact';

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  style?: any;
  className?: string;
  viewBox?: string;
}

const Icon = ({ 
  width = 24, 
  height = 24, 
  color = 'currentColor', 
  style, 
  className,
  viewBox = '0 0 24 24',
  dangerouslySetInnerHTML 
}: IconProps & { dangerouslySetInnerHTML?: { __html: string } }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      fill={color}
      style={{ ...style, color, display: 'block' }}
      className={className}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  );
};

${iconComponents.join('\n')}

// Export Icon namespace object
export const IconComponent = {
${iconExports.join('\n')}
} as const;

// Also export the base Icon component
export { Icon };

// Default export for convenience
export default IconComponent;
`;

  fs.writeFileSync(OUTPUT_FILE, componentCode);
  console.log(`✅ Generated ${svgFiles.length} icons in ${OUTPUT_FILE}`);
  console.log(`Available icons: ${svgFiles.map(f => toCamelCase(path.basename(f, '.svg'))).join(', ')}`);
}

generateIconComponent();
