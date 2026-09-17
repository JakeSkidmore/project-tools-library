# Project Tools Library

Project Tools Library is a browser-based interface for searching a locally managed product-document library and creating BOM, budget, Apple BOM, and Apple DALI schedule exports.

## Privacy boundary

This public repository contains the web application only. It does **not** contain:

- product documents;
- pricing workbooks or embedded prices;
- usernames, password records, or session data;
- bridge tokens, tunnel credentials, or environment settings;
- saved projects or exported customer files; or
- the private PC bridge service.

The GitHub Pages edition reads files directly from folders that the user explicitly selects in desktop Chrome or Microsoft Edge. The browser remembers those folder handles in IndexedDB. Files are not uploaded to GitHub or to an application server.

## GitHub Pages security model

- The lightweight username/password screen is stored in the user's browser and is not strong access control.
- The public repository contains no price values, workbooks, documents, saved projects, or credentials.
- The browser can read only folders the user explicitly selects and permits.
- Remembered folder handles apply only to that browser profile and may require a one-click reconnect after a browser restart.
- Pricing is read fresh from the selected local workbook whenever Generate Budget is used and remains in memory only for the current page session.

Copying this repository does not provide access to any user's PC, selected folders, documents, price lists, local login, or saved work.

## Local development

Requirements:

- Node.js 22.13 or newer
- pnpm
- desktop Chrome or Microsoft Edge for remembered local-folder access

Run the Sites development version with:

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm build
```

Build the static GitHub Pages edition with:

```bash
pnpm build:pages
```

The generated `/docs` directory is the GitHub Pages publishing source. Never commit workbooks, documents, exported projects, passwords, or environment secrets.

## Hosting

GitHub Pages publishes the browser-only build from the `/docs` directory. It uses the File System Access API instead of protected server routes. Users select the document-library folder and price-list folder on first use; the same browser remembers those selections.

The existing Sites source remains in the repository for compatibility, but GitHub Pages does not use its protected server routes. The production ChatGPT Site is managed separately and is not changed by the Pages build.

## License

No open-source license is granted by publication of this repository. All rights are reserved unless a license is added later.
