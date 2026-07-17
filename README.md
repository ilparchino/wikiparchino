# Wiki Parchino Frontend

The browser interface for Wiki Parchino, a private knowledge base for the Parchino friend group. The application provides an Italian, responsive UI for browsing and editing people, places, epochs, events, relationships, and media, together with search and pull activities.

The FastAPI backend is maintained as a separate repository and is required for authentication and all application data.

## Features

- Bearer-authenticated login for fixed accounts with tab-scoped session persistence.
- User profile with recent activity and password changing.
- Dashboard with content totals and a daily item.
- Routed list, detail, create, and edit views for every entity type.
- Content-focused detail headers that keep internal numeric identifiers out of page text.
- Relationship editing from entity detail pages.
- Authenticated image upload, display, deletion, and fixed list previews.
- Cross-entity search.
- Weighted random lottery and item-of-the-day activity.
- Seasonal designer branding selected from the current date.
- Responsive Bootstrap navigation and forms.

## Technology

- React 18
- TypeScript
- Vite
- React Router
- Bootstrap and Bootstrap Icons
- Vitest, Testing Library, and jsdom

## Project Layout

```text
.
|-- public/              Static files copied into the production build
|   `-- brand/           Seasonal runtime logos
|-- src/
|   |-- test/            Shared test setup
|   |-- App.tsx          Routes and application views
|   |-- api.ts           Typed backend client
|   |-- main.tsx         React entry point
|   |-- styles.css       Project-specific Bootstrap overrides
|   `-- types.ts         Frontend API types
|-- index.html
|-- package.json
|-- vite.config.ts
`-- vitest.config.ts
```

## Local Setup

Requirements:

- A current Node.js LTS release.
- npm.
- A running Wiki Parchino backend.

Install dependencies locally:

```bash
npm install
```

Optionally create a local environment file:

```bash
cp .env.example .env
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Current browser hostname on port `8000` | Backend origin without a trailing slash. |

For the standard laptop setup, the explicit value is:

```text
VITE_API_URL=http://127.0.0.1:8000
```

Vite exposes `VITE_*` variables to browser code. Never place passwords, tokens, or other secrets in these variables.

The backend must allow the exact frontend origin and the `Authorization` header. Tokens are kept in `sessionStorage`, removed on logout or authorization failure, and never placed in URLs.

## Running

Start the Vite development server:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/wikiparchino/`.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm test` | Run the frontend test suite once. |
| `npm run build` | Type-check the source and create `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run generate:favicons` | Regenerate browser and PWA icons from the high-resolution source using ffmpeg. |

## Testing

Run component and API-client tests:

```bash
npm test
```

Verify type checking and the production bundle:

```bash
npm run build
```

With both application servers running, an optional semantic smoke test is:

```bash
lightpanda fetch http://127.0.0.1:5173 --dump semantic_tree_text --wait-ms 1000
```

Manual acceptance should cover login, navigation, each entity list/detail/form, relationships, image upload, search, random pulls, daily pulls, and the collapsed mobile navbar.

## Deployment Notes

- `dist/` is generated and must not be committed on the source branch.
- Vite uses the `/wikiparchino/` project base and hash routes, so direct URLs have the form `https://ilparchino.github.io/wikiparchino/#/people/1`.
- The Pages workflow builds with `VITE_API_URL=https://francescoborri.ddns.net/wikiparchino`.
- An HTTPS frontend must use an HTTPS backend to avoid browser mixed-content blocking.
- The deployed backend CORS origin must exactly match the public frontend origin.
- Once the remote repository URL exists, expose a visible source-code link in the deployed application to satisfy the AGPLv3 network-source requirement.

### GitHub Pages

The deployment workflow is already available at `.github/workflows/deploy-pages.yml`. It expects the repository to be named `ilparchino/wikiparchino`, matching the required GitHub Pages path. After pushing the `main` branch:

1. Open the repository on GitHub and go to **Settings > Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main` or run **Deploy GitHub Pages** manually from the Actions tab.
4. Wait for the `github-pages` environment deployment, then open `https://ilparchino.github.io/wikiparchino/#/`.

The workflow uses `npm ci`; all packages are installed into the workflow workspace from `package-lock.json`, with no global npm packages required.

## Security

Do not commit `.env` files, tokens, real credentials, or private exported data. Treat any Bearer token as a password until it expires or is revoked, avoid rendering untrusted HTML, and keep frontend dependencies updated.

## License

Copyright (C) 2026 Francesco Borri. The source code and included artwork are licensed under the GNU Affero General Public License version 3 only. See [LICENSE.md](LICENSE.md).
