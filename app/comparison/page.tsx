'use client';

import { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { loadFedexGroundLocations, FedexGroundLocation } from '@/lib/fedex-data';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface CircleKStore {
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
}

export default function ComparisonPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [circleKStores, setCircleKStores] = useState<CircleKStore[]>([]);
  const [fedexLocations, setFedexLocations] = useState<FedexGroundLocation[]>([]);
  const [showCircleK, setShowCircleK] = useState(true);
  const [showFedex, setShowFedex] = useState(true);
  const [loading, setLoading] = useState(true);
  const circleKMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const fedexMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(100);
  const [filteredCircleKStores, setFilteredCircleKStores] = useState<CircleKStore[]>([]);
  const [filteredFedexLocations, setFilteredFedexLocations] = useState<FedexGroundLocation[]>([]);

  // Calculate distance between two coordinates in miles
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Filter locations by proximity when search center changes
  useEffect(() => {
    if (!searchCenter) {
      setFilteredCircleKStores([]);
      setFilteredFedexLocations([]);
      return;
    }

    const [centerLng, centerLat] = searchCenter;

    const filteredStores = circleKStores.filter((store) => {
      const distance = calculateDistance(
        centerLat,
        centerLng,
        store.coordinates.lat,
        store.coordinates.lng
      );
      return distance <= radiusMiles;
    });

    const filteredFedex = fedexLocations.filter((location) => {
      const distance = calculateDistance(
        centerLat,
        centerLng,
        location.coordinates.lat,
        location.coordinates.lng
      );
      return distance <= radiusMiles;
    });

    setFilteredCircleKStores(filteredStores);
    setFilteredFedexLocations(filteredFedex);
  }, [searchCenter, radiusMiles, circleKStores, fedexLocations]);

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchCenter(null);
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchQuery
        )}.json?access_token=${mapboxgl.accessToken}&country=US`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        setSearchCenter([lng, lat]);

        if (map.current) {
          map.current.flyTo({
            center: [lng, lat],
            zoom: 8,
            duration: 2000,
          });
        }
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchCenter(null);
    if (map.current) {
      map.current.flyTo({
        center: [-98.5795, 39.8283],
        zoom: 4,
        duration: 2000,
      });
    }
  };

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const { loadStoreData, getAllStores: getStores } = await import('@/lib/stores');

        // Load store data first
        await loadStoreData();

        const [stores, fedex] = await Promise.all([
          Promise.resolve(getStores()),
          loadFedexGroundLocations(),
        ]);

        setCircleKStores(stores);
        setFedexLocations(fedex);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || loading) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5795, 39.8283], // Center of USA
      zoom: 4,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
    };
  }, [loading]);

  // Add Circle K markers
  useEffect(() => {
    if (!map.current || loading) return;

    // Remove existing markers
    circleKMarkersRef.current.forEach((marker) => marker.remove());
    circleKMarkersRef.current = [];

    if (showCircleK) {
      filteredCircleKStores.forEach((store) => {
        const el = document.createElement('div');
        el.className = 'circle-k-marker';
        el.style.backgroundColor = '#EC6707'; // Circle K orange
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';

        const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(
          `<div style="font-family: sans-serif;">
            <strong style="color: #EC6707;">Circle K</strong><br/>
            ${store.address}<br/>
            ${store.city}, ${store.state} ${store.zip}
          </div>`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([store.coordinates.lng, store.coordinates.lat])
          .setPopup(popup)
          .addTo(map.current!);

        circleKMarkersRef.current.push(marker);
      });
    }
  }, [filteredCircleKStores, showCircleK, loading]);

  // Add FedEx markers
  useEffect(() => {
    if (!map.current || loading) return;

    // Remove existing markers
    fedexMarkersRef.current.forEach((marker) => marker.remove());
    fedexMarkersRef.current = [];

    if (showFedex) {
      filteredFedexLocations.forEach((location) => {
        const el = document.createElement('div');
        el.className = 'fedex-marker';
        el.style.backgroundColor = '#4D148C'; // FedEx purple
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';

        const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(
          `<div style="font-family: sans-serif;">
            <strong style="color: #4D148C;">FedEx Ground</strong><br/>
            ${location.name}<br/>
            <span style="font-size: 12px; color: #666;">
              ${location.address}<br/>
              ${location.city}, ${location.state} ${location.zip}
            </span>
          </div>`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([location.coordinates.lng, location.coordinates.lat])
          .setPopup(popup)
          .addTo(map.current!);

        fedexMarkersRef.current.push(marker);
      });
    }
  }, [filteredFedexLocations, showFedex, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading map data...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Header */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-10">
        <h1 className="text-2xl font-bold mb-2">
          FedEx vs Circle K Distribution Network
        </h1>
        <p className="text-sm text-gray-600">
          Comparing FedEx Ground locations with Circle K convenience stores
        </p>
      </div>

      {/* Search Panel */}
      <div className="absolute top-32 left-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-10">
        <h2 className="font-bold mb-3">Search Location</h2>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter city, state, or zip code..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Search
            </button>
          </div>
          {searchCenter && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">
                Radius:
                <input
                  type="number"
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(Number(e.target.value))}
                  min="10"
                  max="500"
                  step="10"
                  className="ml-2 w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <span className="ml-1">miles</span>
              </label>
              <button
                onClick={handleClearSearch}
                className="ml-auto px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          )}
          {searchCenter && (
            <p className="text-xs text-gray-500">
              Showing locations within {radiusMiles} miles of search area
            </p>
          )}
        </div>
      </div>

      {/* Controls Panel */}
      <div className="absolute top-4 right-16 bg-white rounded-lg shadow-lg p-4 z-10">
        <h2 className="font-bold mb-3">Layer Controls</h2>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCircleK}
              onChange={(e) => setShowCircleK(e.target.checked)}
              className="w-4 h-4 accent-[#EC6707]"
            />
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: '#EC6707' }}
              />
              <span className="text-sm">
                Circle K {searchCenter && `(${filteredCircleKStores.length.toLocaleString()})`}
              </span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showFedex}
              onChange={(e) => setShowFedex(e.target.checked)}
              className="w-4 h-4 accent-[#4D148C]"
            />
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: '#4D148C' }}
              />
              <span className="text-sm">
                FedEx Ground {searchCenter && `(${filteredFedexLocations.length.toLocaleString()})`}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10">
        <h3 className="font-bold mb-2 text-sm">Legend</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: '#EC6707' }}
            />
            <span>Circle K Store</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: '#4D148C' }}
            />
            <span>FedEx Ground</span>
          </div>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 z-10 max-w-xs">
        <h3 className="font-bold mb-2">Network Statistics</h3>
        {!searchCenter ? (
          <div className="text-sm text-gray-500 italic">
            Search for a location to view network statistics
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Circle K Locations:</span>
              <span className="font-semibold">
                {filteredCircleKStores.length.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">FedEx Ground:</span>
              <span className="font-semibold">
                {filteredFedexLocations.length.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-gray-600">Total Locations:</span>
              <span className="font-semibold">
                {(filteredCircleKStores.length + filteredFedexLocations.length).toLocaleString()}
              </span>
            </div>
            <div className="pt-2 border-t text-xs text-gray-500">
              Within {radiusMiles} miles of search area
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
