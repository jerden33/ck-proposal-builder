# Fleet Insights — Claude Code Context

## Project Overview

**Fleet Insights** (repo: `ck-proposal-builder`) is a Next.js web app that analyzes fleet fueling transaction data to surface Circle K convenience store savings opportunities. It's used by sales teams and fleet managers to identify where fleets are fueling, which competitors they're using, and how much could be saved by switching to Circle K.

The app originally started as a "Circle K Pro Proposal Builder" (PDF proposal generation), was rebranded to FuelSight, and is now Fleet Insights. The proposal/PDF workflow was removed; the focus is entirely on transaction analysis and insights.

**Live domain:** `https://circlek.pro`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 3 |
| Auth & DB | Supabase (PostgreSQL + Supabase Auth) |
| Maps | Mapbox GL JS 2.15 |
| PDF | jsPDF + html2canvas |
| File parsing | XLSX (Excel/CSV), @xmldom/xmldom (KML) |
| Icons | Lucide React |
| Fonts | DM Sans (body), Space Grotesk (headings) |
| Deployment | Vercel |

---

## Directory Structure

```
ck-proposal-builder/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (fonts, metadata)
│   ├── page.tsx                # Redirects to /dashboard
│   ├── globals.css             # Global styles & animations
│   ├── analysis/page.tsx       # Main analysis page (~79KB — core feature)
│   ├── dashboard/page.tsx      # Saved analyses list
│   ├── login/page.tsx          # Auth (email/password)
│   ├── admin/page.tsx          # Admin settings panel
│   ├── comparison/             # Fuel price comparison
│   ├── otr/                    # OTR (Over-the-Road) analysis
│   └── share/[token]/page.tsx  # Public shareable view
│
├── components/
│   ├── Navbar.tsx
│   ├── ShareModal.tsx
│   ├── ImageUploader.tsx
│   ├── FuelingMap.tsx          # Mapbox interactive map (14KB)
│   ├── OTRMap.tsx              # OTR corridor map (16KB)
│   └── analysis/               # 10 analysis-specific panels
│       ├── OpportunityPanel.tsx
│       ├── ProximityPanel.tsx
│       ├── TopCKLocationsCard.tsx
│       ├── OTRAnalysisPanel.tsx
│       ├── VehiclesTab.tsx
│       ├── BehavioralInsightsTab.tsx
│       ├── TimePatternsTab.tsx
│       ├── FraudFlagsTab.tsx
│       ├── AnnualizedPanel.tsx
│       └── SavingsCalculatorPanel.tsx
│
├── lib/                        # Core business logic
│   ├── transaction-parser.ts   # CSV parsing & normalization (561 lines)
│   ├── transaction-analysis.ts # Main analysis engine (1,064 lines)
│   ├── otr-analysis.ts         # OTR corridor analysis (1,263 lines)
│   ├── geocoding.ts            # Mapbox geocoding with caching (139 lines)
│   ├── mapbox.ts               # Mapbox utilities (131 lines)
│   ├── stores.ts               # CK store data helpers (125 lines)
│   ├── types.ts                # Shared TypeScript types (68 lines)
│   ├── kml-parser.ts           # KML geospatial file parsing
│   ├── fedex-data.ts           # FedEx location data
│   └── supabase/
│       ├── client.ts           # Browser Supabase client
│       ├── server.ts           # Server-side Supabase client
│       ├── queries.ts          # All DB queries (10.8KB)
│       └── storage.ts          # Image/file storage ops
│
├── public/
│   ├── stores-data.json        # 5,238 Circle K store locations (1.2MB)
│   ├── fedex-ground-locations.json
│   ├── fedex-distribution-network.kml
│   ├── Heartland.csv           # Sample transaction data for testing
│   └── circle-k-pro-logo.png
│
├── scripts/
│   └── geocode-fedex-simple.js
│
├── middleware.ts               # Auth middleware (protects routes)
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── *.sql                       # Supabase migration files
```

---

## Environment Variables

Required in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your-mapbox-token
NEXT_PUBLIC_APP_URL=https://circlek.pro
```

---

## Development Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server → http://localhost:3000
npm run build      # Production build
npm run lint       # ESLint check
npm start          # Run production build
```

---

## Database (Supabase)

**Tables:**
- `profiles` — User accounts; `is_admin` and `is_super_admin` boolean columns
- `analyses` — Saved fleet analysis results (JSON blobs)
- `analysis_shares` — Shareable public link tokens + view counts
- `app_settings` — Global feature/admin config
- `products_config` — Legacy, largely unused

**Auth:** Invitation-only. No public registration. Admins invite users via the admin panel. Three tiers:
- Regular users — own analyses only
- Admins — all analyses + admin panel
- Super admins — full system access

**RLS:** Row-level security enabled on all tables. Key SQL migrations live in the root as `.sql` files.

