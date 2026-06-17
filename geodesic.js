/**
 * Geodesic path calculations using Great Circle interpolation.
 */

/**
 * Converts degrees to radians.
 * @param {number} deg 
 * @returns {number}
 */
function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 * @param {number} rad 
 * @returns {number}
 */
function toDegrees(rad) {
    return (rad * 180) / Math.PI;
}

/**
 * Calculates the angular distance (in radians) between two coordinates.
 * @param {number} lat1 
 * @param {number} lng1 
 * @param {number} lat2 
 * @param {number} lng2 
 * @returns {number}
 */
function getAngularDistance(lat1, lng1, lat2, lng2) {
    const phi1 = toRadians(lat1);
    const lambda1 = toRadians(lng1);
    const phi2 = toRadians(lat2);
    const lambda2 = toRadians(lng2);

    const deltaPhi = phi2 - phi1;
    const deltaLambda = lambda2 - lambda1;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Interpolates a point along the great circle path between two points.
 * @param {number} lat1 Start latitude (degrees)
 * @param {number} lng1 Start longitude (degrees)
 * @param {number} lat2 End latitude (degrees)
 * @param {number} lng2 End longitude (degrees)
 * @param {number} f Fraction of the path (0 = start, 1 = end)
 * @returns {{lat: number, lng: number}}
 */
function interpolateGeodesic(lat1, lng1, lat2, lng2, f) {
    if (lat1 === lat2 && lng1 === lng2) {
        return { lat: lat1, lng: lng1 };
    }

    const phi1 = toRadians(lat1);
    const lambda1 = toRadians(lng1);
    const phi2 = toRadians(lat2);
    const lambda2 = toRadians(lng2);

    const d = getAngularDistance(lat1, lng1, lat2, lng2);

    if (d < 1e-6) {
        return { lat: lat1, lng: lng1 };
    }

    const sinD = Math.sin(d);
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;

    const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
    const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lng = toDegrees(Math.atan2(y, x));

    lng = ((lng + 540) % 360) - 180;

    return { lat, lng };
}

/**
 * Generates an array of lat/lng coordinates representing a geodesic path.
 * @param {number} lat1 
 * @param {number} lng1 
 * @param {number} lat2 
 * @param {number} lng2 
 * @param {number} numSegments 
 * @returns {Array<{lat: number, lng: number}>}
 */
function generateGeodesicPath(lat1, lng1, lat2, lng2, numSegments = 100) {
    const points = [];
    for (let i = 0; i <= numSegments; i++) {
        const f = i / numSegments;
        points.push(interpolateGeodesic(lat1, lng1, lat2, lng2, f));
    }
    return points;
}

/**
 * Calculates initial bearing (heading) from point 1 to point 2.
 * @param {number} lat1 
 * @param {number} lng1 
 * @param {number} lat2 
 * @param {number} lng2 
 * @returns {number} Bearing in degrees (0 = North, clockwise)
 */
function getBearing(lat1, lng1, lat2, lng2) {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaLambda = toRadians(lng2 - lng1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    
    let theta = Math.atan2(y, x);
    return (toDegrees(theta) + 360) % 360;
}
