'use client';

import { useEffect, useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { parseFedexKML, FedexLocation } from '@/lib/kml-parser';

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
  const [fedexLocations, setFedexLocations] = useState<FedexLocation[]>([]);
  const [showCircleK, setShowCircleK] = useState(true);
  const [showFedex, setShowFedex] = useState(true);
  const [loading, setLoading] = useState(true);
  const circleKMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const fedexMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const { loadStoreData, getAllStores: getStores } = await import('@/lib/stores');

        // Load store data first
        await loadStoreData();

        const [stores, fedex] = await Promise.all([
          Promise.resolve(getStores()),
          parseFedexKML(),
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
      style: 'mapbox://styles/mapbox/light-v11',
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
      circleKStores.forEach((store) => {
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
  }, [circleKStores, showCircleK, loading]);

  // Add FedEx markers
  useEffect(() => {
    if (!map.current || loading) return;

    // Remove existing markers
    fedexMarkersRef.current.forEach((marker) => marker.remove());
    fedexMarkersRef.current = [];

    if (showFedex) {
      fedexLocations.forEach((location) => {
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
            <strong style="color: #4D148C;">FedEx ${location.category}</strong><br/>
            ${location.name}
          </div>`
        );

        const marker = new mapboxgl.Marker(el)
          .setLngLat([location.coordinates.lng, location.coordinates.lat])
          .setPopup(popup)
          .addTo(map.current!);

        fedexMarkersRef.current.push(marker);
      });
    }
  }, [fedexLocations, showFedex, loading]);

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
          Comparing FedEx distribution locations with Circle K convenience stores
        </p>
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
                Circle K ({circleKStores.length.toLocaleString()})
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
                FedEx ({fedexLocations.length.toLocaleString()})
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
            <span>FedEx Distribution</span>
          </div>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 z-10 max-w-xs">
        <h3 className="font-bold mb-2">Network Statistics</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Circle K Locations:</span>
            <span className="font-semibold">{circleKStores.length.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">FedEx Locations:</span>
            <span className="font-semibold">{fedexLocations.length.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pt-2 border-t">
            <span className="text-gray-600">Total Locations:</span>
            <span className="font-semibold">
              {(circleKStores.length + fedexLocations.length).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