---

## Feature Flags

The analysis page (`/app/analysis/page.tsx`) uses a `FeatureFlags` record to conditionally render panels. All flags are on by default:

| Flag | Controls |
|---|---|
| `brandBreakdown` | Brand comparison charts |
| `geographic` | State-level analysis |
| `competitorLocations` | Competitor store overlay |
| `vehicles` | Vehicle-level breakdown tab |
| `mapView` | Interactive Mapbox map |
| `fuelTypeSplit` | Diesel vs. gasoline split |
| `savingsCalc` | ROI/savings calculator |
| `annualized` | Annualized projections panel |
| `behavioralInsights` | Driver behavior patterns |
| `timeOfDay` | Time-of-day heatmap |
| `fraudFlags` | Fraud detection alerts |
| `otrCorridors` | OTR corridor analysis (auto-enabled when detected) |
| `skipGeocoding` | Skip Mapbox API calls during processing |

---

## Core Analysis Flow

1. User uploads a CSV of fuel transactions
2. `transaction-parser.ts` parses and normalizes the data (handles WEX, Speedpass, Heartland, and generic formats)
3. `transaction-analysis.ts` runs the full analysis engine:
   - Brand breakdown (CK vs. competitors)
   - Geographic distribution
   - Vehicle-level metrics
   - CK proximity check (within 10 miles using Haversine formula against `stores-data.json`)
   - Fraud flag detection
   - Behavioral insights
   - Savings estimate
4. Results render across tabbed panels
5. User can save analysis to Supabase, share via public link, or export

**CK store data:** `public/stores-data.json` — 5,238 active Circle K locations loaded client-side. No API call needed for proximity logic.

**Geocoding:** Mapbox Geocoding API is called for addresses not already in the CK store database. Results are cached in memory to avoid duplicate calls.

---

## Maps (Mapbox)

Both map components (`FuelingMap.tsx`, `OTRMap.tsx`) are dynamically imported with `ssr: false` because Mapbox requires a browser environment:

```typescript
const FuelingMap = dynamic(() => import('@/components/FuelingMap'), {
  ssr: false,
  loading: () => <LoadingPlaceholder />
})
```

The Mapbox token is set via `NEXT_PUBLIC_MAPBOX_TOKEN`.

---

## OTR (Over-the-Road) Analysis

`lib/otr-analysis.ts` — Identifies fleet vehicles likely driving long haul corridors (cross-state fueling patterns). Detects coverage gaps where Circle K locations exist along the route. The OTR map shows FedEx-style corridor overlays.

---

## Git Branch Convention

Active development branch: `claude/transaction-analysis-fueling-Jwz9f`

Always push to the `claude/` prefixed branch. Branch names must start with `claude/` and end with the session ID suffix.

---

## Recent History & Project Evolution

| Phase | Description |
|---|---|
| Original | Circle K Pro Proposal Builder — 4-step PDF proposal workflow |
| Rebrand 1 | FuelSight — renamed, removed proposal PDF generation |
| Current | Fleet Insights — pure analysis tool, blue Zap logo reverted |

Key recent commits:
- `a7258e8` — Switch CK Fueling Opportunity to proximity-based (within 10 mi)
- `98f2fef` — Remove proposal builder; focus on analysis tool
- `ad420f7` — UX improvements: new analysis flow, feature flags on by default
- `e9a87ec` — Fix fuel type classification for WEX codes

---

## Known Patterns & Conventions

- **Component location:** Analysis sub-panels live in `components/analysis/`; shared UI in `components/`
- **Data types:** Defined in `lib/types.ts` — `TransactionSummary`, `BrandSummary`, `LocationSummary`, `VehicleSummary`
- **Supabase queries:** All DB interaction goes through `lib/supabase/queries.ts`
- **No prop drilling for auth:** Supabase auth state is read directly in components via `supabase.auth.getUser()`
- **Tailwind only:** No CSS modules or styled-components. Custom colors in `tailwind.config.js`: `accent`, `off-black`, `off-white`, `brand-orange`
- **No public signup:** Users are invited by admins only

---

## Documentation Files in Repo

| File | Purpose |
|---|---|
| `README.md` | Project overview |
| `QUICKSTART.md` | 5-minute setup |
| `AUTH-SETUP.md` | Supabase auth config |
| `DEPLOYMENT.md` | Vercel deploy steps |
| `SUPER_ADMIN_SETUP.md` | Permission tiers |
| `USER_MANAGEMENT_GUIDE.md` | Managing users |
| `REAL-DATA-INTEGRATED.md` | CK store data integration |
| `MAPS-AND-PDF-GUIDE.md` | Map features |
| `SUPABASE_STORAGE_SETUP.md` | Image storage |
| `IMAGE_UPLOAD_DEBUG_GUIDE.md` | Upload troubleshooting |
