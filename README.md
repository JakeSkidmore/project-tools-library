# Project Tools Library

Project Tools Library is the hosted interface for searching a locally managed product-document library and creating BOM, budget, Apple BOM, and Apple DALI schedule exports.

## Privacy boundary

This public repository contains the web application only. It does **not** contain:

- product documents;
- pricing workbooks or embedded prices;
- usernames, password records, or session data;
- bridge tokens, tunnel credentials, or environment settings;
- saved projects or exported customer files; or
- the private PC bridge service.

The application authenticates through the private PC bridge. After authentication, protected requests are relayed to that bridge, which reads the current documents and pricing from the host PC. The bridge URL and token are server-side runtime settings and are never sent to the browser.

## Security model

- Login is enforced by the private bridge, not by client-side JavaScript.
- Browser sessions use secure, HTTP-only, same-site cookies.
- Protected API routes require a valid user session.
- Same-origin checks protect state-changing browser requests.
- The bridge requires a separate long random service token.
- Pricing and document responses are marked private and non-cacheable.
- Login attempts are rate limited by the private bridge.

Copying this repository does not provide access to the original PC, private bridge, documents, price lists, accounts, or sessions.

## Local development

Requirements:

- Node.js 22.13 or newer
- pnpm
- access to a separately configured compatible PC bridge

Copy `.env.example` to `.env.local`, replace the placeholder values, and then run:

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm build
```

Never commit `.env.local` or any real bridge credentials.

## Hosting

The application uses server routes and therefore cannot run as a browser-only GitHub Pages site without architectural changes. Deploy it to a compatible server or worker environment and configure `CRESTRON_BACKEND_URL` and `CRESTRON_BACKEND_TOKEN` as protected runtime variables.

The included `.openai/hosting.json` is intentionally unbound. The production Project Tools deployment and its project identifier are managed separately from this public source repository.

## License

No open-source license is granted by publication of this repository. All rights are reserved unless a license is added later.
