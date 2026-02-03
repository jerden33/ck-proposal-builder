export interface FedexLocation {
  id: string;
  name: string;
  category: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export async function parseFedexKML(): Promise<FedexLocation[]> {
  const response = await fetch('/Fedex Distribution Network.kml');
  const kmlText = await response.text();

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

  const locations: FedexLocation[] = [];
  const folders = xmlDoc.getElementsByTagName('Folder');

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const categoryElement = folder.getElementsByTagName('name')[0];
    const category = categoryElement?.textContent || 'Unknown';

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
          locations.push({
            id: `fedex-${i}-${j}`,
            name,
            category,
            coordinates: {
              lat,
              lng,
            },
          });
        }
      }
    }
  }

  return locations;
}
