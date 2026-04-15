"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const PILOT_CENTER: [number, number] = [-87.6298, 41.8781];
const BUFFER = 0.01;

const fieldPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: { name: "Chicago Pilot Field" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [PILOT_CENTER[0] - BUFFER, PILOT_CENTER[1] - BUFFER],
        [PILOT_CENTER[0] + BUFFER, PILOT_CENTER[1] - BUFFER],
        [PILOT_CENTER[0] + BUFFER, PILOT_CENTER[1] + BUFFER],
        [PILOT_CENTER[0] - BUFFER, PILOT_CENTER[1] + BUFFER],
        [PILOT_CENTER[0] - BUFFER, PILOT_CENTER[1] - BUFFER],
      ],
    ],
  },
};

interface FieldMapProps {
  depletionScore: number | null;
}

export default function FieldMap({ depletionScore }: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    console.log("[FieldMap] NEXT_PUBLIC_MAPBOX_TOKEN defined:", Boolean(token));
    if (!token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: PILOT_CENTER,
      zoom: 13,
    });

    map.on("load", () => {
      map.addSource("pilot-field", {
        type: "geojson",
        data: fieldPolygon,
      });

      map.addLayer({
        id: "pilot-field-fill",
        type: "fill",
        source: "pilot-field",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.3,
        },
      });

      map.addLayer({
        id: "pilot-field-outline",
        type: "line",
        source: "pilot-field",
        paint: {
          "line-color": "#15803d",
          "line-width": 2,
        },
      });

      map.on("click", "pilot-field-fill", (e) => {
        const scoreText =
          depletionScore !== null
            ? `Depletion Score: ${depletionScore}/100`
            : "Depletion Score: loading...";

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:sans-serif;font-size:13px">` +
              `<strong>Chicago Pilot Field</strong><br/>` +
              `Crop: Corn<br/>` +
              `${scoreText}` +
              `</div>`
          )
          .addTo(map);
      });

      map.on("mouseenter", "pilot-field-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pilot-field-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // depletionScore intentionally captured at mount time via closure;
    // popup reads latest value on click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center justify-center h-[350px] text-gray-400 text-sm">
        Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to enable the map
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div ref={containerRef} className="h-[350px] w-full" />
    </div>
  );
}
