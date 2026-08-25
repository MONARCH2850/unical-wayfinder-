const campus = [5.0363, 8.3362];
const campusBounds = L.latLngBounds([5.0285, 8.3245], [5.0455, 8.3495]);
let installPrompt;
const isInsideCampus = (coords) => campusBounds.contains(coords);
let places = [
  { name: 'University Main Gate', type: 'Entrance · 2 min', coords: [5.0347, 8.3348] },
  { name: 'Abraham Ordia Stadium', type: 'Sports · 8 min', coords: [5.0382, 8.3327] },
  { name: 'Malabor Hostel', type: 'Residence · 6 min', coords: [5.0392, 8.3390] },
  { name: 'Nursing Sciences', type: 'Faculty · 5 min', coords: [5.0355, 8.3388] },
  { name: 'Nnamdi Azikiwe Library', type: 'Library · 4 min', coords: [5.0334, 8.3370] },
  { name: 'Eyo Ita Hall', type: 'Events · verify', coords: [5.0359, 8.3357] },
  { name: 'UNICAL Health Centre', type: 'Health · verify', coords: [5.0370, 8.3382] },
  { name: 'International Conference Centre', type: 'Events · verify', coords: [5.0349, 8.3375] },
  { name: 'Senate Chambers', type: 'Administration · verify', coords: [5.0368, 8.3364] },
  { name: 'Faculty of Arts', type: 'Faculty · verify', coords: [5.0345, 8.3363] },
  { name: 'Faculty of Social Sciences', type: 'Faculty · verify', coords: [5.0358, 8.3373] },
  { name: 'UNICAL ICT Directorate', type: 'Services · verify', coords: [5.0361, 8.3380] },
  { name: 'University Security Office', type: 'Security · verify', coords: [5.0350, 8.3350] }
];
const savedPlaces = JSON.parse(localStorage.getItem('unical-saved-places') || '[]').filter((place) => isInsideCampus(place.coords));
places = places.concat(savedPlaces);
let currentCoords;
let selectedPlace;
const map = L.map('map', { zoomControl: false, minZoom: 15, maxZoom: 20, maxBounds: campusBounds, maxBoundsViscosity: 1 }).fitBounds(campusBounds, { padding: [20, 20] });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; document.getElementById('installButton').hidden = false; });
document.getElementById('installButton').addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; document.getElementById('installButton').hidden = true; });
window.addEventListener('appinstalled', () => { document.getElementById('installButton').hidden = true; });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
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
destinationInput.addEventListener('input', () => { const query = destinationInput.value.toLowerCase().trim(); searchResults.innerHTML = ''; if (!query) return; places.filter((place) => place.name.toLowerCase().includes(query)).forEach((place) => { const result = document.createElement('div'); result.className = 'search-result'; result.textContent = place.name; result.addEventListener('click', () => { destinationInput.value = place.name; searchResults.innerHTML = ''; selectPlace(place); }); searchResults.appendChild(result); }); });
document.getElementById('clearRoute').addEventListener('click', () => { routePanel.hidden = true; routeLayer.clearLayers(); document.querySelectorAll('.place-item').forEach((item) => item.classList.remove('active')); map.flyTo(campus, 16); });
document.getElementById('startRoute').addEventListener('click', () => { if (!selectedPlace) return; const destination = `${selectedPlace.coords[0]},${selectedPlace.coords[1]}`; const origin = currentCoords ? `&origin=${currentCoords[0]},${currentCoords[1]}` : ''; window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=walking`, '_blank', 'noopener'); });
document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn()); document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
let userMarker;
function updateCurrentLocation(position, centerMap = true) { currentCoords = [position.coords.latitude, position.coords.longitude]; const coordinateLabel = document.getElementById('locationCoordinates'); if (!isInsideCampus(currentCoords)) { document.getElementById('statusText').textContent = 'Location outside campus'; if (coordinateLabel) coordinateLabel.textContent = `${currentCoords[0].toFixed(5)}° N · ${currentCoords[1].toFixed(5)}° E · outside campus`; return; } if (userMarker) userMarker.setLatLng(currentCoords); else userMarker = L.circleMarker(currentCoords, { radius: 8, color: '#fff', weight: 3, fillColor: '#e47b56', fillOpacity: 1 }).addTo(map).bindTooltip('You are here'); if (centerMap) map.flyTo(currentCoords, 17); document.getElementById('statusText').textContent = 'Live location enabled'; if (coordinateLabel) coordinateLabel.textContent = `${currentCoords[0].toFixed(5)}° N · ${currentCoords[1].toFixed(5)}° E`; }
function requestLocation(centerMap = true) { if (!navigator.geolocation) return showToast('Location is not supported by this browser.'); showToast('Requesting your location...'); navigator.geolocation.getCurrentPosition((position) => { updateCurrentLocation(position, centerMap); showToast('Your location is shown on the map.'); }, () => showToast('Location permission was not granted.')); }
document.getElementById('locateButton').addEventListener('click', () => requestLocation());
if (navigator.geolocation) navigator.geolocation.watchPosition((position) => updateCurrentLocation(position, false), () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
async function calculateRoute(place) { const origin = currentCoords && isInsideCampus(currentCoords) ? currentCoords : campus; const url = `https://router.project-osrm.org/route/v1/foot/${origin[1]},${origin[0]};${place.coords[1]},${place.coords[0]}?overview=full&geometries=geojson`; try { const response = await fetch(url); if (!response.ok) throw new Error('route unavailable'); const data = await response.json(); const route = data.routes[0]; const routePoints = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]); L.polyline(routePoints, { color: '#e47b56', weight: 5, opacity: .95, lineCap: 'round' }).addTo(routeLayer); routeMeta.textContent = `Walking route · ${Math.max(1, Math.round(route.duration / 60))} min · ${(route.distance / 1000).toFixed(1)} km`; } catch { L.polyline([origin, place.coords], { color: '#e47b56', weight: 4, dashArray: '4 8', opacity: .9 }).addTo(routeLayer); routeMeta.textContent = 'Walking route preview · route service unavailable'; } }
const locationDialog = document.getElementById('locationDialog');
document.getElementById('addLocationButton').addEventListener('click', () => { requestLocation(false); if (!currentCoords) document.getElementById('locationCoordinates').textContent = 'Requesting device location...'; else document.getElementById('locationCoordinates').textContent = `${currentCoords[0].toFixed(5)}° N · ${currentCoords[1].toFixed(5)}° E`; locationDialog.showModal(); });
document.getElementById('closeLocationDialog').addEventListener('click', () => locationDialog.close());
document.getElementById('locationForm').addEventListener('submit', (event) => { event.preventDefault(); if (!currentCoords || !isInsideCampus(currentCoords)) return showToast('You must be inside the UNICAL campus to save this place.'); const place = { name: document.getElementById('locationName').value.trim(), type: `${document.getElementById('locationType').value} · saved`, coords: currentCoords }; if (!place.name) return; const saved = JSON.parse(localStorage.getItem('unical-saved-places') || '[]'); saved.push(place); localStorage.setItem('unical-saved-places', JSON.stringify(saved)); places.push(place); place.marker = L.marker(place.coords, { icon: pinIcon }).addTo(markerLayer).bindTooltip(place.name, { direction: 'top', offset: [0, -8] }); addPlaceButton(place); locationDialog.close(); document.getElementById('locationForm').reset(); selectPlace(place); showToast('Place saved on this device.'); });
function addPlaceButton(place) { const item = document.createElement('button'); item.className = 'place-item'; item.dataset.name = place.name; item.innerHTML = `<span class="place-pin">●</span><span><strong>${place.name}</strong><small>${place.type}</small></span>`; item.addEventListener('click', () => selectPlace(place)); placeList.appendChild(item); document.getElementById('placeCount').textContent = `${String(document.querySelectorAll('.place-item').length).padStart(2, '0')} PLACES`; }
const orientationPanel = document.getElementById('orientationPanel'); const needle = document.querySelector('.compass-needle'); const headingValue = document.getElementById('headingValue'); const orientationStatus = document.getElementById('orientationStatus');
document.getElementById('arButton').addEventListener('click', () => { orientationPanel.hidden = false; }); document.getElementById('closeAr').addEventListener('click', () => { orientationPanel.hidden = true; });
function handleOrientation(event) { const heading = event.webkitCompassHeading || (event.alpha ? 360 - event.alpha : 0); needle.style.transform = `rotate(${heading}deg)`; headingValue.textContent = `${Math.round(heading)}° heading`; orientationStatus.textContent = 'Turn slowly to align with your selected destination.'; }
document.getElementById('enableOrientation').addEventListener('click', async () => { try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const permission = await DeviceOrientationEvent.requestPermission(); if (permission !== 'granted') throw new Error('denied'); } window.addEventListener('deviceorientation', handleOrientation, true); orientationStatus.textContent = 'Move your device to calibrate the compass.'; } catch { orientationStatus.textContent = 'Orientation permission was unavailable. Try HTTPS on a mobile device.'; } });
map.on('mousemove', (event) => { document.getElementById('coordinates').textContent = `${event.latlng.lat.toFixed(4)}° N · ${event.latlng.lng.toFixed(4)}° E`; });
