"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

// Equirectangular projection + shoelace. Accurate to ~0.1% for farm-scale polygons.
function polygonAreaM2(feat: GeoJSON.Feature<GeoJSON.Polygon>): number {
  const ring = feat.geometry.coordinates[0];
  if (!ring || ring.length < 3) return 0;
  const pts = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
  const latRef = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const mPerDegLat = 110574;
  const mPerDegLon = 111320 * Math.cos((latRef * Math.PI) / 180);
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [lon1, lat1] = pts[i];
    const [lon2, lat2] = pts[(i + 1) % pts.length];
    const x1 = lon1 * mPerDegLon, y1 = lat1 * mPerDegLat;
    const x2 = lon2 * mPerDegLon, y2 = lat2 * mPerDegLat;
    acc += x1 * y2 - x2 * y1;
  }
  return Math.abs(acc) / 2;
}

interface OnboardingMapProps {
  onPolygonChange: (feature: GeoJSON.Feature<GeoJSON.Polygon> | null, areaHectares: number) => void;
  initialPolygon?: GeoJSON.Feature<GeoJSON.Polygon> | null;
  readOnly?: boolean;
  center?: [number, number];
  height?: string;
}

export default function OnboardingMap({
  onPolygonChange,
  initialPolygon = null,
  readOnly = false,
  center = [-93.65, 42.03],
  height = "500px",
}: OnboardingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    mapboxgl.accessToken = token;

    const initialCenter: [number, number] = initialPolygon
      ? polygonCentroid(initialPolygon)
      : center;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: initialCenter,
      zoom: initialPolygon ? 15 : 4,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (readOnly && initialPolygon) {
        map.addSource("field", { type: "geojson", data: initialPolygon });
        map.addLayer({
          id: "field-fill",
          type: "fill",
          source: "field",
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.35 },
        });
        map.addLayer({
          id: "field-line",
          type: "line",
          source: "field",
          paint: { "line-color": "#15803d", "line-width": 2 },
        });
        map.fitBounds(polygonBounds(initialPolygon), { padding: 40, animate: false });
        return;
      }

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: "draw_polygon",
      });
      drawRef.current = draw;
      map.addControl(draw);

      if (initialPolygon) {
        draw.add(initialPolygon);
      }

      const emit = () => {
        const fc = draw.getAll();
        if (!fc.features.length) {
          onPolygonChange(null, 0);
          return;
        }
        const feat = fc.features[0] as GeoJSON.Feature<GeoJSON.Polygon>;
        const hectares = polygonAreaM2(feat) / 10_000;
        onPolygonChange(feat, hectares);
      };

      map.on("draw.create", emit);
      map.on("draw.update", emit);
      map.on("draw.delete", () => onPolygonChange(null, 0));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // effect runs once on mount; props captured in closure intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-gray-200"
      style={{ height }}
    />
  );
}

function polygonCentroid(feat: GeoJSON.Feature<GeoJSON.Polygon>): [number, number] {
  const ring = feat.geometry.coordinates[0];
  const pts = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lon, lat];
}

function polygonBounds(feat: GeoJSON.Feature<GeoJSON.Polygon>): mapboxgl.LngLatBoundsLike {
  const ring = feat.geometry.coordinates[0];
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
