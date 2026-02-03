# FedEx Ground Locations Geocoding

This script geocodes the FedEx Freight Service Centers from the KML file to create a JSON file with coordinates.

## Problem

The `fedex-distribution-network.kml` file contains 389 FedEx Freight Service Centers with addresses but **no coordinates**. Only the "Fedex Airports" and "Fedex Air Hubs" categories have coordinates in the KML file.

## Solution

The `geocode-fedex-freight.js` script:
1. Parses the KML file
2. Extracts all Freight Service Centers locations (389 total)
3. Geocodes each address using the Mapbox Geocoding API
4. Saves the results to `/public/fedex-ground-locations.json`

## Prerequisites

- Node.js installed
- Mapbox API token (same one used in the app)

## Usage

### Option 1: Using command line argument

```bash
node scripts/geocode-fedex-freight.js YOUR_MAPBOX_TOKEN
```

### Option 2: Using environment variable

```bash
export NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
node scripts/geocode-fedex-freight.js
```

### Option 3: Using .env.local file

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
```

Then run:

```bash
node scripts/geocode-fedex-freight.js
```

## Output

The script will:
- Geocode all 389 locations
- Show progress in the terminal
- Save results to `/public/fedex-ground-locations.json`
- Create a backup file in `/scripts/fedex-ground-YYYY-MM-DD.json`

## Rate Limiting

The script includes a 150ms delay between requests to respect Mapbox's rate limits (600 requests/minute).

Total time: ~60 seconds for 389 locations

## Data Format

Output JSON format:
```json
[
  {
    "id": "fedex-ground-1",
    "name": "Fargo Moorhead ND FXFE-FAR",
    "address": "2500 3rd Avenue NW",
    "city": "West Fargo",
    "state": "ND",
    "zip": "58078",
    "coordinates": {
      "lat": 46.8772,
      "lng": -96.9003
    },
    "category": "FedEx Ground"
  },
  ...
]
```

## Troubleshooting

If geocoding fails for some addresses:
- Check that your Mapbox token is valid
- Ensure you have network connectivity
- Check the console output for specific failures
- Failed addresses will be skipped and logged

## After Running

Once the script completes, the comparison map at `/comparison` will automatically load the geocoded FedEx Ground locations.
