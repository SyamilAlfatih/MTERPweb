import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Building2, Package, Layers } from 'lucide-react';
import { Warehouse, Tool } from '../../types';

interface ToolsMapViewProps {
  warehouses: Warehouse[];
  tools: Tool[];
  onSelectWarehouseFilter: (whName: string) => void;
}

export default function ToolsMapView({
  warehouses,
  tools,
  onSelectWarehouseFilter,
}: ToolsMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Fix leaflet default marker icons in bundlers
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    // Default center: Head Office PT Mega Tama Enerco (-7.175077, 107.570899)
    const initialLat = warehouses[0]?.geo?.lat || -7.175077420272807;
    const initialLng = warehouses[0]?.geo?.lng || 107.57089981757514;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        scrollWheelZoom: true,
      });

      // CartoDB Positron / OSM Tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear previous markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    // Add warehouse markers
    warehouses.forEach((wh) => {
      if (!wh.geo || wh.geo.lat === undefined || wh.geo.lng === undefined) return;

      const latLng: [number, number] = [wh.geo.lat, wh.geo.lng];
      bounds.extend(latLng);

      // Custom marker icon HTML
      const isHq = wh.isDefault || wh.type === 'head_office';
      const bgColor = isHq ? '#06B6D4' : wh.type === 'workshop' ? '#F59E0B' : '#3B82F6';

      const customIcon = L.divIcon({
        className: 'custom-warehouse-marker',
        html: `
          <div style="
            background-color: ${bgColor};
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 13px;
          ">
            ${isHq ? 'HQ' : wh.code ? wh.code.substring(0, 3) : 'WH'}
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker(latLng, { icon: customIcon }).addTo(map);

      // Geofence circle
      if (wh.geo.radiusMeters) {
        L.circle(latLng, {
          radius: wh.geo.radiusMeters,
          color: bgColor,
          fillColor: bgColor,
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(map);
      }

      // Count tools in this warehouse
      const toolCount = tools.filter((t) => {
        if (typeof t.warehouseId === 'object' && t.warehouseId) {
          return t.warehouseId._id === wh._id;
        }
        return (t.lokasi || '').toLowerCase().includes(wh.name.toLowerCase());
      }).length;

      // Popup
      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; padding: 2px;">
          <div style="font-weight: bold; font-size: 13px; color: #0F172A; margin-bottom: 2px;">
            ${wh.name}
          </div>
          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <span style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">
              ${wh.code}
            </span>
            ${
              isHq
                ? '<span style="background: #CFFAFE; color: #0891B2; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">HEAD OFFICE</span>'
                : ''
            }
          </div>
          <div style="color: #64748B; font-size: 11px; margin-bottom: 8px;">
            ${wh.address || 'Alat Tersimpan di Lokasi Ini'}
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
            <strong style="color: #0F172A;">${toolCount} Alat</strong> terdaftar di fasilitas ini
          </div>
          <button
            id="filter-wh-${wh._id}"
            style="
              width: 100%;
              background: #0284C7;
              color: white;
              border: none;
              border-radius: 6px;
              padding: 5px 8px;
              font-weight: bold;
              font-size: 11px;
              cursor: pointer;
            "
          >
            Tampilkan Alat di Gudang Ini
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`filter-wh-${wh._id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectWarehouseFilter(wh.name);
          };
        }
      });
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    return () => {
      // Map cleanup
    };
  }, [warehouses, tools, onSelectWarehouseFilter]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-900">
      {/* Map Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 min-w-0">
          <MapPin size={16} className="text-cyan-500 shrink-0" />
          <span className="truncate">Pemetaan Geografis Alat (GPS & Geofence)</span>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar text-slate-500 dark:text-slate-400 text-[11px] pb-0.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
            <span>Head Office</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Gudang Proyek</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Workshop</span>
          </div>
        </div>
      </div>

      {/* Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-[320px] sm:h-[440px] z-10" />
    </div>
  );
}
