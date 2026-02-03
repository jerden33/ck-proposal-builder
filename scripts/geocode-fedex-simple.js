const fs = require('fs');
const path = require('path');
const https = require('https');
const { DOMParser } = require('@xmldom/xmldom');

console.log('='.repeat(60));
console.log('FedEx Ground Locations Geocoding Script');
console.log('='.repeat(60));
console.log('');

// Get token from command line
const MAPBOX_TOKEN = process.argv[2];

if (!MAPBOX_TOKEN) {
  console.error('❌ ERROR: No Mapbox token provided!');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/geocode-fedex-simple.js YOUR_MAPBOX_TOKEN');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/geocode-fedex-simple.js pk.eyJ1Ij...');
  console.log('');
  process.exit(1);
}

console.log('✓ Mapbox token received');
console.log('');

// Test Mapbox connection first
function testMapboxConnection() {
  return new Promise((resolve) => {
    console.log('🔍 Testing Mapbox API connection...');
    const testUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${MAPBOX_TOKEN}&limit=1`;

    https.get(testUrl, (res) => {
      if (res.statusCode === 200) {
        console.log('✓ Mapbox API connection successful!');
        console.log('');
        resolve(true);
      } else {
        console.error(`❌ Mapbox API returned status code: ${res.statusCode}`);
        if (res.statusCode === 401) {
          console.error('   This usually means your token is invalid.');
        }
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`❌ Cannot connect to Mapbox API: ${err.message}`);
      console.error('   Make sure you have internet connection.');
      resolve(false);
    });
  });
}

// Geocode an address
function geocodeAddress(address, city, state, zip) {
  const fullAddress = `${address}, ${city}, ${state} ${zip}, USA`;
  const encodedAddress = encodeURIComponent(fullAddress);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.features && json.features.length > 0) {
            const [lng, lat] = json.features[0].center;
            resolve({ lat, lng });
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error(`   ⚠ Parse error: ${e.message}`);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error(`   ⚠ Request error: ${err.message}`);
      resolve(null);
    });
  });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // Test connection first
  const connected = await testMapboxConnection();
  if (!connected) {
    console.log('');
    console.log('Please fix the connection issue and try again.');
    process.exit(1);
  }

  // Read the KML file
  console.log('📂 Reading KML file...');
  const kmlPath = path.join(__dirname, '..', 'public', 'fedex-distribution-network.kml');

  if (!fs.existsSync(kmlPath)) {
    console.error(`❌ KML file not found at: ${kmlPath}`);
    process.exit(1);
  }

  const kmlText = fs.readFileSync(kmlPath, 'utf-8');
  console.log(`✓ KML file loaded (${Math.round(kmlText.length / 1024)}KB)`);
  console.log('');

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const locations = [];
  const folders = xmlDoc.getElementsByTagName('Folder');

  console.log('🔍 Looking for Freight Service Centers...');

  // Find the Freight Service Centers folder
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const categoryElement = folder.getElementsByTagName('name')[0];
    const category = categoryElement?.textContent || 'Unknown';

    if (category !== 'Freight Service Centers') {
      continue;
    }

    const placemarks = folder.getElementsByTagName('Placemark');
    console.log(`✓ Found ${placemarks.length} Freight Service Centers`);
    console.log('');
    console.log('Starting geocoding...');
    console.log('-'.repeat(60));

    let successCount = 0;
    let failCount = 0;

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
        console.log(`⏭  [${j + 1}/${placemarks.length}] Skipping ${name} (missing address)`);
        failCount++;
        continue;
      }

      process.stdout.write(`🌍 [${j + 1}/${placemarks.length}] ${name.substring(0, 30).padEnd(30)} ... `);

      // Geocode the address
      const coords = await geocodeAddress(street, city, state, zip);

      if (coords) {
        console.log(`✓ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
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
        successCount++;
      } else {
        console.log('✗ Failed');
        failCount++;
      }

      // Rate limiting
      await delay(150);
    }

    console.log('-'.repeat(60));
    console.log('');
    console.log(`✓ Successfully geocoded: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    console.log('');

    break;
  }

  if (locations.length === 0) {
    console.error('❌ No locations were geocoded. Please check the errors above.');
    process.exit(1);
  }

  // Save to file
  const outputPath = path.join(__dirname, '..', 'public', 'fedex-ground-locations.json');
  fs.writeFileSync(outputPath, JSON.stringify(locations, null, 2));
  console.log(`💾 Saved ${locations.length} locations to:`);
  console.log(`   ${outputPath}`);

  // Save backup
  const timestamp = new Date().toISOString().split('T')[0];
  const backupPath = path.join(__dirname, `fedex-ground-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(locations, null, 2));
  console.log(`💾 Backup saved to:`);
  console.log(`   ${backupPath}`);
  console.log('');

  console.log('='.repeat(60));
  console.log('✅ COMPLETE!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Next steps:');
  console.log('  1. git add public/fedex-ground-locations.json');
  console.log('  2. git commit -m "Add geocoded FedEx Ground locations"');
  console.log('  3. git push');
  console.log('');
}

main().catch(error => {
  console.error('');
  console.error('💥 FATAL ERROR:');
  console.error(error);
  process.exit(1);
});
