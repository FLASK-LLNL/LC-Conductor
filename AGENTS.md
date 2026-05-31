# Repository Guidelines

## Project Structure & Module Organization

LC-Conductor is a submodule used by FLASK Copilot for backend orchestration helpers and shared React UI. The Python package is in `lc_conductor/`; key modules include endpoint discovery, backend management, local MCP proxying, and tool registration. Tests live in `tests/`.

The reusable UI library is in `lcc_ui_components/`. Source files are under `lcc_ui_components/src/`, with Vite build output in `lcc_ui_components/dist/`. The parent frontend consumes this package through a local file dependency.

## Build, Test, and Development Commands

- `pip install -e ".[test]"`: install LC-Conductor with test dependencies.
- `python -m pytest`: run Python tests.
- `pre-commit run --all-files`: run Black, Prettier, ESLint, and basic file checks.
- `cd lcc_ui_components && npm ci`: install pinned UI dependencies.
- `cd lcc_ui_components && npm run build`: build the component library and type declarations.
- `cd lcc_ui_components && npm run dev`: run the library build in watch mode.

## Coding Style & Naming Conventions

Python uses Black with Python 3.11. Use 4-space indentation, `snake_case` modules/functions, and `PascalCase` classes. TypeScript/React uses Prettier with 2-space indentation, single quotes, semicolons, and about 100-character lines. Components use `PascalCase` filenames, such as `ReasoningSidebar.tsx`; prefix intentionally unused parameters with `_`.

## Testing Guidelines

Python tests use `pytest` and follow `tests/test_*.py`. Prefer focused tests for endpoint discovery, MCP server validation, backend manager behavior, and local proxy handling. For UI changes, run `npm run build`; add tests when introducing reusable stateful logic.

## Commit & Pull Request Guidelines

Use clear, scoped commit subjects, for example `fix(endpoint): validate local MCP URL`. Pull requests should include a summary, validation commands, linked issues when available, and screenshots for UI changes. Because this repository is used as a submodule, update the parent repository pointer after submodule changes are committed.

## Security & Configuration Tips

Do not commit API keys, local endpoint caches, generated `dist/` churn unless intended, `node_modules/`, `.pytest_cache/`, or local logs. Keep provider credentials in environment variables.
