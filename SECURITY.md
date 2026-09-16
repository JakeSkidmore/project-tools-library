# Security Policy

## Sensitive data

Do not commit product documents, pricing workbooks, customer exports, saved projects, user databases, password material, bridge tokens, tunnel credentials, private keys, or environment files.

If a secret is committed, remove it from the repository history and rotate it immediately. Deleting the file in a later commit is not sufficient.

## Reporting a vulnerability

Do not publish credentials or exploit details in a public issue. Contact the repository owner privately through their GitHub profile.

## Deployment guidance

- Keep the private bridge token in server-side runtime configuration.
- Do not expose the bridge directly without HTTPS and its service-token check.
- Keep username and password verification on the private bridge.
- Use strong unique passwords and retain login rate limiting.
- Keep operating systems, runtimes, and dependencies updated.
