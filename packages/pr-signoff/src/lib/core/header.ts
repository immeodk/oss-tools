import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

interface PackageJson {
  version: string;
}

/**
 * ASCII art header for PR Signoff tool with version
 */
export const showHeader = (subtitle: string = 'run CI checks and create status checks'): void => {
  const boxTotalWidth = 80; // Total width of the box including borders

  // Get version from package.json
  let version = '';
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '../../../', 'package.json');
    const packageJson: PackageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    version = ` - v${packageJson.version}`;
  } catch {
    // Ignore if we can't read the version
  }

  const centerSubtitle = (text: string): string => {
    // Append version to subtitle
    const fullText = text + version;
    if (fullText.length >= boxTotalWidth) {
      return fullText.substring(0, boxTotalWidth);
    }
    const contentPadding = Math.floor((boxTotalWidth - fullText.length) / 2);
    const leftPad = ' '.repeat(contentPadding);
    return leftPad + fullText;
  };

  console.log(
    chalk.hex('#9bcda0')(`
┌──────────────────────────────────────────────────────────────────────────────┐
│ .immeo                                                                       │
│ ██████╗ ██████╗      ███████╗██╗ ██████╗ ███╗   ██╗ ██████╗ ███████╗███████╗ │
│ ██╔══██╗██╔══██╗     ██╔════╝██║██╔════╝ ████╗  ██║██╔═══██╗██╔════╝██╔════╝ │
│ ██████╔╝██████╔╝     ███████╗██║██║  ███╗██╔██╗ ██║██║   ██║█████╗  █████╗   │
│ ██╔═══╝ ██╔══██╗     ╚════██║██║██║   ██║██║╚██╗██║██║   ██║██╔══╝  ██╔══╝   │
│ ██║     ██║  ██║     ███████║██║╚██████╔╝██║ ╚████║╚██████╔╝██║     ██║      │
│ ╚═╝     ╚═╝  ╚═╝     ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     ╚═╝      │
└──────────────────────────────────────────────────────────────────────────────┘
${centerSubtitle(subtitle)}
`),
  );
};
