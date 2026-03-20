# Repository Guidelines

## Project Structure & Module Organization
Visual Context Analyzer (CodeLens) runs as an Electron overlay. TypeScript sources live in `src/` (main process, bridge, logging, analysis). Frontend markup is in `index.html`, with component styles in `styles/`. Tests sit in `test/` alongside fixtures; compiled assets land in `dist/` and packaged builds in `release/`. Runtime logs rotate under `logs/`. Screenshots write to the OS temp directory as `screenshot-{slot}-{timestamp}.png`; never check them in.

## Build, Test, and Development Commands
Use `npm run dev` for the watch-driven development loop that recompiles TypeScript and restarts Electron. `npm run build` transpiles to `dist/`, while `npm start` builds and launches the desktop app. Type-check without emitting files via `npm run typescript-check`. Run the suite with `npm test`, add `npm run test:watch` for TDD, and prefer `npm run test:coverage` before major merges. Ship installers with `npm run package[-win|-linux|-all]` after a clean build.

## Coding Style & Naming Conventions
TypeScript strict mode is standard; prefer `async`/`await` over raw promises. Biome enforces tabs, single quotes, trailing commas, and 120-character lines—format with `npm run format` and lint using `npm run lint` or `npm run check`. Name modules by responsibility (`codeAnalyzer.ts`, `logger.ts`); mirror tests as `*.test.ts`. Functions stay camelCase, classes and React-style components PascalCase, IPC channels and constants SCREAMING_SNAKE_CASE.

## Testing Guidelines
Vitest powers the suite. Place specs in `test/` or alongside complex modules, and describe behaviour (`describe('screenshot workflow', ...)`). Cover new branches in screen-capture flows, IPC messaging, and OpenRouter integration. Stub filesystem interactions and external APIs to keep runs deterministic. Use `npm run test:coverage` to confirm coverage remains above the current baseline before opening a PR.

## Commit & Pull Request Guidelines
Follow the conventional commit style already in history (`build(dev): ...`, `style(code): ...`). Keep scopes meaningful and commits focused, including related tests or docs. PRs need a summary of user-visible impact, validation notes (tests run, screenshots for UI tweaks), linked issues, and callouts for entitlement or API changes. Draft PRs are welcome while iterating, but convert to ready-for-review once CI and coverage pass.

## Security & Configuration Tips
Local runs require `OPENROUTER_API_KEY`; load it via `.env` and avoid committing credentials. Optional `OPENROUTER_SITE_URL` and `OPENROUTER_SITE_NAME` improve OpenRouter rankings. Electron on macOS needs Screen Recording permission—document any onboarding hurdles. Log archives may contain prompt metadata; redact before sharing outside the team.
