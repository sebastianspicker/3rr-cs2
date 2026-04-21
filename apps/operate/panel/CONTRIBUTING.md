# Contributing

Thanks for contributing!

## Development Setup

```bash
cat .nvmrc
npm ci
cp .env.example .env
npm run dev
```

## Checks

```bash
npm run lint
npm run format:check
npm test
npm run validate
```

## Security

- Do not commit secrets or credentials.
- Use `ALLOW_DEFAULT_CREDENTIALS=false` for local testing unless explicitly needed.
- Prefer Redis-backed sessions for production.

## Pull Requests

- Keep changes minimal and focused.
- Update documentation when behavior changes.
- Ensure tests, lint, format, and validate are green.

## Issue Reports

Use the GitHub issue templates for bugs and feature requests.
