import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(projectRoot, 'docs');

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Unable to build GitHub Pages: ${label} was not found.`);
  return source.replace(search, replacement);
}

let html = await readFile(resolve(projectRoot, 'private/tool.html'), 'utf8');

html = replaceRequired(
  html,
  '<meta name="description" content="Private document search and BOM budgeting workspace.">',
  '<meta name="description" content="Browser-only document search, BOM, budgeting, Apple BOM, and DALI schedule workspace.">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="assets/local-mode.css">\n<script src="assets/local-mode.js"></script>',
  'page metadata',
);

html = replaceRequired(
  html,
  `  function encodePath(path) {\n    return path.split('/').map(encodeURIComponent).join('/');\n  }`,
  `  function encodePath(path) {\n    if (window.PROJECT_TOOLS_STATIC_MODE) return '#local-document=' + encodeURIComponent(path);\n    return path.split('/').map(encodeURIComponent).join('/');\n  }`,
  'document-link encoder',
);

html = replaceRequired(
  html,
  `  function currentApplicationLocation() {\n    let current;\n    try { current = new URL(location.href); } catch (_) { return null; }\n    return /^https?:$/.test(current.protocol) ? current : null;\n  }`,
  `  function currentApplicationLocation() {\n    if (window.PROJECT_TOOLS_STATIC_MODE) return null;\n    let current;\n    try { current = new URL(location.href); } catch (_) { return null; }\n    return /^https?:$/.test(current.protocol) ? current : null;\n  }`,
  'server-location detector',
);

html = replaceRequired(
  html,
  `  async function requestBudgetWorkbook() {\n    if (bomState.pricingLoading) return;\n    try {\n      const endpoint = configuredBudgetEndpoint();\n      if (endpoint) {\n        await loadConfiguredBudget(endpoint);\n        return;\n      }\n      throw new Error(currentApplicationLocation()\n        ? 'The application server is unavailable. Refresh the page and try again.'\n        : 'Pricing is available only through the hosted Project Tools site.');\n    } catch (error) {\n      if (error && error.name === 'AbortError') return;\n      showBudgetLoadError(error);\n    }\n  }`,
  `  async function requestBudgetWorkbook() {\n    if (bomState.pricingLoading) return;\n    try {\n      const list = activePriceList();\n      if (window.PROJECT_TOOLS_STATIC_MODE && window.ProjectToolsLocalFiles) {\n        if (!list) throw new Error('Select a valid price list before generating a budget.');\n        const file = await window.ProjectToolsLocalFiles.readBudgetWorkbook(list.sourceFile);\n        await loadBudgetSource(file.name, file.size, () => file.arrayBuffer());\n        return;\n      }\n      const endpoint = configuredBudgetEndpoint();\n      if (endpoint) {\n        await loadConfiguredBudget(endpoint);\n        return;\n      }\n      throw new Error(currentApplicationLocation()\n        ? 'The application server is unavailable. Refresh the page and try again.'\n        : 'Choose the local price-list folder before generating a budget.');\n    } catch (error) {\n      if (error && error.name === 'AbortError') return;\n      showBudgetLoadError(error);\n    }\n  }`,
  'budget loader',
);

html = replaceRequired(
  html,
  `  async function fetchLibraryDocument(relativePath) {\n    let response;\n    try {\n      response = await fetch(documentSourceUrl(relativePath), { cache: 'no-store' });\n    } catch (_) {\n      throw new Error('A product document could not be read from the application server.');\n    }\n    if (!response.ok) {\n      throw new Error('A product document could not be read (' + response.status + '). Refresh the site and try again.');\n    }\n    return response.blob();\n  }`,
  `  async function fetchLibraryDocument(relativePath) {\n    if (window.PROJECT_TOOLS_STATIC_MODE && window.ProjectToolsLocalFiles) {\n      return window.ProjectToolsLocalFiles.getLibraryFile(relativePath);\n    }\n    let response;\n    try {\n      response = await fetch(documentSourceUrl(relativePath), { cache: 'no-store' });\n    } catch (_) {\n      throw new Error('A product document could not be read from the application server.');\n    }\n    if (!response.ok) {\n      throw new Error('A product document could not be read (' + response.status + '). Refresh the site and try again.');\n    }\n    return response.blob();\n  }`,
  'document loader',
);

html = replaceRequired(
  html,
  `  document.getElementById('sign-out-button').addEventListener('click', async () => {\n    const button = document.getElementById('sign-out-button');\n    button.disabled = true;\n    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}\n    location.replace('/');\n  });`,
  `  document.getElementById('sign-out-button').addEventListener('click', async () => {\n    const button = document.getElementById('sign-out-button');\n    button.disabled = true;\n    if (window.PROJECT_TOOLS_STATIC_MODE && window.ProjectToolsLocalFiles) {\n      window.ProjectToolsLocalFiles.signOut();\n      return;\n    }\n    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}\n    location.replace('/');\n  });`,
  'sign-out handler',
);

html = html.replaceAll('src="/assets/', 'src="assets/');

let appleBom = await readFile(resolve(projectRoot, 'public/assets/apple-bom.mjs'), 'utf8');
appleBom = replaceRequired(
  appleBom,
  `      } else if (elements.documents.checked) throw new Error('Matched documents require the connected Project Tools application.');\n      else if (files.length === 1) download(new Blob([files[0].bytes], { type: files[0].mimeType }), files[0].name);`,
  `      } else if (elements.documents.checked && globalThis.ProjectToolsLocalFiles?.exportBundle) {\n        await globalThis.ProjectToolsLocalFiles.exportBundle(stem, files, matches?.documents || []);\n      } else if (elements.documents.checked) throw new Error('Connect the local document library before including matched documents.');\n      else if (files.length === 1) download(new Blob([files[0].bytes], { type: files[0].mimeType }), files[0].name);`,
  'Apple BOM local document export',
);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, 'assets'), { recursive: true });
await writeFile(resolve(outputRoot, 'index.html'), html);
await writeFile(resolve(outputRoot, '404.html'), '<!doctype html><meta charset="utf-8"><title>Project Tools</title><script>location.replace(location.origin + "/" + location.pathname.split("/").filter(Boolean)[0] + "/");</script>');
await writeFile(resolve(outputRoot, '.nojekyll'), '');
await copyFile(resolve(projectRoot, 'github-pages-src/local-mode.css'), resolve(outputRoot, 'assets/local-mode.css'));
await copyFile(resolve(projectRoot, 'github-pages-src/local-mode.js'), resolve(outputRoot, 'assets/local-mode.js'));
await copyFile(resolve(projectRoot, 'github-pages-src/manifest.webmanifest'), resolve(outputRoot, 'manifest.webmanifest'));
await copyFile(resolve(projectRoot, 'github-pages-src/sw.js'), resolve(outputRoot, 'sw.js'));
await copyFile(resolve(projectRoot, 'public/favicon.svg'), resolve(outputRoot, 'favicon.svg'));
for (const asset of ['apple-bom.mjs', 'apple-dali.mjs', 'pdf.min.mjs', 'pdf.worker.compat.mjs', 'pdf.worker.min.mjs']) {
  if (asset === 'apple-bom.mjs') {
    await writeFile(resolve(outputRoot, 'assets', asset), appleBom);
  } else {
    await copyFile(resolve(projectRoot, 'public/assets', asset), resolve(outputRoot, 'assets', asset));
  }
}

console.log(`GitHub Pages output written to ${outputRoot}`);
