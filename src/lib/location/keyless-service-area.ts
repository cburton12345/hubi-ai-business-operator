export type ServiceAreaTarget = {
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
};

export type ServiceLocation = {
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizePostalCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function haversineMiles(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusMiles = 3958.7613;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function evaluateServiceAreaFit(target: ServiceAreaTarget, location: ServiceLocation) {
  const targetPostal = normalizePostalCode(target.postalCode);
  const locationPostal = normalizePostalCode(location.postalCode);
  if (targetPostal && locationPostal && targetPostal === locationPostal) {
    return { matched: true, method: "postal_code" as const, distanceMiles: 0 };
  }

  const sameCity =
    normalized(target.city) &&
    normalized(target.state) &&
    normalized(target.city) === normalized(location.city) &&
    normalized(target.state) === normalized(location.state);
  if (sameCity) {
    return { matched: true, method: "city_state" as const, distanceMiles: null };
  }

  if (
    Number.isFinite(target.latitude) &&
    Number.isFinite(target.longitude) &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    const distanceMiles = haversineMiles(
      { latitude: Number(target.latitude), longitude: Number(target.longitude) },
      { latitude: Number(location.latitude), longitude: Number(location.longitude) }
    );
    return {
      matched: distanceMiles <= Math.max(1, Number(target.radiusMiles ?? 25)),
      method: "radius" as const,
      distanceMiles
    };
  }

  return { matched: false, method: "insufficient_location" as const, distanceMiles: null };
}

export function keylessRouteClusterKey(location: ServiceLocation) {
  const postal = normalizePostalCode(location.postalCode);
  if (postal) return `1:${postal}`;
  const state = normalized(location.state);
  const city = normalized(location.city);
  if (state || city) return `2:${state}:${city}`;
  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return `3:${Number(location.latitude).toFixed(2)}:${Number(location.longitude).toFixed(2)}`;
  }
  return "9:unknown";
}
