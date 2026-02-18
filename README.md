# Azure Maps API Explorer

Azure Maps API Explorer is a Next.js demo app for testing Azure Maps REST endpoints with a modern UI and built-in request tooling. It supports geocoding, reverse geocoding, autocomplete, routing, weather lookups, and IP geolocation, plus map visualization, request previews, and copy-ready reference values for demos.

The app lives in [apps/maps-explorer](apps/maps-explorer).

## Features

- Geocode, reverse geocode, autocomplete, route directions, weather, and IP geolocation tabs
- Built-in map preview with pins, routes, and popups
- Request preview, curl builder, and response formatting
- Parameter checklists with persistence
- Reference values panel with copy buttons
- Authentication via Microsoft Entra or Azure Maps Key

## Tech stack

- Next.js (App Router)
- TypeScript + React
- Tailwind CSS
- Azure Maps REST APIs + Azure Maps Web SDK

## Architecture overview

- UI and state live in the client components under [apps/maps-explorer/app](apps/maps-explorer/app)
- API requests are proxied through [apps/maps-explorer/app/api/maps](apps/maps-explorer/app/api/maps) to keep keys server-side
- Map rendering uses the Azure Maps Web SDK via [apps/maps-explorer/app/(components)/MapPreview.tsx](apps/maps-explorer/app/(components)/MapPreview.tsx)

## Quick start

```bash
cd apps/maps-explorer
pnpm install
pnpm dev
```

Open http://localhost:3000 to view the explorer.

## Environment configuration

Copy the sample file and fill in values:

```bash
cd apps/maps-explorer
copy .env.sample .env.local
```

Required variables:

- `AZURE_TENANT_ID`
- `AZURE_MAPS_CLIENT_ID`
- `AZURE_MAPS_SCOPE` (default: `https://atlas.microsoft.com/.default`)

Optional API key (server-side only):

- `AZURE_MAPS_KEY`

Optional custom endpoint/base URL:

- `AZURE_MAPS_BASE_URL` (server)
- `NEXT_PUBLIC_AZURE_MAPS_BASE_URL` (client preview)

Optional for local development (client credentials flow):

- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

> In Azure-hosted environments, prefer Managed Identity and Key Vault over client secrets.

Prerequisite for Entra auth:

- Create a Microsoft Entra app registration before deployment.
- Capture its client ID, tenant ID, and client secret.
- Grant the app's service principal the Azure Maps Data Reader role on the Maps account.

## Tests

```bash
cd apps/maps-explorer
pnpm test
```

## Security and public repo checklist

Local scan notes:

- No hard-coded secrets were found in the repository.
- Secrets are referenced via environment variables and GitHub Actions secrets.
- .env.sample contains placeholders only.

Before making the repo public:

- Confirm .env.local or any real secrets are not committed.
- Rotate any keys that have ever been shared outside secure channels.
- Enable GitHub secret scanning and dependabot for the repo.

## Deployment

The repository includes Azure infrastructure under [infra](infra) and a GitHub Actions workflow for deployment in [.github/workflows](.github/workflows). Review and update Azure subscription and secrets before running.
