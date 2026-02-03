export interface FedexGroundLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  category: string;
}

export async function loadFedexGroundLocations(): Promise<FedexGroundLocation[]> {
  try {
    const response = await fetch('/fedex-ground-locations.json');
    if (!response.ok) {
      console.error('Failed to load FedEx Ground locations');
      return [];
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading FedEx Ground locations:', error);
    return [];
  }
}
