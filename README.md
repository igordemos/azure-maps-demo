# igordemos.com

## Azure Maps API Explorer (MVP)

This repository hosts the Azure Maps API Explorer demo that will later fold into the igordemos.com portal. The app lives in `apps/maps-explorer` and showcases secure Azure Maps geocoding and reverse geocoding via Microsoft Entra authentication.

### Quick start

```bash
cd apps/maps-explorer
pnpm install
pnpm dev
```

Open http://localhost:3000 to view the explorer.

### Environment configuration

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

### Run tests

```bash
cd apps/maps-explorer
pnpm test
```
