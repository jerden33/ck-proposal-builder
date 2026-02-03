const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Try to get token from command line argument, env var, or .env file
const MAPBOX_TOKEN = process.argv[2] || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

if (!MAPBOX_TOKEN) {
  console.error('Error: Mapbox token required');
  console.error('\nUsage: node geocode-fedex-freight.js <MAPBOX_TOKEN>');
  console.error('  or set NEXT_PUBLIC_MAPBOX_TOKEN environment variable');
  process.exit(1);
}

// Geocode an address using Mapbox
async function geocodeAddress(address, city, state, zip) {
  const fullAddress = `${address}, ${city}, ${state} ${zip}, USA`;
  const encodedAddress = encodeURIComponent(fullAddress);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }

    console.warn(`  ⚠ Could not geocode: ${fullAddress}`);
    return null;
  } catch (error) {
    console.error(`  ✗ Error geocoding ${fullAddress}:`, error.message);
    return null;
  }
}

// Add delay to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('Starting FedEx Freight Service Centers geocoding...\n');

  // Read the KML file
  const kmlPath = path.join(__dirname, '..', 'public', 'fedex-distribution-network.kml');
  const kmlText = fs.readFileSync(kmlPath, 'utf-8');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const locations = [];
  const folders = xmlDoc.getElementsByTagName('Folder');

  // Find the Freight Service Centers folder
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const categoryElement = folder.getElementsByTagName('name')[0];
    const category = categoryElement?.textContent || 'Unknown';

    if (category !== 'Freight Service Centers') {
      continue;
    }

    console.log(`Found category: ${category}`);
    const placemarks = folder.getElementsByTagName('Placemark');
    console.log(`Total placemarks: ${placemarks.length}\n`);

    for (let j = 0; j < placemarks.length; j++) {
      const placemark = placemarks[j];

      // Get name
      const nameElement = placemark.getElementsByTagName('name')[0];
      const name = nameElement?.textContent || 'Unnamed';

      // Get address from ExtendedData
      const dataElements = placemark.getElementsByTagName('Data');
      let street = '', city = '', state = '', zip = '';

      for (let k = 0; k < dataElements.length; k++) {
        const dataEl = dataElements[k];
        const attrName = dataEl.getAttribute('name');
        const valueEl = dataEl.getElementsByTagName('value')[0];
        const value = valueEl?.textContent || '';

        if (attrName === 'Street') street = value;
        else if (attrName === 'City') city = value;
        else if (attrName === 'State') state = value;
        else if (attrName === 'Zip') zip = value;
      }

      if (!street || !city || !state) {
        console.log(`  ⚠ Skipping ${name} - missing address data`);
        continue;
      }

      console.log(`[${j + 1}/${placemarks.length}] ${name}`);
      console.log(`  ${street}, ${city}, ${state} ${zip}`);

      // Geocode the address
      const coords = await geocodeAddress(street, city, state, zip);

      if (coords) {
        console.log(`  ✓ Geocoded: ${coords.lat}, ${coords.lng}`);
        locations.push({
          id: `fedex-ground-${j + 1}`,
          name: name,
          address: street,
          city: city,
          state: state,
          zip: zip,
          coordinates: coords,
          category: 'FedEx Ground'
        });
      }

      // Rate limiting: 600 requests per minute = ~100ms per request
      await delay(150);
    }

    break; // Only process Freight Service Centers
  }

  console.log(`\n\n✓ Successfully geocoded ${locations.length} locations`);

  // Save to file
  const outputPath = path.join(__dirname, '..', 'public', 'fedex-ground-locations.json');
  fs.writeFileSync(outputPath, JSON.stringify(locations, null, 2));
  console.log(`\n✓ Saved to: ${outputPath}`);

  // Save backup
  const timestamp = new Date().toISOString().split('T')[0];
  const backupPath = path.join(__dirname, `fedex-ground-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(locations, null, 2));
  console.log(`✓ Backup saved to: ${backupPath}`);

  console.log('\nDone!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
