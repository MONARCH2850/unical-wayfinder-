const campus = [5.0363, 8.3362];
const unicalCampusOnlyBounds = L.latLngBounds(
  L.latLng(4.9360, 8.3360),
  L.latLng(4.9620, 8.3580)
);
let installPrompt;
let places = [];
localStorage.removeItem('unical-saved-places');
let currentCoords;
let selectedPlace;
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
L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
  attribution: '&copy; Google Maps',
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
  { points: [[5.0347,8.3348],[5.0352,8.3360],[5.0355,8.3388],[5.0364,8.3393],[5.0392,8.3390]], className: 'main-path' },
  { points: [[5.0347,8.3348],[5.0334,8.3370],[5.0325,8.3391]], className: 'quiet-path' },
  { points: [[5.0364,8.3393],[5.0373,8.3375],[5.0382,8.3327]], className: 'main-path' },
  { points: [[5.0352,8.3360],[5.0368,8.3351],[5.0380,8.3355],[5.0392,8.3390]], className: 'quiet-path' }
];
pathways.forEach((path) => L.polyline(path.points, { color: path.className === 'main-path' ? '#b5c83b' : '#78a090', weight: path.className === 'main-path' ? 5 : 3, opacity: .9, dashArray: path.className === 'quiet-path' ? '7 7' : null, lineCap: 'round' }).addTo(map));
const placeList = document.getElementById('placeList');
const routePanel = document.getElementById('routePanel');
const destinationInput = document.getElementById('destination');
const searchResults = document.getElementById('searchResults');
const routeTitle = document.getElementById('routeTitle');
const routeMeta = document.getElementById('routeMeta');
const toast = document.getElementById('locationToast');
const showToast = (message) => { toast.textContent = message; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 3500); };
function selectPlace(place) { selectedPlace = place; document.querySelectorAll('.place-item').forEach((item) => item.classList.toggle('active', item.dataset.name === place.name)); routeTitle.textContent = place.name; routeMeta.textContent = `${place.type.split(' · ')[0]} · calculating walking route...`; routePanel.hidden = false; routeLayer.clearLayers(); map.flyTo(place.coords, 17, { duration: .7 }); calculateRoute(place); }
places.forEach((place) => { addPlaceButton(place); });
document.getElementById('placeCount').textContent = `${String(places.length).padStart(2, '0')} PLACES`;
destinationInput.addEventListener('input', () => { const query = destinationInput.value.toLowerCase().trim(); searchResults.innerHTML = ''; if (!query) return; const matches = places.filter((place) => `${place.name} ${place.type}`.toLowerCase().includes(query)); if (!matches.length) { const result = document.createElement('div'); result.className = 'search-result search-empty'; result.textContent = 'No places found'; searchResults.appendChild(result); return; } matches.forEach((place) => { const result = document.createElement('button'); result.type = 'button'; result.className = 'search-result'; result.textContent = place.name; result.addEventListener('click', () => { destinationInput.value = place.name; searchResults.innerHTML = ''; selectPlace(place); }); searchResults.appendChild(result); }); });
document.getElementById('clearRoute').addEventListener('click', () => { routePanel.hidden = true; routeLayer.clearLayers(); document.querySelectorAll('.place-item').forEach((item) => item.classList.remove('active')); map.flyTo(campus, 16); });
document.getElementById('startRoute').addEventListener('click', () => { if (!selectedPlace) return; const destination = `${selectedPlace.coords[0]},${selectedPlace.coords[1]}`; const origin = currentCoords ? `&origin=${currentCoords[0]},${currentCoords[1]}` : ''; window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=walking`, '_blank', 'noopener'); });
document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn()); document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
let userMarker;
function updateCurrentLocation(position, centerMap = true) { currentCoords = [position.coords.latitude, position.coords.longitude]; const coordinateLabel = document.getElementById('locationCoordinates'); if (userMarker) userMarker.setLatLng(currentCoords); else userMarker = L.marker(currentCoords, { icon: L.divIcon({ className: 'user-location-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map).bindTooltip('You are here'); if (centerMap) map.flyTo(currentCoords, 17); document.getElementById('statusText').textContent = 'Live location enabled'; if (coordinateLabel) coordinateLabel.textContent = `${currentCoords[0].toFixed(5)}° N · ${currentCoords[1].toFixed(5)}° E`; }
function requestLocation(centerMap = true) { if (!navigator.geolocation) return showToast('Location is not supported by this browser.'); showToast('Requesting your location...'); navigator.geolocation.getCurrentPosition((position) => { updateCurrentLocation(position, centerMap); showToast('Your location is shown on the map.'); }, () => showToast('Location permission was not granted.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); }
document.getElementById('locateButton').addEventListener('click', () => requestLocation());
if (navigator.geolocation) navigator.geolocation.watchPosition((position) => updateCurrentLocation(position, false), () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
async function calculateRoute(place) { const origin = currentCoords || campus; const url = `https://router.project-osrm.org/route/v1/foot/${origin[1]},${origin[0]};${place.coords[1]},${place.coords[0]}?overview=full&geometries=geojson`; try { const response = await fetch(url); if (!response.ok) throw new Error('route unavailable'); const data = await response.json(); const route = data.routes[0]; const routePoints = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]); L.polyline(routePoints, { color: '#e47b56', weight: 5, opacity: .95, lineCap: 'round' }).addTo(routeLayer); routeMeta.textContent = `Walking route · ${Math.max(1, Math.round(route.duration / 60))} min · ${(route.distance / 1000).toFixed(1)} km`; } catch { L.polyline([origin, place.coords], { color: '#e47b56', weight: 4, dashArray: '4 8', opacity: .9 }).addTo(routeLayer); routeMeta.textContent = 'Walking route preview · route service unavailable'; } }
const locationDialog = document.getElementById('locationDialog');
let pendingCoords;
function openLocationDialog(coords) { pendingCoords = coords; document.getElementById('locationCoordinates').textContent = `${coords[0].toFixed(5)}° N · ${coords[1].toFixed(5)}° E`; locationDialog.showModal(); }
function captureCurrentLocation() { if (!navigator.geolocation) return showToast('Location is not supported by this browser.'); showToast('Capturing your exact location...'); navigator.geolocation.getCurrentPosition((position) => { const coords = [position.coords.latitude, position.coords.longitude]; if (!unicalCampusOnlyBounds.contains(coords)) return showToast('You must be physically inside UNICAL to add a location.'); openLocationDialog(coords); }, () => showToast('Location permission was not granted.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); }
document.getElementById('addLocationButton').addEventListener('click', captureCurrentLocation);
document.getElementById('mobileAddLocationButton').addEventListener('click', captureCurrentLocation);
document.getElementById('closeLocationDialog').addEventListener('click', () => locationDialog.close());
document.getElementById('locationForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!pendingCoords) return showToast('Capture a location before saving.'); const locationDetails = { name: document.getElementById('locationName').value.trim(), category: document.getElementById('locationType').value, description: document.getElementById('locationDescription').value.trim(), latitude: pendingCoords[0], longitude: pendingCoords[1] }; if (!locationDetails.name) return; const saveButton = event.currentTarget.querySelector('button[type="submit"]'); saveButton.disabled = true; try { const response = await fetch('/api/add-location/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(locationDetails) }); if (!response.ok) throw new Error('save failed'); const responseText = await response.text(); const data = responseText ? JSON.parse(responseText) : {}; const savedLocation = data.location || data; const place = { name: savedLocation.name || locationDetails.name, type: `${savedLocation.category || locationDetails.category} · saved`, description: savedLocation.description || locationDetails.description, coords: [Number(savedLocation.latitude ?? locationDetails.latitude), Number(savedLocation.longitude ?? locationDetails.longitude)] }; places.push(place); place.marker = L.marker(place.coords, { icon: pinIcon }).addTo(markerLayer).bindTooltip(place.name, { direction: 'top', offset: [0, -8] }); addPlaceButton(place); locationDialog.close(); document.getElementById('locationForm').reset(); pendingCoords = null; selectPlace(place); showToast('Location saved to the campus map.'); } catch { showToast('Unable to save location. Check the campus server and try again.'); } finally { saveButton.disabled = false; } });
function renderEmptyPlaceState() { if (places.length || placeList.querySelector('.empty-place-state')) return; const emptyState = document.createElement('p'); emptyState.className = 'empty-place-state'; emptyState.textContent = "No saved places yet. Tap 'Add Spot Where I Stand' to add current location."; placeList.appendChild(emptyState); }
function addPlaceButton(place) { placeList.querySelector('.empty-place-state')?.remove(); const item = document.createElement('button'); item.className = 'place-item'; item.dataset.name = place.name; item.innerHTML = `<span class="place-pin">●</span><span><strong>${place.name}</strong><small>${place.type}</small></span>`; item.addEventListener('click', () => selectPlace(place)); placeList.appendChild(item); document.getElementById('placeCount').textContent = `${String(document.querySelectorAll('.place-item').length).padStart(2, '0')} PLACES`; }
renderEmptyPlaceState();
const orientationPanel = document.getElementById('orientationPanel'); const needle = document.querySelector('.compass-needle'); const headingValue = document.getElementById('headingValue'); const orientationStatus = document.getElementById('orientationStatus');
document.getElementById('arButton').addEventListener('click', () => { orientationPanel.hidden = false; }); document.getElementById('closeAr').addEventListener('click', () => { orientationPanel.hidden = true; });
function handleOrientation(event) { const heading = event.webkitCompassHeading || (event.alpha ? 360 - event.alpha : 0); needle.style.transform = `rotate(${heading}deg)`; headingValue.textContent = `${Math.round(heading)}° heading`; orientationStatus.textContent = 'Turn slowly to align with your selected destination.'; }
document.getElementById('enableOrientation').addEventListener('click', async () => { try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const permission = await DeviceOrientationEvent.requestPermission(); if (permission !== 'granted') throw new Error('denied'); } window.addEventListener('deviceorientation', handleOrientation, true); orientationStatus.textContent = 'Move your device to calibrate the compass.'; } catch { orientationStatus.textContent = 'Orientation permission was unavailable. Try HTTPS on a mobile device.'; } });
map.on('mousemove', (event) => { document.getElementById('coordinates').textContent = `${event.latlng.lat.toFixed(4)}° N · ${event.latlng.lng.toFixed(4)}° E`; });
