/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { LocationCoords } from "../types/global";

/**
 * Sanitized location coordinates with normalized values for API transmission
 */
export interface SanitizedCoords {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
  battery?: number;
  batteryStatus: number;
}

/** Earth's radius in meters */
const EARTH_RADIUS_METERS = 6371e3;

/** Valid latitude range */
const VALID_LATITUDE = { min: -90, max: 90 } as const;

/** Valid longitude range */
const VALID_LONGITUDE = { min: -180, max: 180 } as const;

/**
 * Sanitizes and normalizes location coordinates for API transmission.
 *
 * - Preserves lat/lon precision
 * - Rounds altitude, accuracy, speed to integers
 * - Normalizes battery status to 0 or 1
 * - Provides safe defaults for missing values
 *
 * @param coords Raw location coordinates from device
 * @returns Sanitized coordinates ready for transmission
 *
 * @example
 * ```ts
 * const raw = { latitude: 40.712776, longitude: -74.005974, altitude: 10.234 };
 * const clean = sanitizeCoords(raw);
 * // { latitude: 40.712776, longitude: -74.005974, altitude: 10, ... }
 * ```
 */
export function sanitizeCoords(coords: LocationCoords): SanitizedCoords {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitude: Math.round(coords.altitude ?? 0),
    accuracy: Math.round(coords.accuracy ?? 0),
    speed: Math.round(coords.speed ?? 0),
    battery:
      coords.battery !== undefined ? Math.round(coords.battery) : undefined,
    batteryStatus: coords.battery_status ?? 0,
  };
}

/**
 * Validates that coordinates are within valid geographic ranges.
 *
 * Checks:
 * - Latitude: -90 to 90
 * - Longitude: -180 to 180
 * - No NaN or Infinity values
 *
 * @param coords Coordinates to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```ts
 * if (isValidCoordinates(coords)) {
 *   await sendToServer(coords);
 * }
 * ```
 */
export function isValidCoordinates(coords: LocationCoords): boolean {
  const { latitude, longitude } = coords;

  return (
    // Check latitude range
    latitude >= VALID_LATITUDE.min &&
    latitude <= VALID_LATITUDE.max &&
    // Check longitude range
    longitude >= VALID_LONGITUDE.min &&
    longitude <= VALID_LONGITUDE.max &&
    // Check for valid numbers
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/**
 * Calculates distance between two points using Haversine formula.
 *
 * @param coord1 First coordinate point
 * @param coord2 Second coordinate point
 * @returns Distance in meters
 *
 * @example
 * ```ts
 * const pointA = { latitude: 40.7128, longitude: -74.0060 };
 * const pointB = { latitude: 40.7589, longitude: -73.9851 };
 * const distance = calculateDistance(pointA, pointB); // ~5820 meters
 * ```
 */
export function calculateDistance(
  coord1: LocationCoords,
  coord2: LocationCoords
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const φ1 = toRadians(coord1.latitude);
  const φ2 = toRadians(coord2.latitude);
  const Δφ = toRadians(coord2.latitude - coord1.latitude);
  const Δλ = toRadians(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Formats coordinates as a human-readable string.
 *
 * @param coords Coordinates to format
 * @param precision Number of decimal places (default: 6)
 * @returns Formatted coordinate string
 *
 * @example
 * ```ts
 * formatCoordinates({ latitude: 40.712776, longitude: -74.005974 });
 * // "40.712776, -74.005974"
 *
 * formatCoordinates({ latitude: 40.712776, longitude: -74.005974 }, 3);
 * // "40.713, -74.006"
 * ```
 */
export function formatCoordinates(
  coords: LocationCoords,
  precision: number = 6
): string {
  return `${coords.latitude.toFixed(precision)}, ${coords.longitude.toFixed(
    precision
  )}`;
}

/**
 * Checks if two coordinate points are approximately equal within a threshold.
 *
 * @param coord1 First coordinate point
 * @param coord2 Second coordinate point
 * @param thresholdMeters Distance threshold in meters (default: 10)
 * @returns True if coordinates are within threshold
 *
 * @example
 * ```ts
 * const pointA = { latitude: 40.7128, longitude: -74.0060 };
 * const pointB = { latitude: 40.7129, longitude: -74.0061 };
 * const isNear = areCoordinatesNear(pointA, pointB, 20); // true
 * ```
 */
export function areCoordinatesNear(
  coord1: LocationCoords,
  coord2: LocationCoords,
  thresholdMeters: number = 10
): boolean {
  const distance = calculateDistance(coord1, coord2);
  return distance <= thresholdMeters;
}

/**
 * Converts degrees to radians
 *
 * @param degrees Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 *
 * @param radians Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
