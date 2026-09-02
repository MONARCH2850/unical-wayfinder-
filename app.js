const campus = [5.0363, 8.3362];
let isAccessibilityModeActive = false;
const navigationPreferences = {
  wheelchair: false,
  stepFree: false,
  audio: false,
  vibration: false
};
try {
  Object.assign(navigationPreferences, JSON.parse(localStorage.getItem('unical_navigation_preferences') || '{}'));
} catch {
}
function announceToScreenReader(message) { const announcer = document.getElementById('screen-reader-announcer'); if (announcer) announcer.textContent = message; }
function speakCue(text) { if (!window.speechSynthesis || (!navigationPreferences.audio && !isAccessibilityModeActive && !arState.active)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 1; utterance.pitch = 1; window.speechSynthesis.speak(utterance); }
function announceForA11y(text) { const announce = document.getElementById('a11yAnnounce'); if (announce) announce.textContent = text; announceToScreenReader(text); }
function triggerVibration(type) {
  if (!navigator.vibrate) return;
  let pattern;
  if (type === 'tap') pattern = 100;
  else if (type === 'success') pattern = [200, 100, 200];
  else if (type === 'error') pattern = [400, 100, 400];
  else if (type === 'arrival') pattern = [200, 80, 180, 80, 260];
  else if (type === 'turn') pattern = [120, 40, 120];
  else pattern = 100;

  if (navigationPreferences.vibration || isAccessibilityModeActive || type === 'arrival' || type === 'turn') navigator.vibrate(pattern);
}
function setNavigationPreference(name, enabled) {
  navigationPreferences[name] = enabled;
  if (name === 'wheelchair') navigationPreferences.stepFree = enabled || navigationPreferences.stepFree;
  if (name === 'stepFree') navigationPreferences.wheelchair = enabled || navigationPreferences.wheelchair;
  renderPathways();
  if (selectedPlace) {
    routeLayer.clearLayers();
    calculateRoute(selectedPlace);
  }
  localStorage.setItem('unical_navigation_preferences', JSON.stringify(navigationPreferences));
  announceForA11y(`${name} ${enabled ? 'enabled' : 'disabled'}`);
}
function toggleAccessibilityMode() {
  isAccessibilityModeActive = !isAccessibilityModeActive;
  const button = document.getElementById('accessibility-toggle-btn');
  if (!button) return;

  button.setAttribute('aria-pressed', String(isAccessibilityModeActive));
  button.style.background = isAccessibilityModeActive ? '#28a745' : '#1b3d36';
  button.style.boxShadow = isAccessibilityModeActive ? '0 0 0 3px rgba(40, 167, 69, 0.35), 0 6px 14px rgba(40, 167, 69, 0.2)' : '0 4px 10px rgba(0,0,0,.12)';
  button.style.transform = isAccessibilityModeActive ? 'scale(1.03)' : 'scale(1)';

  const message = isAccessibilityModeActive ? 'Visually impaired accessibility mode activated' : 'Accessibility mode turned off';
  triggerVibration('tap');
  announceToScreenReader(message);
  speakCue(message);
}
const arState = {
  active: false,
  stream: null,
  track: null,
  lastHeading: 0,
  lastAnnouncementDistance: Number.POSITIVE_INFINITY,
  lastAnnouncementAt: 0,
  fallbackMode: false
};
function isSecureForDeviceAPIs() {
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
function getCurrentTarget() {
  if (selectedPlace) return selectedPlace;
  if (window.UNICAL_ROUTE_TARGET) return window.UNICAL_ROUTE_TARGET;
  return null;
}
function calculateDistanceMeters(start, end) {
  if (!start || !end) return Number.POSITIVE_INFINITY;
  const lat1 = start[0] * Math.PI / 180;
  const lat2 = end[0] * Math.PI / 180;
  const deltaLat = (end[0] - start[0]) * Math.PI / 180;
  const deltaLng = (end[1] - start[1]) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}
function calculateBearingDegrees(from, to) {
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const dLng = (to[1] - from[1]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function getDirectionalCue(distanceMeters, relativeAngle) {
  if (distanceMeters < 12) return { text: 'You have arrived at your destination.', mode: 'arrival' };
  if (relativeAngle < -40) return { text: 'Turn slightly left.', mode: 'turn' };
  if (relativeAngle > 40) return { text: 'Turn slightly right.', mode: 'turn' };
  if (relativeAngle < -90) return { text: 'Turn left toward the destination.', mode: 'turn' };
  if (relativeAngle > 90) return { text: 'Turn right toward the destination.', mode: 'turn' };
  return { text: 'Continue straight ahead.', mode: 'turn' };
}
function updateARTargetDisplay() {
  const target = getCurrentTarget();
  const nameEl = document.getElementById('arTargetName');
  const distanceEl = document.getElementById('arTargetDistance');
  if (!nameEl || !distanceEl) return;

  if (!target) {
    nameEl.textContent = 'Select a destination';
    distanceEl.textContent = '0 m away';
    return;
  }

  const origin = currentCoords || campus;
  const distance = Math.round(calculateDistanceMeters(origin, target.coords));
  nameEl.textContent = target.name;
  distanceEl.textContent = `${distance} m away`;

  if (!arState.active || !window.deviceorientation) return;

  const heading = arState.lastHeading || 0;
  const bearing = calculateBearingDegrees(origin, target.coords);
  const relative = ((bearing - heading) + 540) % 360 - 180;
  const arrow = document.getElementById('arDirectionArrow');
  if (arrow) arrow.style.transform = `rotate(${relative}deg)`;
  const arArrowEntity = document.getElementById('arArrowEntity');
  if (arArrowEntity) arArrowEntity.setAttribute('rotation', `0 ${relative} 0`);

  const cue = getDirectionalCue(distance, relative);
  const now = Date.now();
  if (distance < 30 && distance !== arState.lastAnnouncementDistance && now - arState.lastAnnouncementAt > 5000) {
    arState.lastAnnouncementDistance = distance;
    arState.lastAnnouncementAt = now;
    if (cue.text) {
      announceForA11y(cue.text);
      speakCue(cue.text);
      triggerVibration(cue.mode);
    }
  }
}
function exitWebARView() {
  const video = document.getElementById('ar-video-feed');
  const arContainer = document.getElementById('ar-view-container');
  const mapContainer = document.getElementById('map');
  if (arState.track) {
    arState.track.stop();
    arState.track = null;
  }
  if (arState.stream) {
    arState.stream.getTracks().forEach((track) => track.stop());
    arState.stream = null;
  }
  if (video) video.srcObject = null;
  if (arContainer) arContainer.hidden = true;
  if (mapContainer) mapContainer.style.display = 'block';
  arState.active = false;
  arState.lastAnnouncementDistance = Number.POSITIVE_INFINITY;
}
async function startWebARGuidance() {
  const video = document.getElementById('ar-video-feed');
  const arContainer = document.getElementById('ar-view-container');
  const mapContainer = document.getElementById('map');

  if (!isSecureForDeviceAPIs()) {
    const message = 'Web-AR requires HTTPS or localhost. Switching back to the 2D map.';
    showToast(message);
    announceForA11y(message);
    speakCue(message);
    return;
  }

  const target = getCurrentTarget();
  if (!target) {
    const message = 'Choose a destination to begin camera guidance.';
    showToast(message);
    announceForA11y(message);
    speakCue(message);
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const message = 'This browser does not support camera access. Returning to the 2D map.';
    showToast(message);
    announceForA11y(message);
    speakCue(message);
    return;
  }

  const requestCamera = async (constraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    arState.stream = stream;
    arState.track = stream.getVideoTracks()[0];
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
    arState.active = true;
    if (arContainer) arContainer.hidden = false;
    if (mapContainer) mapContainer.style.display = 'none';
    updateARTargetDisplay();
    return true;
  };

  try {
    await requestCamera({ video: { facingMode: { exact: 'environment' } } });
    announceForA11y(`Camera guidance active for ${target.name}`);
    speakCue(`Camera guidance to ${target.name}`);
    window.addEventListener('deviceorientation', (event) => {
      if (!arState.active) return;
      const heading = typeof event.webkitCompassHeading === 'number'
        ? event.webkitCompassHeading
        : (event.alpha !== null && event.alpha !== undefined ? 360 - event.alpha : arState.lastHeading || 0);
      arState.lastHeading = heading;
      updateARTargetDisplay();
    }, true);
  } catch (environmentError) {
    try {
      await requestCamera({ video: { facingMode: 'user' } });
      arState.fallbackMode = true;
      announceForA11y('Environmental camera unavailable. Using the standard camera view instead.');
      showToast('Rear camera unavailable. Standard camera view enabled.');
    } catch (fallbackError) {
      try {
        await requestCamera({ video: true });
        arState.fallbackMode = true;
        announceForA11y('Camera fallback enabled. Returning to map view if camera access is denied.');
        showToast('AR camera access unavailable. Switching to 2D map mode.');
      } catch (error) {
        const message = 'Web-AR camera was denied. Switching to 2D map mode.';
        showToast(message);
        announceForA11y(message);
        speakCue(message);
        exitWebARView();
      }
    }
  }
}
const unicalCampusOnlyBounds = L.latLngBounds(
  L.latLng(4.9360, 8.3360),
  L.latLng(4.9620, 8.3580)
);
let installPrompt;
let places = [];
const SAVED_PLACES_KEY = 'unical_places';
function getStoredPlaces() {
  try {
    const stored = localStorage.getItem(SAVED_PLACES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistPlaces() {
  localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(places.map((place) => ({
    name: place.name,
    lat: Number(place.coords[0]),
    lng: Number(place.coords[1])
  }))));
}
function buildSavedPlace(name, lat, lng, type = 'Saved • custom', description = '') {
  return {
    name,
    type,
    description,
    coords: [Number(lat), Number(lng)]
  };
}
function addPlaceMarker(place) {
  place.marker = L.marker(place.coords, { icon: pinIcon }).addTo(markerLayer).bindTooltip(place.name, {
    direction: 'top',
    offset: [0, -8]
  });
}
function renderSavedPlacesFromStorage() {
  const saved = getStoredPlaces();
  const placeListEl = document.getElementById('placeList');
  if (!placeListEl) return;

  places = [];
  placeListEl.innerHTML = '';
  saved.forEach((entry) => {
    const place = buildSavedPlace(entry.name, entry.lat, entry.lng, 'Saved • custom', '');
    places.push(place);
    addPlaceMarker(place);
    addPlaceButton(place);
  });

  if (!places.length) renderEmptyPlaceState();
  document.getElementById('placeCount').textContent = `${String(document.querySelectorAll('.place-item').length).padStart(2, '0')} PLACES`;
}
document.addEventListener('DOMContentLoaded', renderSavedPlacesFromStorage);
let currentCoords;
let selectedPlace;
let navigationWatchId = null;
const map = L.map('map', {
  zoomControl: false,
  center: [4.9510, 8.3450],
  zoom: 16,
  minZoom: 16,
  maxZoom: 19,
  maxBounds: unicalCampusOnlyBounds,
  maxBoundsViscosity: 1.0
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; document.getElementById('installButton').hidden = false; });
document.getElementById('installButton').addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; document.getElementById('installButton').hidden = true; });
window.addEventListener('appinstalled', () => { document.getElementById('installButton').hidden = true; });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  bounds: unicalCampusOnlyBounds
}).addTo(map);
const unicalCampusPolygon = [
  [4.9360, 8.3360],
  [4.9440, 8.3360],
  [4.9520, 8.3390],
  [4.9620, 8.3470],
  [4.9620, 8.3580],
  [4.9510, 8.3580],
  [4.9430, 8.3530],
  [4.9360, 8.3470],
  [4.9360, 8.3360]
];
const worldMask = [
  [-85.0511, -180],
  [-85.0511, 180],
  [85.0511, 180],
  [85.0511, -180],
  [-85.0511, -180]
];
L.geoJSON({
  type: 'Feature',
  properties: { name: 'UNICAL campus focus mask' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      worldMask.map(([latitude, longitude]) => [longitude, latitude]),
      unicalCampusPolygon.map(([latitude, longitude]) => [longitude, latitude])
    ]
  }
}, { fillColor: '#000000', fillOpacity: 0.6, stroke: true, color: '#1e3d2f', weight: 2 }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const pinIcon = L.divIcon({ className: 'campus-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
places.forEach((place) => { place.marker = L.marker(place.coords, { icon: pinIcon }).addTo(markerLayer).bindTooltip(place.name, { direction: 'top', offset: [0, -8] }); });
const pathways = [
  { points: [[5.0347,8.3348],[5.0352,8.3360],[5.0355,8.3388],[5.0364,8.3393],[5.0392,8.3390]], className: 'main-path', stepFree: true },
  { points: [[5.0347,8.3348],[5.0334,8.3370],[5.0325,8.3391]], className: 'quiet-path', stepFree: false },
  { points: [[5.0364,8.3393],[5.0373,8.3375],[5.0382,8.3327]], className: 'main-path', stepFree: true },
  { points: [[5.0352,8.3360],[5.0368,8.3351],[5.0380,8.3355],[5.0392,8.3390]], className: 'quiet-path', stepFree: true }
];
const pathwayLayer = L.layerGroup().addTo(map);
function renderPathways() {
  pathwayLayer.clearLayers();
  pathways.forEach((path) => {
    if (navigationPreferences.stepFree && !path.stepFree) return;
    L.polyline(path.points, { color: path.stepFree ? '#55b779' : '#e47b56', weight: path.className === 'main-path' ? 5 : 3, opacity: .9, dashArray: path.className === 'quiet-path' ? '7 7' : null, lineCap: 'round' }).addTo(pathwayLayer);
  });
}
renderPathways();
const placeList = document.getElementById('placeList');
const routePanel = document.getElementById('routePanel');
const destinationInput = document.getElementById('destination');
const searchResults = document.getElementById('searchResults');
const routeTitle = document.getElementById('routeTitle');
const routeMeta = document.getElementById('routeMeta');
const toast = document.getElementById('locationToast');
['wheelchair', 'stepFree', 'audio', 'vibration'].forEach((name) => {
  const input = document.getElementById(`${name}Toggle`);
  if (input) input.checked = navigationPreferences[name];
  input?.addEventListener('change', () => setNavigationPreference(name, input.checked));
});
const showToast = (message) => { toast.textContent = message; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 3500); };
function selectPlace(place) { triggerVibration('tap'); selectedPlace = place; document.querySelectorAll('.place-item').forEach((item) => item.classList.toggle('active', item.dataset.name === place.name)); routeTitle.textContent = place.name; routeMeta.textContent = `${place.type.split(' · ')[0]} · calculating walking route...`; routePanel.hidden = false; routeLayer.clearLayers(); announceForA11y(`Selected destination: ${place.name}`); speakCue(`Route to ${place.name}`); map.flyTo(place.coords, 17, { duration: .7 }); calculateRoute(place); }
places.forEach((place) => { addPlaceButton(place); });
document.getElementById('placeCount').textContent = `${String(places.length).padStart(2, '0')} PLACES`;
destinationInput.addEventListener('input', () => { const query = destinationInput.value.toLowerCase().trim(); searchResults.innerHTML = ''; if (!query) return; const matches = places.filter((place) => `${place.name} ${place.type}`.toLowerCase().includes(query)); if (!matches.length) { const result = document.createElement('div'); result.className = 'search-result search-empty'; result.textContent = 'No places found'; searchResults.appendChild(result); return; } matches.forEach((place) => { const result = document.createElement('button'); result.type = 'button'; result.className = 'search-result'; result.textContent = place.name; result.addEventListener('click', () => { destinationInput.value = place.name; searchResults.innerHTML = ''; selectPlace(place); }); searchResults.appendChild(result); }); });
document.getElementById('clearRoute').addEventListener('click', () => { triggerVibration('tap'); routePanel.hidden = true; routeLayer.clearLayers(); document.querySelectorAll('.place-item').forEach((item) => item.classList.remove('active')); announceForA11y('Route cleared'); speakCue('Route cleared'); map.flyTo(campus, 16); selectedPlace = null; if (navigationWatchId !== null) { navigator.geolocation.clearWatch(navigationWatchId); navigationWatchId = null; } setNavigationButtonState(false); exitWebARView(); });
const startNavButton = document.getElementById('start-nav-btn') || document.getElementById('startRoute');
function setNavigationButtonState(isTracking) {
  if (!startNavButton) return;
  startNavButton.innerHTML = isTracking ? '🛑 Stop Navigation <span>▣</span>' : 'Start navigation <span>→</span>';
  startNavButton.setAttribute('aria-label', isTracking ? 'Stop navigation to destination' : 'Start navigation to destination');
}
function startInAppNavigation(targetLat, targetLng) {
  if (!navigator.geolocation) {
    showToast('Location is not supported by this browser.');
    return;
  }

  if (navigationWatchId !== null) {
    navigator.geolocation.clearWatch(navigationWatchId);
    navigationWatchId = null;
    setNavigationButtonState(false);
    showToast('Navigation stopped.');
    announceForA11y('Navigation stopped');
    speakCue('Navigation stopped');
    return;
  }

  if (selectedPlace) {
    announceForA11y(`Starting navigation to ${selectedPlace.name}`);
    speakCue(`Starting navigation to ${selectedPlace.name}`);
  }

  triggerVibration('success');
  setNavigationButtonState(true);

  const updateTrackingPosition = (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    currentCoords = [lat, lng];
    updateCurrentLocation({ coords: { latitude: lat, longitude: lng } }, false);
    map.panTo([lat, lng], { animate: true, duration: 0.75 });
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'In-app navigation active';
    if (selectedPlace) {
      const destination = [Number(targetLat), Number(targetLng)];
      const distanceMeters = calculateDistanceMeters([lat, lng], destination);
      const direction = calculateBearingDegrees([lat, lng], destination);
      const heading = arState.lastHeading || 0;
      const relative = ((direction - heading) + 540) % 360 - 180;
      const cue = getDirectionalCue(distanceMeters, relative);
      routeMeta.textContent = `Tracking route · ${Math.max(1, Math.round(distanceMeters / 35))} min to destination`;
      if (distanceMeters < 18) {
        announceForA11y('You have arrived at your destination.');
        speakCue('You have arrived at your destination.');
        triggerVibration('arrival');
      } else if (cue.mode === 'turn' && Math.abs(relative) > 28) {
        triggerVibration('turn');
        announceForA11y(cue.text);
        speakCue(cue.text);
      }
      updateARTargetDisplay();
    }
  };

  const handleTrackingError = (error) => {
    triggerVibration('error');
    const errorMessage = error && error.code === error.PERMISSION_DENIED
      ? 'Location permission denied while tracking your route.'
      : 'Unable to track your location. Please try again.';
    showToast(errorMessage);
    announceForA11y(errorMessage);
    speakCue(errorMessage);
    navigator.geolocation.clearWatch(navigationWatchId);
    navigationWatchId = null;
    setNavigationButtonState(false);
  };

  navigationWatchId = navigator.geolocation.watchPosition(updateTrackingPosition, handleTrackingError, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000
  });
}
startNavButton?.addEventListener('click', () => {
  if (!selectedPlace) return;
  startInAppNavigation(selectedPlace.coords[0], selectedPlace.coords[1]);
});
document.getElementById('zoomIn').addEventListener('click', () => { triggerVibration('tap'); map.zoomIn(); announceForA11y('Zoomed in'); }); document.getElementById('zoomOut').addEventListener('click', () => { triggerVibration('tap'); map.zoomOut(); announceForA11y('Zoomed out'); });
let userMarker;
function updateCurrentLocation(position, centerMap = true) { currentCoords = [position.coords.latitude, position.coords.longitude]; const coordinateLabel = document.getElementById('locationCoordinates'); if (userMarker) userMarker.setLatLng(currentCoords); else userMarker = L.marker(currentCoords, { icon: L.divIcon({ className: 'user-location-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map).bindTooltip('You are here'); if (centerMap) map.flyTo(currentCoords, 17); document.getElementById('statusText').textContent = 'Live location enabled'; if (coordinateLabel) coordinateLabel.textContent = `${currentCoords[0].toFixed(5)}° N · ${currentCoords[1].toFixed(5)}° E`; }
function requestLocation(centerMap = true) { if (!navigator.geolocation) return showToast('Location is not supported by this browser.'); announceForA11y('Requesting your location'); showToast('Requesting your location...'); navigator.geolocation.getCurrentPosition((position) => { updateCurrentLocation(position, centerMap); triggerVibration('success'); announceForA11y('Location found'); showToast('Your location is shown on the map.'); }, () => { triggerVibration('error'); announceForA11y('Location permission denied'); showToast('Location permission was not granted.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); }
document.getElementById('locateButton').addEventListener('click', () => { triggerVibration('tap'); requestLocation(); });
async function calculateRoute(place) {
  const origin = currentCoords || campus;
  const routeColor = navigationPreferences.stepFree || navigationPreferences.wheelchair ? '#55b779' : '#e47b56';
  const accessibilityQuery = navigationPreferences.stepFree || navigationPreferences.wheelchair ? '&accessibility_mode=step_free' : '';
  const apiBase = window.UNICAL_API_BASE || '';
  try {
    let response = apiBase ? await fetch(`${apiBase}/api/routes/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: origin, end: place.coords, accessibility_mode: navigationPreferences.stepFree || navigationPreferences.wheelchair ? 'step_free' : null }) }) : null;
    if (!response || !response.ok) {
      const url = `https://router.project-osrm.org/route/v1/foot/${origin[1]},${origin[0]};${place.coords[1]},${place.coords[0]}?overview=full&geometries=geojson${accessibilityQuery}`;
      response = await fetch(url);
    }
    if (!response.ok) throw new Error('route unavailable');
    const data = await response.json();
    const route = data.routes?.[0] || data;
    const routePoints = route.geometry?.coordinates?.map(([longitude, latitude]) => [latitude, longitude]) || route.coordinates;
    if (!routePoints?.length) throw new Error('route unavailable');
    L.polyline(routePoints, { color: routeColor, weight: 5, opacity: .95, lineCap: 'round' }).addTo(routeLayer);
    const distance = Number(route.distance || 0);
    const duration = Number(route.duration || route.total_time || 0);
    routeMeta.textContent = `${navigationPreferences.stepFree || navigationPreferences.wheelchair ? 'Step-free' : 'Walking'} route · ${Math.max(1, Math.round(duration / 60))} min · ${(distance / 1000).toFixed(1)} km`;
  } catch {
    const fallback = navigationPreferences.stepFree || navigationPreferences.wheelchair
      ? pathways.find((path) => path.stepFree)?.points || [origin, place.coords]
      : [origin, place.coords];
    L.polyline(fallback, { color: routeColor, weight: 4, dashArray: '4 8', opacity: .9 }).addTo(routeLayer);
    routeMeta.textContent = `${navigationPreferences.stepFree || navigationPreferences.wheelchair ? 'Step-free' : 'Walking'} route preview · route service unavailable`;
  }
}
const locationDialog = document.getElementById('locationDialog');
let pendingCoords;
let currentCapturedCoords;
function openLocationDialog(coords) { pendingCoords = coords; document.getElementById('locationCoordinates').textContent = `${coords[0].toFixed(5)}° N · ${coords[1].toFixed(5)}° E`; locationDialog.showModal(); }
function addLocationAtCurrentGPS() { const btn = document.getElementById('add-spot-btn'); const originalText = btn.innerHTML; btn.innerHTML = '<span>⏳</span> Acquiring GPS Location...'; btn.disabled = true; triggerVibration('tap'); speakCue('Acquiring GPS location'); announceForA11y('Acquiring your GPS location'); if (!navigator.geolocation) { const errMsg = 'Geolocation is not supported by this browser.'; alert(errMsg); triggerVibration('error'); speakCue(errMsg); announceForA11y(errMsg); btn.innerHTML = originalText; btn.disabled = false; return; } navigator.geolocation.getCurrentPosition((position) => { const coords = [position.coords.latitude, position.coords.longitude]; btn.innerHTML = originalText; btn.disabled = false; if (!unicalCampusOnlyBounds.contains(coords)) { const errMsg = 'You are outside UNICAL campus. Please move to campus before adding a location.'; alert(errMsg); triggerVibration('error'); speakCue(errMsg); announceForA11y(errMsg); return; } triggerVibration('success'); speakCue('Location acquired. Opening form'); announceForA11y('GPS location acquired. Ready to save'); createGPSPopupForm(coords); }, (error) => { btn.innerHTML = originalText; btn.disabled = false; let errorMsg = 'Unable to get your location.'; if (error.code === error.PERMISSION_DENIED) { errorMsg = 'Location permission denied. Please enable location access in your browser settings.'; } else if (error.code === error.POSITION_UNAVAILABLE) { errorMsg = 'GPS signal not available. Please check that your device has GPS enabled and is in an area with clear sky.'; } else if (error.code === error.TIMEOUT) { errorMsg = 'Location request timed out. Please try again in an area with better GPS signal.'; } alert(errorMsg); triggerVibration('error'); speakCue(errorMsg); announceForA11y(errorMsg); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); }
function createGPSPopupForm(coords) { currentCapturedCoords = coords; const popupContent = '<div style="width:200px"><p style="margin:0 0 8px 0;font-size:12px;color:#666">Add this location</p><input type="text" id="spotNameInput" placeholder="Location name" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;margin-bottom:8px;box-sizing:border-box" maxlength="60"><button id="confirmSaveSpotBtn" style="width:100%;padding:8px 12px;background:#173f38;color:#fff;border:0;border-radius:4px;cursor:pointer;font-weight:600">Save Spot</button></div>'; L.popup({ closeButton: true, autoClose: false }).setLatLng(coords).setContent(popupContent).openOn(map); }
function submitCapturedSpot({ name, lat, lng, type = 'Saved • custom', description = '' }) {
  const normalizedName = name?.trim();
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!normalizedName || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return null;
  }

  const place = buildSavedPlace(normalizedName, parsedLat, parsedLng, type, description);
  places.push(place);
  persistPlaces();
  addPlaceMarker(place);
  addPlaceButton(place);
  map.closePopup();
  triggerVibration('success');

  const successMsg = `Location ${normalizedName} saved to the campus map`;
  showToast(successMsg);
  announceForA11y(successMsg);
  speakCue(successMsg);
  return place;
}
map.on('popupopen', (event) => { const saveButton = event.popup.getElement()?.querySelector('#confirmSaveSpotBtn'); const nameInput = event.popup.getElement()?.querySelector('#spotNameInput'); if (!saveButton || !nameInput) return; saveButton.addEventListener('click', savePopupLocation); nameInput.focus(); });
async function savePopupLocation() { const locName = document.getElementById('spotNameInput')?.value.trim(); if (!locName || !currentCapturedCoords) { alert('Please enter a location name.'); announceForA11y('Please enter a location name'); speakCue('Please enter a location name'); return; } try { announceForA11y(`Saving location: ${locName}`); speakCue(`Saving location: ${locName}`); const savedPlace = submitCapturedSpot({ name: locName, lat: currentCapturedCoords[0], lng: currentCapturedCoords[1], type: 'Landmark · saved', description: '' }); if (!savedPlace) { throw new Error('save failed'); } map.closePopup(); currentCapturedCoords = null; } catch { triggerVibration('error'); const errMsg = 'Failed to save location. Please try again.'; alert(errMsg); announceForA11y(errMsg); speakCue(errMsg); } }
document.getElementById('add-spot-btn').addEventListener('click', addLocationAtCurrentGPS);
document.getElementById('accessibility-toggle-btn').addEventListener('click', toggleAccessibilityMode);
document.getElementById('closeLocationDialog').addEventListener('click', () => locationDialog.close());
document.getElementById('locationForm').addEventListener('submit', (event) => { event.preventDefault(); if (!pendingCoords) return showToast('Capture a location before saving.'); const locationDetails = { name: document.getElementById('locationName').value.trim(), category: document.getElementById('locationType').value, description: document.getElementById('locationDescription').value.trim(), latitude: pendingCoords[0], longitude: pendingCoords[1] }; if (!locationDetails.name) return; const saveButton = event.currentTarget.querySelector('button[type="submit"]'); saveButton.disabled = true; try { const place = submitCapturedSpot({ name: locationDetails.name, lat: locationDetails.latitude, lng: locationDetails.longitude, type: `${locationDetails.category} · saved`, description: locationDetails.description }); if (!place) throw new Error('save failed'); locationDialog.close(); document.getElementById('locationForm').reset(); pendingCoords = null; selectPlace(place); } catch { showToast('Unable to save location. Please try again.'); } finally { saveButton.disabled = false; } });
function renderEmptyPlaceState() { if (places.length || placeList.querySelector('.empty-place-state')) return; const emptyState = document.createElement('p'); emptyState.className = 'empty-place-state'; emptyState.textContent = "No saved places yet. Tap 'Add Spot Where I Stand' to add current location."; placeList.appendChild(emptyState); }
function addPlaceButton(place) { placeList.querySelector('.empty-place-state')?.remove(); const item = document.createElement('button'); item.className = 'place-item'; item.dataset.name = place.name; item.innerHTML = `<span class="place-pin">●</span><span><strong>${place.name}</strong><small>${place.type}</small></span>`; item.addEventListener('click', () => selectPlace(place)); placeList.appendChild(item); document.getElementById('placeCount').textContent = `${String(document.querySelectorAll('.place-item').length).padStart(2, '0')} PLACES`; }
renderEmptyPlaceState();
const orientationPanel = document.getElementById('orientationPanel'); const needle = document.querySelector('.compass-needle'); const headingValue = document.getElementById('headingValue'); const orientationStatus = document.getElementById('orientationStatus');
document.getElementById('arButton').addEventListener('click', async () => {
  orientationPanel.hidden = true;
  if (arState.active) {
    exitWebARView();
    return;
  }
  await startWebARGuidance();
});
document.getElementById('closeAr').addEventListener('click', () => { orientationPanel.hidden = true; });
document.getElementById('arCloseBtn').addEventListener('click', () => { exitWebARView(); });
function handleOrientation(event) { const heading = event.webkitCompassHeading || (event.alpha ? 360 - event.alpha : 0); needle.style.transform = `rotate(${heading}deg)`; headingValue.textContent = `${Math.round(heading)}° heading`; orientationStatus.textContent = 'Turn slowly to align with your selected destination.'; }
document.getElementById('enableOrientation').addEventListener('click', async () => { try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const permission = await DeviceOrientationEvent.requestPermission(); if (permission !== 'granted') throw new Error('denied'); } window.addEventListener('deviceorientation', handleOrientation, true); orientationStatus.textContent = 'Move your device to calibrate the compass.'; } catch { orientationStatus.textContent = 'Orientation permission was unavailable. Try HTTPS on a mobile device.'; } });
map.on('mousemove', (event) => { document.getElementById('coordinates').textContent = `${event.latlng.lat.toFixed(4)}° N · ${event.latlng.lng.toFixed(4)}° E`; });
