// Analysis script to find top 50 areas with high Circle K density near FedEx hubs
const fs = require('fs');
const { DOMParser } = require('xmldom');

// Haversine formula to calculate distance in miles
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// Load Circle K stores
console.log('Loading Circle K store data...');
const storeData = JSON.parse(fs.readFileSync('public/stores-data.json', 'utf8'));
const circleKStores = storeData.stores;
console.log(`Loaded ${circleKStores.length} Circle K stores`);

// Parse FedEx KML
console.log('Parsing FedEx KML...');
const kmlText = fs.readFileSync('public/Fedex Distribution Network.kml', 'utf8');
const parser = new DOMParser();
const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

const fedexHubs = [];
const folders = xmlDoc.getElementsByTagName('Folder');

// Categories we consider as major hubs/distribution centers
const hubCategories = [
  'Fedex Air Hubs',
  'Ground Hubs',
  'Ground Regional Sort Facilities',
  'Freight Service Centers',
  'Air Freight Centers',
  'Ground Facilities',
  'Fedex Airports'
];

for (let i = 0; i < folders.length; i++) {
  const folder = folders[i];
  const categoryElement = folder.getElementsByTagName('name')[0];
  const category = categoryElement?.textContent || 'Unknown';

  // Only process hub categories
  if (hubCategories.includes(category)) {
    const placemarks = folder.getElementsByTagName('Placemark');

    for (let j = 0; j < placemarks.length; j++) {
      const placemark = placemarks[j];
      const nameElement = placemark.getElementsByTagName('name')[0];
      const name = nameElement?.textContent || 'Unnamed';

      const coordinatesElement = placemark.getElementsByTagName('coordinates')[0];
      const coordsText = coordinatesElement?.textContent?.trim();

      if (coordsText) {
        const [lng, lat] = coordsText.split(',').map(parseFloat);

        if (!isNaN(lat) && !isNaN(lng)) {
          fedexHubs.push({
            name,
            category,
            lat,
            lng,
          });
        }
      }
    }
  }
}

console.log(`Found ${fedexHubs.length} FedEx hubs/distribution centers`);

// Calculate Circle K density near each FedEx hub
console.log('\nAnalyzing Circle K density near FedEx hubs...');
const results = [];

fedexHubs.forEach((hub, index) => {
  const storesWithin10Miles = circleKStores.filter(store => {
    const distance = calculateDistance(
      hub.lat,
      hub.lng,
      store.coordinates.lat,
      store.coordinates.lng
    );
    return distance <= 10;
  });

  if (storesWithin10Miles.length > 0) {
    // Get city/state from nearest store
    const nearestStore = storesWithin10Miles.reduce((nearest, store) => {
      const distance = calculateDistance(
        hub.lat,
        hub.lng,
        store.coordinates.lat,
        store.coordinates.lng
      );
      store.distanceToHub = distance;

      if (!nearest || distance < nearest.distanceToHub) {
        return store;
      }
      return nearest;
    }, null);

    results.push({
      fedexHub: hub.name,
      category: hub.category,
      location: `${nearestStore.city}, ${nearestStore.state}`,
      storeCount: storesWithin10Miles.length,
      nearestStoreDistance: nearestStore.distanceToHub.toFixed(2),
      coordinates: {
        lat: hub.lat,
        lng: hub.lng
      },
      stores: storesWithin10Miles.map(s => ({
        address: s.address,
        city: s.city,
        state: s.state,
        distance: s.distanceToHub.toFixed(2),
        truckAccessible: s.truckAccessible
      }))
    });
  }

  if ((index + 1) % 50 === 0) {
    console.log(`Processed ${index + 1}/${fedexHubs.length} hubs...`);
  }
});

// Sort by store count (descending)
results.sort((a, b) => b.storeCount - a.storeCount);

// Get top 50
const top50 = results.slice(0, 50);

console.log('\n=== TOP 50 AREAS WITH HIGH CIRCLE K DENSITY NEAR FEDEX HUBS ===\n');

top50.forEach((result, index) => {
  console.log(`${index + 1}. ${result.location}`);
  console.log(`   FedEx Facility: ${result.fedexHub} (${result.category})`);
  console.log(`   Circle K Stores within 10 miles: ${result.storeCount}`);
  console.log(`   Nearest store: ${result.nearestStoreDistance} miles away`);
  console.log('');
});

// Save detailed results to JSON
const outputData = {
  generatedAt: new Date().toISOString(),
  totalFedexHubs: fedexHubs.length,
  totalCircleKStores: circleKStores.length,
  hubsWithNearbyStores: results.length,
  top50: top50
};

fs.writeFileSync('top-50-analysis.json', JSON.stringify(outputData, null, 2));
console.log('Detailed results saved to: top-50-analysis.json');

// Generate summary statistics
console.log('\n=== SUMMARY STATISTICS ===');
console.log(`Total FedEx hubs analyzed: ${fedexHubs.length}`);
console.log(`Hubs with Circle K stores within 10 miles: ${results.length}`);
if (top50.length > 0) {
  console.log(`Average stores per hub (top 50): ${(top50.reduce((sum, r) => sum + r.storeCount, 0) / top50.length).toFixed(1)}`);
  console.log(`Highest density: ${top50[0].storeCount} stores in ${top50[0].location}`);
} else {
  console.log('No areas found with stores near FedEx hubs within the specified radius.');
}
