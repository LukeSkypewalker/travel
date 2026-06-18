// --- State Management ---
const state = {
    activeMode: 'manual', // 'manual' or 'explorer'
    routes: [], // Mode 1 manual flights (raw legs)
    manualItineraries: [], // Mode 1 auto-calculated itineraries
    selectedManualItineraryIndex: 0, // Mode 1 active itinerary index
    hoveredManualItineraryIndex: null, // Mode 1 hovered itinerary index
    editingLegId: null, // Mode 1 flight leg currently being edited
    itineraries: [], // Mode 2 generated itineraries
    selectedItinerary: null, // Mode 2 active itinerary
    playback: {
        isPlaying: false,
        currentTime: 0, // ms timestamp
        speed: 3600,    // simulated seconds per real second
        minTime: 0,     // ms timestamp
        maxTime: 0,     // ms timestamp
        animationFrameId: null,
        lastTickTime: 0
    }
};

// --- Pathfinder Algorithm for Directed Acyclic Graph of Flights ---
function findItineraries(flights) {
    if (!flights || flights.length === 0) return [];

    // Sort flights by departure time
    const sorted = [...flights].sort((a, b) => a.departureTime - b.departureTime);

    // Find starting flights (sources: flights with no incoming connecting flights)
    const startingFlights = sorted.filter(f1 => {
        const hasIncoming = sorted.some(f2 => 
            getCityCode(f2.destination.name) === getCityCode(f1.origin.name) && 
            f2.arrivalTime <= f1.departureTime
        );
        return !hasIncoming;
    });

    const itineraries = [];

    function dfs(currentFlight, path) {
        const lastArrival = currentFlight.arrivalTime;
        const lastDestCode = getCityCode(currentFlight.destination.name);

        // Find next valid chronological flights, avoiding duplicate flights in path to prevent infinite loops
        const nextFlights = sorted.filter(f => 
            getCityCode(f.origin.name) === lastDestCode && 
            f.departureTime >= lastArrival &&
            !path.some(p => p.id === f.id)
        );

        if (nextFlights.length === 0) {
            // Path completed
            itineraries.push(buildItineraryObject(path));
            return;
        }

        nextFlights.forEach(nextF => {
            dfs(nextF, [...path, nextF]);
        });
    }

    startingFlights.forEach(f => {
        dfs(f, [f]);
    });

    // Fallback: If no starting flights found (due to loops), start with all flights
    if (itineraries.length === 0 && flights.length > 0) {
        sorted.forEach(f => {
            dfs(f, [f]);
        });
    }

    // Sort itineraries by total price, then by duration
    itineraries.sort((a, b) => a.totalPrice - b.totalPrice || a.totalDuration - b.totalDuration);

    return itineraries;
}

function buildItineraryObject(legs) {
    const totalPrice = legs.reduce((sum, l) => sum + l.price, 0);
    const totalDuration = legs[legs.length - 1].arrivalTime - legs[0].departureTime;
    const pathString = [getCityCode(legs[0].origin.name), ...legs.map(l => getCityCode(l.destination.name))].join(' → ');
    
    // Build layovers
    const layovers = [];
    for (let i = 0; i < legs.length - 1; i++) {
        const current = legs[i];
        const next = legs[i + 1];
        if (next.departureTime > current.arrivalTime) {
            layovers.push({
                city: current.destination.name.split(',')[0],
                code: getCityCode(current.destination.name),
                startTime: current.arrivalTime,
                endTime: next.departureTime,
                lat: current.destination.lat,
                lng: current.destination.lng
            });
        }
    }

    return {
        id: `itin-${Math.random().toString(36).substr(2, 5)}`,
        legs: legs,
        pathString,
        totalPrice,
        totalDuration,
        layovers
    };
}

// --- Airport Coordinates Database (European and Global Hubs) ---
const AIRPORT_DB = {
    'KRK': { name: 'Kraków John Paul II International Airport (KRK), Poland', lat: 50.0777, lng: 19.7848 },
    'LCA': { name: 'Larnaca International Airport (LCA), Cyprus', lat: 34.8751, lng: 33.6249 },
    'LARN': { name: 'Larnaca International Airport (LCA), Cyprus', lat: 34.8751, lng: 33.6249 },
    'BUD': { name: 'Budapest Liszt Ferenc International Airport (BUD), Hungary', lat: 47.4298, lng: 19.2611 },
    'DUS': { name: 'Düsseldorf Airport (DUS), Germany', lat: 51.2895, lng: 6.7668 },
    'DUSS': { name: 'Düsseldorf Airport (DUS), Germany', lat: 51.2895, lng: 6.7668 },
    'LHR': { name: 'London Heathrow Airport (LHR), London, UK', lat: 51.4700, lng: -0.4543 },
    'JFK': { name: 'John F. Kennedy International Airport (JFK), New York, USA', lat: 40.6413, lng: -73.7781 },
    'HND': { name: 'Tokyo Haneda Airport (HND), Tokyo, Japan', lat: 35.5494, lng: 139.7798 },
    'DXB': { name: 'Dubai International Airport (DXB), Dubai, UAE', lat: 25.2532, lng: 55.3657 },
    'CDG': { name: 'Paris Charles de Gaulle Airport (CDG), Paris, France', lat: 49.0097, lng: 2.5479 },
    'SIN': { name: 'Singapore Changi Airport (SIN), Singapore', lat: 1.3644, lng: 103.9915 },
    'SYD': { name: 'Sydney Kingsford Smith Airport (SYD), Sydney, Australia', lat: -33.9461, lng: 151.1772 },
    'KEF': { name: 'Keflavík International Airport (KEF), Reykjavik, Iceland', lat: 63.9850, lng: -22.6056 },
    'IST': { name: 'Istanbul Airport (IST), Istanbul, Turkey', lat: 41.2753, lng: 28.7519 },
    'LAX': { name: 'Los Angeles International Airport (LAX), Los Angeles, USA', lat: 33.9416, lng: -118.4085 }
};

// --- Hubs List for Mode 2 Explorer ---
const HUBS = [
    { code: 'LHR', name: 'London Heathrow Airport (LHR), London, UK', lat: 51.4700, lng: -0.4543 },
    { code: 'JFK', name: 'John F. Kennedy International Airport (JFK), New York, USA', lat: 40.6413, lng: -73.7781 },
    { code: 'HND', name: 'Tokyo Haneda Airport (HND), Tokyo, Japan', lat: 35.5494, lng: 139.7798 },
    { code: 'DXB', name: 'Dubai International Airport (DXB), Dubai, UAE', lat: 25.2532, lng: 55.3657 },
    { code: 'CDG', name: 'Paris Charles de Gaulle Airport (CDG), Paris, France', lat: 49.0097, lng: 2.5479 },
    { code: 'SIN', name: 'Singapore Changi Airport (SIN), Singapore', lat: 1.3644, lng: 103.9915 },
    { code: 'SYD', name: 'Sydney Kingsford Smith Airport (SYD), Sydney, Australia', lat: -33.9461, lng: 151.1772 },
    { code: 'KEF', name: 'Keflavík International Airport (KEF), Reykjavik, Iceland', lat: 63.9850, lng: -22.6056 },
    { code: 'IST', name: 'Istanbul Airport (IST), Istanbul, Turkey', lat: 41.2753, lng: 28.7519 },
    { code: 'LAX', name: 'Los Angeles International Airport (LAX), Los Angeles, USA', lat: 33.9416, lng: -118.4085 }
];

// --- Leaflet Map Setup ---
const map = L.map('map', {
    center: [30, -10],
    zoom: 3,
    minZoom: 2,
    worldCopyJump: true,
    zoomControl: false,          // Disable default top-left zoom control
    attributionControl: false     // Remove Leaflet - CARTO attribution control
});

// Add zoom control on the right
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Load tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Leaflet Layer Groups
const manualLayers = L.layerGroup().addTo(map);
const explorerLayers = L.layerGroup().addTo(map);
const planesLayerGroup = L.layerGroup().addTo(map);

// --- LocalStorage Persistence Helpers ---
function saveRoutesToLocalStorage() {
    const cleanRoutes = state.routes.map(r => ({
        origin: r.origin,
        destination: r.destination,
        departureTime: r.departureTime,
        arrivalTime: r.arrivalTime,
        price: r.price,
        color: r.color,
        link: r.link,
        soldOut: !!r.soldOut
    }));
    localStorage.setItem('weaver_routes', JSON.stringify(cleanRoutes));
}

// --- Custom Icons ---
function createStartIcon(color) {
    return L.divIcon({
        className: 'custom-start-marker-wrapper',
        html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 10px ${color}, 0 0 20px ${color};"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

function createEndIcon(color) {
    return L.divIcon({
        className: 'custom-end-marker-wrapper',
        html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 10px ${color}, 0 0 20px ${color}; display: flex; align-items: center; justify-content: center;">
                 <div style="background-color: #ffffff; width: 4px; height: 4px; border-radius: 50%;"></div>
               </div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
}

function createLayoverIcon() {
    return L.divIcon({
        className: 'custom-layover-marker-wrapper',
        html: `<div class="layover-marker-pin">
                 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 11h2M9 15h2M13 11h2M13 15h2"/>
                 </svg>
               </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function createPlaneIcon(color, bearing) {
    return L.divIcon({
        className: 'custom-airplane-icon-wrapper',
        html: `<div class="airplane-marker" style="--route-color: ${color}; transform: rotate(${bearing - 45}deg); width: 32px; height: 32px;">
                 <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1.1.1-1.5.5l-.3.3c-.4.4-.4 1.1 0 1.5l7.9 3.5-3.8 3.8-2.6-.9c-.4-.1-.9 0-1.2.3l-.7.7c-.3.3-.3.8 0 1.1l3.7 2 2 3.7c.3.3.8.3 1.1 0l.7-.7c.3-.3.4-.8.3-1.2l-.9-2.6 3.8-3.8 3.5 7.9c.4.4 1 .4 1.5 0l.3-.3c.4-.4.6-1 .5-1.5z"/>
                 </svg>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function createExploringIcon() {
    return L.divIcon({
        className: 'custom-exploring-icon-wrapper',
        html: `<div class="exploring-marker" style="width: 36px; height: 36px;">
                 <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                     <circle cx="12" cy="13" r="3"/>
                 </svg>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

// --- Skyscanner Link Parser & Coordinate Finder ---
async function getAirportCoords(code) {
    const codeUpper = code.toUpperCase();
    if (AIRPORT_DB[codeUpper]) {
        return AIRPORT_DB[codeUpper];
    }
    
    let cleanCode = codeUpper;
    if (cleanCode === 'DUSS') cleanCode = 'DUS';
    if (cleanCode === 'LARN') cleanCode = 'LCA';
    
    if (AIRPORT_DB[cleanCode]) {
        return AIRPORT_DB[cleanCode];
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${cleanCode}+airport&limit=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            const resolved = {
                name: `${cleanCode} Airport, ${data[0].display_name.split(',')[1] || ''}`,
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
            AIRPORT_DB[cleanCode] = resolved;
            return resolved;
        }
    } catch (e) {
        console.error("Nominatim lookup failed for code:", cleanCode, e);
    }
    return null;
}

function parseSkyscannerLink(urlStr) {
    try {
        const url = new URL(urlStr);
        const path = url.pathname;
        const pathParts = path.split('/');
        
        const flightsIdx = pathParts.indexOf('flights');
        if (flightsIdx === -1 || pathParts.length < flightsIdx + 3) {
            throw new Error("Invalid Skyscanner flight link path structure.");
        }
        
        const originCode = pathParts[flightsIdx + 1].toUpperCase();
        const destCode = pathParts[flightsIdx + 2].toUpperCase();

        const configPart = pathParts.find(p => p.includes('--'));
        if (!configPart) {
            throw new Error("Could not locate flight configuration details in link.");
        }

        const times = configPart.match(/\d{10}/g);
        if (!times || times.length < 2) {
            throw new Error("Could not parse departure and arrival timestamps from flight configuration.");
        }

        const depTimeStr = times[0];
        const arrTimeStr = times[times.length - 1];

        const parseTimeStr = (str) => {
            const yy = parseInt(str.substring(0, 2));
            const mm = parseInt(str.substring(2, 4)) - 1;
            const dd = parseInt(str.substring(4, 6));
            const hh = parseInt(str.substring(6, 8));
            const min = parseInt(str.substring(8, 10));
            
            const yearStr = `20${yy}`;
            const monthStr = String(mm + 1).padStart(2, '0');
            const dayStr = String(dd).padStart(2, '0');
            const hourStr = String(hh).padStart(2, '0');
            const minStr = String(min).padStart(2, '0');
            return `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minStr}`;
        };

        const depLocalISO = parseTimeStr(depTimeStr);
        const arrLocalISO = parseTimeStr(arrTimeStr);

        return {
            originCode,
            destCode,
            departureTime: depLocalISO,
            arrivalTime: arrLocalISO
        };
    } catch (e) {
        console.error("Parse Skyscanner link error:", e);
        return null;
    }
}

// --- Nominatim Geocoding Autocomplete ---
function setupAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestionsList = document.getElementById(suggestionsId);

    if (!input || !suggestionsList) return;

    const searchLocations = async (query) => {
        if (!query || query.length < 3) {
            suggestionsList.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
                headers: { 'Accept-Language': 'en' }
            });
            const data = await response.json();
            
            suggestionsList.innerHTML = '';
            
            if (data && data.length > 0) {
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.textContent = item.display_name;
                    div.addEventListener('click', () => {
                        input.value = item.display_name;
                        input.dataset.lat = item.lat;
                        input.dataset.lng = item.lon;
                        input.dataset.name = item.display_name;
                        suggestionsList.style.display = 'none';
                    });
                    suggestionsList.appendChild(div);
                });
                suggestionsList.style.display = 'block';
            } else {
                suggestionsList.style.display = 'none';
            }
        } catch (error) {
            console.error("Nominatim fetch error:", error);
        }
    };

    const debouncedSearch = debounce(searchLocations, 350);

    input.addEventListener('input', (e) => {
        delete input.dataset.lat;
        delete input.dataset.lng;
        delete input.dataset.name;
        debouncedSearch(e.target.value.trim());
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== suggestionsList) {
            suggestionsList.style.display = 'none';
        }
    });
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- Date formatting helper ---
function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function toLocalISO(date) {
    if (!date || isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
}

function truncateString(str, num) {
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
}

function getCityCode(name) {
    const match = name.match(/\(([A-Z]{3,4})\)/);
    if (match) return match[1];
    const clean = name.replace(/[^A-Za-z]/g, '').toUpperCase();
    return clean.substring(0, 3) || 'LOC';
}

// --- Open / Close Edit Panel ---
function openEditPanel(mode) {
    const editPanel = document.getElementById('edit-panel');
    const leftPanel = document.getElementById('left-panel');
    const editManual = document.getElementById('edit-manual-container');
    const title = document.getElementById('edit-panel-title');

    if (!editPanel) return;

    editPanel.classList.remove('collapsed');
    if (leftPanel) leftPanel.classList.add('edit-open');

    if (title) title.textContent = "Route Editor";
    if (editManual) editManual.classList.add('active');
    
    renderItineraryDetails();
    lucide.createIcons();
}

function closeEditPanel() {
    const editPanel = document.getElementById('edit-panel');
    const leftPanel = document.getElementById('left-panel');
    const formPanel = document.getElementById('form-panel');
    if (editPanel) {
        editPanel.classList.add('collapsed');
        editPanel.classList.remove('form-open');
    }
    if (formPanel) {
        formPanel.classList.add('collapsed');
    }
    if (leftPanel) {
        leftPanel.classList.remove('edit-open');
    }
}

function closeFormPanel() {
    const formPanel = document.getElementById('form-panel');
    const editPanel = document.getElementById('edit-panel');
    if (formPanel) {
        formPanel.classList.add('collapsed');
    }
    if (editPanel) {
        editPanel.classList.remove('form-open');
    }
}

function renderItineraryDetails() {
    const editManual = document.getElementById('edit-manual-details');
    if (!editManual) return;

    const itin = state.manualItineraries[state.selectedManualItineraryIndex];
    if (!itin) {
        editManual.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <i data-lucide="compass" style="width: 32px; height: 32px;"></i>
                <p>No active itinerary selected.<br>Select one from the left panel!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    let legsHTML = '';
    itin.legs.forEach((leg, idx) => {
        const depDate = new Date(leg.departureTime);
        const arrDate = new Date(leg.arrivalTime);
        
        let linkHTML = '';
        if (leg.link) {
            linkHTML = `
                <a href="${leg.link}" target="_blank" class="btn-action btn-link-leg" title="Open Flight Page" style="color: var(--text-muted); text-decoration: none;">
                    <i data-lucide="external-link"></i>
                </a>
            `;
        }

        const soldOutBadge = leg.soldOut ? `<span class="price-change-status sold-out" style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">SOLD OUT</span>` : '';

        legsHTML += `
            <div class="details-leg-card" style="border-left: 3px solid ${leg.color};">
                <div class="details-leg-header">
                    <span class="details-leg-title" style="display: flex; align-items: center;">
                        ${getCityCode(leg.origin.name)} → ${getCityCode(leg.destination.name)}
                        ${soldOutBadge}
                    </span>
                    <div class="details-leg-actions">
                        ${linkHTML}
                        <button type="button" class="btn-action btn-edit-leg" data-id="${leg.id}" title="Fligth editor">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button type="button" class="btn-action btn-delete-leg" data-id="${leg.id}" title="Delete Flight Leg">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="details-leg-body">
                    <p style="margin: 3px 0; font-size: 0.8rem; color: var(--text-muted);"><strong>Dep:</strong> ${formatDateTime(depDate)}</p>
                    <p style="margin: 3px 0; font-size: 0.8rem; color: var(--text-muted);"><strong>Arr:</strong> ${formatDateTime(arrDate)}</p>
                    <p style="margin: 3px 0; font-size: 0.8rem; color: var(--text-muted);"><strong>Price:</strong> <span style="color: var(--secondary); font-weight:600;">$${leg.price}</span></p>
                </div>
            </div>
        `;

        // Check if there is a layover after this leg
        const nextLeg = itin.legs[idx + 1];
        if (nextLeg && nextLeg.departureTime > leg.arrivalTime) {
            const layoverMs = nextLeg.departureTime - leg.arrivalTime;
            const days = (layoverMs / (24 * 3600 * 1000)).toFixed(1);
            legsHTML += `
                <div class="details-layover-divider">
                    <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                    <span>Layover in ${leg.destination.name.split(',')[0]}: <strong>${days} days</strong></span>
                </div>
            `;
        }
    });

    editManual.innerHTML = `
        <div class="itinerary-details-view">
            <div class="details-legs-list">
                ${legsHTML}
            </div>
        </div>
    `;

    editManual.querySelectorAll('.btn-edit-leg').forEach(btn => {
        btn.addEventListener('click', () => {
            showLegForm(btn.dataset.id);
        });
    });

    editManual.querySelectorAll('.btn-delete-leg').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this flight leg?")) {
                deleteRoute(btn.dataset.id);
            }
        });
    });

    lucide.createIcons();
}

function showLegForm(legId) {
    const formPanel = document.getElementById('form-panel');
    const editPanel = document.getElementById('edit-panel');
    const leftPanel = document.getElementById('left-panel');
    const formContainer = document.getElementById('edit-manual-form-container');
    const formTitle = document.getElementById('manual-form-title');
    const submitBtn = document.getElementById('btn-submit-route');

    if (formPanel) {
        formPanel.classList.remove('collapsed');
        if (editPanel) {
            editPanel.classList.remove('collapsed');
            editPanel.classList.add('form-open');
        }
        if (leftPanel) {
            leftPanel.classList.add('edit-open');
        }
        renderItineraryDetails();
    }

    if (!formContainer) return;

    formContainer.classList.add('active');
    formContainer.style.display = 'flex';

    const originInput = document.getElementById('origin-input');
    const destInput = document.getElementById('destination-input');
    const depTimeInput = document.getElementById('departure-time');
    const arrTimeInput = document.getElementById('arrival-time');
    const priceInput = document.getElementById('route-price');
    const colorInput = document.getElementById('route-color');
    const routeForm = document.getElementById('route-form');

    if (legId) {
        const leg = state.routes.find(r => r.id === legId);
        if (leg) {
            state.editingLegId = legId;
            if (formTitle) formTitle.textContent = "Fligth editor";
            if (submitBtn) submitBtn.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Save Flight Details`;

            originInput.value = leg.origin.name;
            originInput.dataset.lat = leg.origin.lat;
            originInput.dataset.lng = leg.origin.lng;
            originInput.dataset.name = leg.origin.name;

            destInput.value = leg.destination.name;
            destInput.dataset.lat = leg.destination.lat;
            destInput.dataset.lng = leg.destination.lng;
            destInput.dataset.name = leg.destination.name;

            depTimeInput.value = toLocalISO(new Date(leg.departureTime));
            arrTimeInput.value = toLocalISO(new Date(leg.arrivalTime));
            priceInput.value = leg.price;
            colorInput.value = leg.color;
            const linkInput = document.getElementById('route-link');
            if (linkInput) linkInput.value = leg.link || '';
        }
    } else {
        state.editingLegId = null;
        if (formTitle) formTitle.textContent = "Add New Flight Leg";
        if (submitBtn) submitBtn.innerHTML = `<i data-lucide="plus-circle" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Add Route`;
        
        if (routeForm) routeForm.reset();
        const linkInput = document.getElementById('route-link');
        if (linkInput) linkInput.value = '';

        delete originInput.dataset.lat;
        delete originInput.dataset.lng;
        delete originInput.dataset.name;
        delete destInput.dataset.lat;
        delete destInput.dataset.lng;
        delete destInput.dataset.name;
    }
    lucide.createIcons();
}

function renderManualItinerariesList() {
    const listContainer = document.getElementById('manual-itineraries-list');
    const optionCountSpan = document.getElementById('itinerary-option-count');
    if (!listContainer) return;

    // Clean up any existing hover tooltips in document
    document.querySelectorAll('.route-hover-tooltip').forEach(el => el.remove());

    listContainer.innerHTML = '';

    if (state.manualItineraries.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="compass" style="width: 32px; height: 32px;"></i>
                <p>No itineraries calculated.<br>Add some flight legs to discover connections!</p>
            </div>
        `;
        if (optionCountSpan) optionCountSpan.textContent = '0 options';
        lucide.createIcons();
        return;
    }

    if (optionCountSpan) optionCountSpan.textContent = `${state.manualItineraries.length} options`;

    state.manualItineraries.forEach((itin, index) => {
        const isActive = index === state.selectedManualItineraryIndex;
        const card = document.createElement('div');
        card.className = `itinerary-card ${isActive ? 'active' : ''}`;
        
        const durationDays = (itin.totalDuration / (24 * 3600 * 1000)).toFixed(1);

        // Helper to format date as "19 Jun"
        const formatCardDate = (dateVal) => {
            const date = new Date(dateVal);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${date.getDate()} ${months[date.getMonth()]}`;
        };

        // Construct stops HTML illustrating dates below airports
        let stopsHTML = '';
        itin.legs.forEach((leg, idx) => {
            if (idx === 0) {
                stopsHTML += `
                    <div class="itinerary-stop-item">
                        <span class="stop-airport">${getCityCode(leg.origin.name)}</span>
                        <span class="stop-date">${formatCardDate(leg.departureTime)}</span>
                    </div>
                `;
            }
            stopsHTML += `
                <div class="itinerary-stop-arrow"><i data-lucide="arrow-right" style="width:12px; height:12px; opacity:0.5;"></i></div>
                <div class="itinerary-stop-item">
                    <span class="stop-airport">${getCityCode(leg.destination.name)}</span>
                    <span class="stop-date">${formatCardDate(leg.arrivalTime)}</span>
                </div>
            `;
        });

        const hasSoldOut = itin.legs.some(l => l.soldOut);
        const soldOutWarning = hasSoldOut ? `<span style="color: var(--danger); font-size: 0.65rem; font-weight: 700; border: 1px solid var(--danger); padding: 1px 4px; border-radius: 3px; margin-left: 6px;">INCOMPLETE</span>` : '';

        card.innerHTML = `
            <div class="itinerary-card-header">
                <span style="display: inline-flex; align-items: center;">Option ${index + 1} ${soldOutWarning}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-edit-itinerary" title="Edit Flights" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; display: inline-flex; align-items: center; justify-content: center; transition: var(--transition);">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </div>
            <div class="itinerary-card-stops">
                ${stopsHTML}
            </div>
            <div class="itinerary-card-details">
                <span>Est. Price: <strong style="color: var(--secondary);">$${itin.totalPrice}</strong></span>
                <span>Duration: <strong>${durationDays} days</strong></span>
            </div>
        `;

        card.addEventListener('click', () => {
            if (state.selectedManualItineraryIndex === index) return;
            state.selectedManualItineraryIndex = index;
            
            // Re-render list to update active card styling
            renderManualItinerariesList();
            
            // Re-draw map active paths
            drawRoutesOnMap();
            
            // Re-draw timeline scale & bounds
            updateTimelineBounds();
        });

        const editBtn = card.querySelector('.btn-edit-itinerary');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                state.selectedManualItineraryIndex = index;
                renderManualItinerariesList();
                drawRoutesOnMap();
                updateTimelineBounds();
                
                openEditPanel('manual');
            });
        }

        // Show route details on mouse hover tooltip next to the card
        card.addEventListener('mouseenter', (e) => {
            state.hoveredManualItineraryIndex = index;
            drawRoutesOnMap();

            const tooltip = document.createElement('div');
            tooltip.className = 'route-hover-tooltip';
            
            let html = '<div class="tooltip-title">Route Details</div>';
            itin.legs.forEach((leg, idx) => {
                const depDate = new Date(leg.departureTime);
                const arrDate = new Date(leg.arrivalTime);
                const formatTooltipDate = (d) => {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const pad = (num) => num.toString().padStart(2, '0');
                    return `${d.getDate()} ${months[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                };
                
                html += `
                    <div class="tooltip-leg" style="border-left: 2.5px solid ${leg.color}; padding-left: 8px; margin-bottom: 6px;">
                        <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-main); margin-bottom: 2px;">
                            ${getCityCode(leg.origin.name)} → ${getCityCode(leg.destination.name)}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.35;">
                            Dep: ${formatTooltipDate(depDate)}<br>
                            Arr: ${formatTooltipDate(arrDate)}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--secondary); font-weight: 600; margin-top: 1px;">
                            Price: $${leg.price}
                        </div>
                    </div>
                `;
                
                const nextLeg = itin.legs[idx + 1];
                if (nextLeg && nextLeg.departureTime > leg.arrivalTime) {
                    const layoverMs = nextLeg.departureTime - leg.arrivalTime;
                    const days = (layoverMs / (24 * 3600 * 1000)).toFixed(1);
                    html += `
                        <div style="font-size: 0.7rem; color: var(--warning); margin-bottom: 6px; padding-left: 10px; display: flex; align-items: center; gap: 4px;">
                            <i data-lucide="clock" style="width: 11px; height: 11px; opacity: 0.85;"></i>
                            <span>Layover: ${days} days</span>
                        </div>
                    `;
                }
            });
            
            tooltip.innerHTML = html;
            document.body.appendChild(tooltip);
            
            const rect = card.getBoundingClientRect();
            tooltip.style.position = 'fixed';
            tooltip.style.top = `${rect.top}px`;
            tooltip.style.left = `${rect.right + 10}px`;
            tooltip.style.zIndex = '9999';
            
            lucide.createIcons();
            
            card.addEventListener('mouseleave', () => {
                tooltip.remove();
                state.hoveredManualItineraryIndex = null;
                drawRoutesOnMap();
            }, { once: true });
        });

        listContainer.appendChild(card);
    });
    lucide.createIcons();
}

// --- Mode 1: Manual Planner UI ---
function renderRoutesList() {
    const container = document.getElementById('routes-list');
    const countSpan = document.getElementById('route-count');
    if (!container || !countSpan) return;
    
    countSpan.textContent = `${state.routes.length} route${state.routes.length === 1 ? '' : 's'}`;

    if (state.routes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="map-pin" style="width: 32px; height: 32px;"></i>
                <p>No routes added yet.<br>Paste a Skyscanner link or fill the form below!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    
    state.routes.forEach(route => {
        const depDate = new Date(route.departureTime);
        const arrDate = new Date(route.arrivalTime);
        const durationHours = ((arrDate - depDate) / (1000 * 60 * 60)).toFixed(1);

        const card = document.createElement('div');
        card.className = 'route-card';
        card.style.setProperty('--route-color', route.color);

        let linkHTML = '';
        if (route.link) {
            linkHTML = `
                <div class="route-detail-item" style="grid-column: span 2; margin-top: 6px;">
                    <a href="${route.link}" target="_blank" class="btn btn-secondary" style="width: 100%; padding: 6px 10px; font-size: 0.78rem; text-decoration: none; border-color: rgba(99, 102, 241, 0.4); color: var(--text-accent); gap: 4px; display: inline-flex; justify-content: center; align-items: center; border-radius: 6px;">
                        <i data-lucide="external-link" style="width: 12px; height: 12px;"></i>
                        Book on Skyscanner
                    </a>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="route-card-header">
                <div class="route-locations">
                    <div class="route-node">
                        <div class="route-node-dot" style="background: ${route.color}"></div>
                        <span title="${route.origin.name}">${truncateString(route.origin.name, 28)}</span>
                    </div>
                    <div class="route-node-line"></div>
                    <div class="route-node-node route-node">
                        <div class="route-node-dot" style="background: ${route.color}"></div>
                        <span title="${route.destination.name}">${truncateString(route.destination.name, 28)}</span>
                    </div>
                </div>
                <div class="route-card-actions">
                    <button class="action-btn focus-route-btn" title="Center on Map">
                        <i data-lucide="maximize-2"></i>
                    </button>
                    <button class="action-btn delete-route-btn" title="Delete Route">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            
            <div class="route-details">
                <div class="route-detail-item">
                    <i data-lucide="clock"></i>
                    <span>${durationHours} hrs</span>
                </div>
                <div class="route-detail-item price-tag">
                    <span>$${route.price}</span>
                </div>
                <div class="route-detail-item" style="grid-column: span 2;">
                    <i data-lucide="plane-takeoff"></i>
                    <span>Dep: ${formatDateTime(depDate)}</span>
                </div>
                <div class="route-detail-item" style="grid-column: span 2;">
                    <i data-lucide="plane-land"></i>
                    <span>Arr: ${formatDateTime(arrDate)}</span>
                </div>
                ${linkHTML}
            </div>
        `;

        card.querySelector('.focus-route-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const bounds = L.latLngBounds([route.origin.lat, route.origin.lng], [route.destination.lat, route.destination.lng]);
            map.fitBounds(bounds, { padding: [50, 50] });
        });

        card.querySelector('.delete-route-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteRoute(route.id);
        });

        container.appendChild(card);
    });

    lucide.createIcons();
}

// --- Gradient Polyline Draw Utilities ---
function adjustColorBrightness(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.max(0, Math.min(255, Math.floor(r * percent)));
    g = Math.max(0, Math.min(255, Math.floor(g * percent)));
    b = Math.max(0, Math.min(255, Math.floor(b * percent)));

    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

function drawGradientPolyline(points, color, weight, opacity, layerGroup) {
    const numSegments = 25; // 25 segments for smooth transition
    const pointsPerSegment = Math.ceil(points.length / numSegments);

    for (let s = 0; s < numSegments; s++) {
        const startIdx = s * pointsPerSegment;
        if (startIdx >= points.length - 1) break;
        const endIdx = Math.min((s + 1) * pointsPerSegment + 1, points.length);

        const segmentPoints = points.slice(startIdx, endIdx);
        if (segmentPoints.length < 2) continue;

        const latLngs = segmentPoints.map(p => L.latLng(p.lat, p.lng));

        // Start of the line is darker (percent = 0.22) and destination is full brightness (percent = 1.0)
        const percent = 0.22 + (s / (numSegments - 1)) * 0.78;
        const segmentColor = adjustColorBrightness(color, percent);

        L.polyline(latLngs, {
            color: segmentColor,
            weight: weight,
            opacity: opacity,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
        }).addTo(layerGroup);
    }
}

function drawRoutesOnMap() {
    manualLayers.clearLayers();
    if (state.activeMode !== 'manual') return;

    // Get active itinerary legs (hovered or selected)
    const highlightIndex = state.hoveredManualItineraryIndex !== null
        ? state.hoveredManualItineraryIndex
        : state.selectedManualItineraryIndex;
    const activeItin = state.manualItineraries[highlightIndex];
    const activeLegIds = new Set((activeItin?.legs || []).map(l => l.id));

    state.routes.forEach(route => {
        const isActive = activeLegIds.has(route.id);
        const points = generateGeodesicPath(
            route.origin.lat, route.origin.lng,
            route.destination.lat, route.destination.lng,
            100
        );
        const latLngs = points.map(p => L.latLng(p.lat, p.lng));

        if (!isActive) {
            // Background / alternative leg
            L.polyline(latLngs, {
                color: route.color,
                weight: 2.5,
                opacity: 0.12,
                dashArray: '4, 4',
                interactive: false
            }).addTo(manualLayers);

            // Directional arrow at midpoint
            const midIdx = Math.floor(points.length / 2);
            const midPoint = points[midIdx];
            const nextPoint = points[midIdx + 1];
            const bearing = getBearing(midPoint.lat, midPoint.lng, nextPoint.lat, nextPoint.lng);
            
            const arrowColor = route.soldOut ? '#ef4444' : route.color;
            const arrowOpacity = route.soldOut ? 0.75 : 0.2;
            const arrowSize = route.soldOut ? 12 : 10;

            L.marker([midPoint.lat, midPoint.lng], {
                icon: L.divIcon({
                    className: 'map-arrow-icon-wrapper',
                    html: `<div style="transform: rotate(${bearing}deg); width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                             <svg viewBox="0 0 24 24" width="${arrowSize}" height="${arrowSize}" fill="${arrowColor}" opacity="${arrowOpacity}">
                                  <polygon points="12,2 22,22 12,17 2,22" />
                             </svg>
                           </div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                }),
                interactive: false
            }).addTo(manualLayers);
        } else {
            // Background line (for active path contrast)
            L.polyline(latLngs, {
                color: route.color,
                weight: 2,
                opacity: 0.25,
                interactive: false
            }).addTo(manualLayers);

            // Active path (thick & glowing with direction gradient)
            drawGradientPolyline(points, route.color, 4, 0.85, manualLayers);

            // Directional arrow at midpoint
            const midIdx = Math.floor(points.length / 2);
            const midPoint = points[midIdx];
            const nextPoint = points[midIdx + 1];
            const bearing = getBearing(midPoint.lat, midPoint.lng, nextPoint.lat, nextPoint.lng);

            const arrowColor = route.soldOut ? '#ef4444' : route.color;
            const arrowOpacity = route.soldOut ? 0.95 : 0.85;

            L.marker([midPoint.lat, midPoint.lng], {
                icon: L.divIcon({
                    className: 'map-arrow-icon-wrapper',
                    html: `<div style="transform: rotate(${bearing}deg); width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                             <svg viewBox="0 0 24 24" width="12" height="12" fill="${arrowColor}" opacity="${arrowOpacity}">
                                 <polygon points="12,2 22,22 12,17 2,22" />
                             </svg>
                           </div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                }),
                interactive: false
            }).addTo(manualLayers);

            // Markers (only for active selected legs)
            L.marker([route.origin.lat, route.origin.lng], { icon: createStartIcon(route.color) })
                .addTo(manualLayers);

            L.marker([route.destination.lat, route.destination.lng], { icon: createEndIcon(route.color) })
                .addTo(manualLayers);
        }

        // Invisible wide path for popup interaction, drawn for ALL routes
        const flightPath = L.polyline(latLngs, {
            color: 'transparent',
            weight: 12,
            opacity: 0,
            interactive: true
        }).addTo(manualLayers);

        const depTimeStr = formatDateTime(new Date(route.departureTime));
        const arrTimeStr = formatDateTime(new Date(route.arrivalTime));
        flightPath.bindPopup(`
            <div style="font-family: 'Outfit', sans-serif;">
                <h4 style="margin: 0 0 6px 0; color: ${route.color}; font-size: 1.05rem;">Flight details</h4>
                <p style="margin: 4px 0; font-size: 0.85rem;"><strong>From:</strong> ${route.origin.name}</p>
                <p style="margin: 4px 0; font-size: 0.85rem;"><strong>To:</strong> ${route.destination.name}</p>
                <p style="margin: 4px 0; font-size: 0.85rem;"><strong>Price:</strong> <span style="color: var(--secondary); font-weight:600;">$${route.price}</span></p>
                <p style="margin: 4px 0; font-size: 0.85rem;"><strong>Departure:</strong> ${depTimeStr}</p>
                <p style="margin: 4px 0; font-size: 0.85rem;"><strong>Arrival:</strong> ${arrTimeStr}</p>
            </div>
        `, {
            closeButton: false,
            offset: L.point(0, -5)
        });

        // Trigger details popup on hover above the link
        flightPath.on('mouseover', function(e) {
            this.openPopup(e.latlng);
        });
        flightPath.on('mouseout', function() {
            this.closePopup();
        });
    });
}

function addRoute(origin, destination, departureTime, arrivalTime, price, color, link = null) {
    const route = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        origin,
        destination,
        departureTime: new Date(departureTime).getTime(),
        arrivalTime: new Date(arrivalTime).getTime(),
        price: parseFloat(price),
        color,
        link,
        soldOut: false,
        planeMarker: null
    };

    state.routes.push(route);
    state.routes.sort((a, b) => a.departureTime - b.departureTime);

    // Recalculate manual itineraries from DAG
    state.manualItineraries = findItineraries(state.routes);
    state.selectedManualItineraryIndex = 0;

    saveRoutesToLocalStorage();
    renderManualItinerariesList();
    renderRoutesList();
    drawRoutesOnMap();
    updateTimelineBounds();
}

function deleteRoute(id) {
    const routeIndex = state.routes.findIndex(r => r.id === id);
    if (routeIndex !== -1) {
        const route = state.routes[routeIndex];
        if (route.planeMarker) {
            planesLayerGroup.removeLayer(route.planeMarker);
        }
        state.routes.splice(routeIndex, 1);

        // Close form panel in case it was editing this route
        closeFormPanel();

        // Recalculate manual itineraries from DAG
        state.manualItineraries = findItineraries(state.routes);
        state.selectedManualItineraryIndex = 0;
        
        saveRoutesToLocalStorage();
        renderManualItinerariesList();
        renderRoutesList();
        drawRoutesOnMap();
        updateTimelineBounds();
        updateAirplanePositions();
    }
}

// --- Mode 2: Route Explorer Logic & UI ---

function getDistanceRad(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaPhi = toRad(lat2 - lat1);
    const deltaLambda = toRad(lng2 - lng1);

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateItineraries(origin, destination, startDateMs, targetDateMs, maxBudget) {
    const totalWindowMs = targetDateMs - startDateMs;
    const getFlightStats = (lat1, lng1, lat2, lng2) => {
        const dKm = getDistanceRad(lat1, lng1, lat2, lng2) * 6371;
        const hours = Math.max(1, Math.round(dKm / 800));
        const price = Math.max(80, Math.round(dKm * 0.075 + 40));
        return { hours, price };
    };

    const midLat = (origin.lat + destination.lat) / 2;
    const midLng = (origin.lng + destination.lng) / 2;

    const possibleHubs = HUBS.filter(h => {
        const dOrig = Math.abs(h.lat - origin.lat) + Math.abs(h.lng - origin.lng);
        const dDest = Math.abs(h.lat - destination.lat) + Math.abs(h.lng - destination.lng);
        return dOrig > 3 && dDest > 3;
    }).sort((a, b) => {
        const distA = Math.abs(a.lat - midLat) + Math.abs(a.lng - midLng);
        const distB = Math.abs(b.lat - midLat) + Math.abs(b.lng - midLng);
        return distA - distB;
    });

    const results = [];

    // --- OPTION 1: 1-Stop Explorer ---
    if (possibleHubs.length > 0) {
        const hub = possibleHubs[0];
        const stats1 = getFlightStats(origin.lat, origin.lng, hub.lat, hub.lng);
        const stats2 = getFlightStats(hub.lat, hub.lng, destination.lat, destination.lng);

        const totalFlightHrs = stats1.hours + stats2.hours;
        const totalFlightMs = totalFlightHrs * 3600 * 1000;
        
        const availableLayoverMs = totalWindowMs - totalFlightMs;
        if (availableLayoverMs > 12 * 3600 * 1000) {
            const layoverMs = Math.min(48 * 3600 * 1000, Math.max(24 * 3600 * 1000, availableLayoverMs * 0.6));
            
            const dep1 = startDateMs + 2 * 3600 * 1000;
            const arr1 = dep1 + stats1.hours * 3600 * 1000;
            const dep2 = arr1 + layoverMs;
            const arr2 = dep2 + stats2.hours * 3600 * 1000;

            const totalPrice = stats1.price + stats2.price;

            if (arr2 <= targetDateMs && totalPrice <= maxBudget) {
                results.push({
                    id: 'explorer-1stop',
                    title: 'The Balanced Stopover',
                    price: totalPrice,
                    type: '1-stop',
                    legs: [
                        { origin: { name: origin.name, code: getCityCode(origin.name), lat: origin.lat, lng: origin.lng }, destination: hub, departureTime: dep1, arrivalTime: arr1, price: stats1.price, color: '#6366f1' },
                        { origin: hub, destination: { name: destination.name, code: getCityCode(destination.name), lat: destination.lat, lng: destination.lng }, departureTime: dep2, arrivalTime: arr2, price: stats2.price, color: '#06b6d4' }
                    ],
                    layovers: [
                        { city: hub.name, code: hub.code, lat: hub.lat, lng: hub.lng, durationMs: layoverMs, startTime: arr1, endTime: dep2 }
                    ]
                });
            }
        }
    }

    // --- OPTION 2: 2-Stops Explorer ---
    if (possibleHubs.length > 1) {
        const hub1 = possibleHubs[0];
        const hub2 = possibleHubs.find(h => h.code !== hub1.code) || possibleHubs[1];

        const stats1 = getFlightStats(origin.lat, origin.lng, hub1.lat, hub1.lng);
        const stats2 = getFlightStats(hub1.lat, hub1.lng, hub2.lat, hub2.lng);
        const stats3 = getFlightStats(hub2.lat, hub2.lng, destination.lat, destination.lng);

        const totalFlightHrs = stats1.hours + stats2.hours + stats3.hours;
        const totalFlightMs = totalFlightHrs * 3600 * 1000;

        const availableLayoverMs = totalWindowMs - totalFlightMs;
        if (availableLayoverMs > 24 * 3600 * 1000) {
            const layoverMs = Math.min(48 * 3600 * 1000, availableLayoverMs / 2);

            const dep1 = startDateMs + 2 * 3600 * 1000;
            const arr1 = dep1 + stats1.hours * 3600 * 1000;
            
            const dep2 = arr1 + layoverMs;
            const arr2 = dep2 + stats2.hours * 3600 * 1000;

            const dep3 = arr2 + layoverMs;
            const arr3 = dep3 + stats3.hours * 3600 * 1000;

            const totalPrice = Math.round((stats1.price + stats2.price + stats3.price) * 0.9);

            if (arr3 <= targetDateMs && totalPrice <= maxBudget) {
                results.push({
                    id: 'explorer-2stop',
                    title: 'The Grand Wanderer',
                    price: totalPrice,
                    type: '2-stops',
                    legs: [
                        { origin: { name: origin.name, code: getCityCode(origin.name), lat: origin.lat, lng: origin.lng }, destination: hub1, departureTime: dep1, arrivalTime: arr1, price: stats1.price, color: '#6366f1' },
                        { origin: hub1, destination: hub2, departureTime: dep2, arrivalTime: arr2, price: stats2.price, color: '#ec4899' },
                        { origin: hub2, destination: { name: destination.name, code: getCityCode(destination.name), lat: destination.lat, lng: destination.lng }, departureTime: dep3, arrivalTime: arr3, price: stats3.price, color: '#10b981' }
                    ],
                    layovers: [
                        { city: hub1.name, code: hub1.code, lat: hub1.lat, lng: hub1.lng, durationMs: layoverMs, startTime: arr1, endTime: dep2 },
                        { city: hub2.name, code: hub2.code, lat: hub2.lat, lng: hub2.lng, durationMs: layoverMs, startTime: arr2, endTime: dep3 }
                    ]
                });
            }
        }
    }

    // --- OPTION 3: 1-Stop Extended ---
    if (possibleHubs.length > 0) {
        const hub = possibleHubs[1] || possibleHubs[0];
        const stats1 = getFlightStats(origin.lat, origin.lng, hub.lat, hub.lng);
        const stats2 = getFlightStats(hub.lat, hub.lng, destination.lat, destination.lng);

        const totalFlightHrs = stats1.hours + stats2.hours;
        const totalFlightMs = totalFlightHrs * 3600 * 1000;
        
        const availableLayoverMs = totalWindowMs - totalFlightMs;
        if (availableLayoverMs > 36 * 3600 * 1000) {
            const layoverMs = Math.min(72 * 3600 * 1000, availableLayoverMs * 0.8);
            
            const dep1 = startDateMs + 4 * 3600 * 1000;
            const arr1 = dep1 + stats1.hours * 3600 * 1000;
            const dep2 = arr1 + layoverMs;
            const arr2 = dep2 + stats2.hours * 3600 * 1000;

            const totalPrice = Math.round((stats1.price + stats2.price) * 1.05);

            if (arr2 <= targetDateMs && totalPrice <= maxBudget) {
                results.push({
                    id: 'explorer-extended',
                    title: 'The Cultural Immersion',
                    price: totalPrice,
                    type: '1-stop long',
                    legs: [
                        { origin: { name: origin.name, code: getCityCode(origin.name), lat: origin.lat, lng: origin.lng }, destination: hub, departureTime: dep1, arrivalTime: arr1, price: stats1.price, color: '#a855f7' },
                        { origin: hub, destination: { name: destination.name, code: getCityCode(destination.name), lat: destination.lat, lng: destination.lng }, departureTime: dep2, arrivalTime: arr2, price: stats2.price, color: '#f59e0b' }
                    ],
                    layovers: [
                        { city: hub.name, code: hub.code, lat: hub.lat, lng: hub.lng, durationMs: layoverMs, startTime: arr1, endTime: dep2 }
                    ]
                });
            }
        }
    }

    return results;
}

function renderItinerariesList() {
    const container = document.getElementById('itineraries-list');
    const countSpan = document.getElementById('itinerary-count');

    countSpan.textContent = `${state.itineraries.length} option${state.itineraries.length === 1 ? '' : 's'}`;

    if (state.itineraries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="sparkles" style="width: 32px; height: 32px;"></i>
                <p>No stopover options fit your parameters.<br>Try expanding your dates or budget!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';

    state.itineraries.forEach(itin => {
        const totalDurationDays = ((itin.legs[itin.legs.length - 1].arrivalTime - itin.legs[0].departureTime) / (1000 * 60 * 60 * 24)).toFixed(1);
        const stopsCount = itin.legs.length - 1;
        const startCode = itin.legs[0].origin.code;
        const endCode = itin.legs[itin.legs.length - 1].destination.code;

        const isSelected = state.selectedItinerary && state.selectedItinerary.id === itin.id;

        const card = document.createElement('div');
        card.className = `itinerary-card ${isSelected ? 'selected' : ''}`;
        
        let visualHTML = `<div class="itinerary-visual-node" data-label="${startCode}"></div>`;
        itin.legs.forEach((leg, idx) => {
            const nextLeg = itin.legs[idx + 1];
            let layoverLabel = '';
            if (nextLeg) {
                const layoverHrs = (nextLeg.departureTime - leg.arrivalTime) / (3600 * 1000);
                const layoverDays = (layoverHrs / 24).toFixed(0);
                layoverLabel = `<div class="itinerary-visual-layover-label">${layoverDays}d stay</div>`;
            }
            visualHTML += `
                <div class="itinerary-visual-line flight">${layoverLabel}</div>
                <div class="itinerary-visual-node ${nextLeg ? 'hub' : ''}" data-label="${nextLeg ? nextLeg.origin.code : endCode}"></div>
            `;
        });

        let stopsSummary = '';
        itin.layovers.forEach(lay => {
            const stayHrs = (lay.durationMs / (3600 * 1000)).toFixed(0);
            const stayDays = (stayHrs / 24).toFixed(1);
            stopsSummary += `
                <div class="itinerary-stop-row">
                    <span class="stop-name">${lay.city.split(',')[0]}</span>
                    <span class="layover-time"><i data-lucide="camera" style="width:12px; height:12px;"></i> ${stayDays} Days stay</span>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="itinerary-card-header">
                <span class="itinerary-title">
                    <i data-lucide="sparkles" style="color: var(--primary); width:16px; height:16px;"></i>
                    ${itin.title}
                </span>
                <span class="itinerary-stops-badge">${stopsCount} stop${stopsCount === 1 ? '' : 's'}</span>
            </div>

            <div class="itinerary-timeline-visual">
                ${visualHTML}
            </div>

            <div class="itinerary-stops-list">
                ${stopsSummary}
            </div>

            <div class="itinerary-footer">
                <span class="itinerary-price">$${itin.price}</span>
                <span class="itinerary-duration">
                    <i data-lucide="clock" style="width:14px; height:14px;"></i>
                    Total: ${totalDurationDays} days
                </span>
            </div>
        `;

        card.addEventListener('click', () => {
            state.selectedItinerary = itin;
            renderItinerariesList();
            drawSelectedItineraryOnMap();
            updateTimelineBounds();
            
            const coords = [
                [itin.legs[0].origin.lat, itin.legs[0].origin.lng]
            ];
            itin.legs.forEach(leg => {
                coords.push([leg.destination.lat, leg.destination.lng]);
            });
            map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
        });

        container.appendChild(card);
    });

    lucide.createIcons();
}

function drawSelectedItineraryOnMap() {
    explorerLayers.clearLayers();
    if (state.activeMode !== 'explorer' || !state.selectedItinerary) return;

    const itin = state.selectedItinerary;

    itin.legs.forEach((leg, idx) => {
        const points = generateGeodesicPath(
            leg.origin.lat, leg.origin.lng,
            leg.destination.lat, leg.destination.lng,
            100
        );
        const latLngs = points.map(p => L.latLng(p.lat, p.lng));

        L.polyline(latLngs, {
            color: leg.color,
            weight: 2.5,
            opacity: 0.15,
            interactive: false
        }).addTo(explorerLayers);

        // Active path (thick & glowing with direction gradient)
        drawGradientPolyline(points, leg.color, 4, 0.85, explorerLayers);

        // Invisible wide path for popup interaction
        const flightPath = L.polyline(latLngs, {
            color: 'transparent',
            weight: 12,
            opacity: 0,
            interactive: true
        }).addTo(explorerLayers);

        // Directional arrow at midpoint
        const midIdx = Math.floor(points.length / 2);
        const midPoint = points[midIdx];
        const nextPoint = points[midIdx + 1];
        const bearing = getBearing(midPoint.lat, midPoint.lng, nextPoint.lat, nextPoint.lng);
        L.marker([midPoint.lat, midPoint.lng], {
            icon: L.divIcon({
                className: 'map-arrow-icon-wrapper',
                html: `<div style="transform: rotate(${bearing}deg); width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                         <svg viewBox="0 0 24 24" width="12" height="12" fill="${leg.color}" opacity="0.85">
                             <polygon points="12,2 22,22 12,17 2,22" />
                         </svg>
                       </div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            }),
            interactive: false
        }).addTo(explorerLayers);

        const depTimeStr = formatDateTime(new Date(leg.departureTime));
        const arrTimeStr = formatDateTime(new Date(leg.arrivalTime));
        
        flightPath.bindPopup(`
            <div style="font-family: 'Outfit', sans-serif;">
                <h4 style="margin: 0 0 4px 0; color: ${leg.color};">Flight Leg ${idx + 1}</h4>
                <p style="margin: 2px 0; font-size: 0.8rem;"><strong>From:</strong> ${leg.origin.name.split(',')[0]} (${leg.origin.code})</p>
                <p style="margin: 2px 0; font-size: 0.8rem;"><strong>To:</strong> ${leg.destination.name.split(',')[0]} (${leg.destination.code})</p>
                <p style="margin: 2px 0; font-size: 0.8rem;"><strong>Departure:</strong> ${depTimeStr}</p>
                <p style="margin: 2px 0; font-size: 0.8rem;"><strong>Arrival:</strong> ${arrTimeStr}</p>
            </div>
        `);
    });

    L.marker([itin.legs[0].origin.lat, itin.legs[0].origin.lng], { icon: createStartIcon(itin.legs[0].color) })
        .addTo(explorerLayers)
        .bindPopup(`<strong>Origin:</strong> ${itin.legs[0].origin.name}`);

    const finalLeg = itin.legs[itin.legs.length - 1];
    L.marker([finalLeg.destination.lat, finalLeg.destination.lng], { icon: createEndIcon(finalLeg.color) })
        .addTo(explorerLayers)
        .bindPopup(`<strong>Destination:</strong> ${finalLeg.destination.name}`);

    itin.layovers.forEach(lay => {
        const stayDays = (lay.durationMs / (24 * 3600 * 1000)).toFixed(1);
        L.marker([lay.lat, lay.lng], { icon: createLayoverIcon() })
            .addTo(explorerLayers)
            .bindPopup(`
                <div style="font-family: 'Outfit', sans-serif;">
                    <h4 style="margin: 0 0 4px 0; color: var(--warning);">Stopover Stay</h4>
                    <p style="margin: 2px 0; font-size: 0.8rem;"><strong>City:</strong> ${lay.city}</p>
                    <p style="margin: 2px 0; font-size: 0.8rem;"><strong>Duration:</strong> ${stayDays} Days</p>
                </div>
            `);
    });
}

// --- Timeline Controls Setup & Synchronizer ---
function updateTimelineBounds() {
    const slider = document.getElementById('timeline-slider');
    const startLabel = document.getElementById('timeline-start-label');
    const endLabel = document.getElementById('timeline-end-label');
    const currentLabel = document.getElementById('timeline-current-label');

    const resetTimeline = () => {
        slider.disabled = true;
        slider.value = 0;
        startLabel.textContent = 'Start';
        endLabel.textContent = 'End';
        currentLabel.textContent = 'Timeline Inactive';
        
        const scaleOverlay = document.getElementById('timeline-scale-overlay');
        if (scaleOverlay) scaleOverlay.innerHTML = '';

        if (state.playback.isPlaying) togglePlayPause();
    };

    if (state.activeMode === 'manual') {
        const activeItin = state.manualItineraries[state.selectedManualItineraryIndex];
        if (!activeItin || activeItin.legs.length === 0) {
            resetTimeline();
            return;
        }
        state.playback.minTime = activeItin.legs[0].departureTime;
        state.playback.maxTime = activeItin.legs[activeItin.legs.length - 1].arrivalTime;
    } else {
        if (!state.selectedItinerary) {
            resetTimeline();
            return;
        }
        const itin = state.selectedItinerary;
        state.playback.minTime = itin.legs[0].departureTime;
        state.playback.maxTime = itin.legs[itin.legs.length - 1].arrivalTime;
    }

    slider.disabled = false;
    slider.min = state.playback.minTime;
    slider.max = state.playback.maxTime;

    if (state.playback.currentTime < state.playback.minTime || state.playback.currentTime > state.playback.maxTime) {
        state.playback.currentTime = state.playback.minTime;
    }

    slider.value = state.playback.currentTime;

    startLabel.textContent = formatDateTime(new Date(state.playback.minTime));
    endLabel.textContent = formatDateTime(new Date(state.playback.maxTime));
    currentLabel.textContent = formatDateTime(new Date(state.playback.currentTime));

    renderTimelineScale();
}

function renderTimelineScale() {
    const scaleOverlay = document.getElementById('timeline-scale-overlay');
    if (!scaleOverlay) return;

    scaleOverlay.innerHTML = '';

    const minTime = state.playback.minTime;
    const maxTime = state.playback.maxTime;
    const span = maxTime - minTime;

    if (span <= 0) return;

    // --- 1. RENDER DAYS AND WEEKENDS HIGHLIGHTS ---
    const startDay = new Date(minTime);
    startDay.setHours(0, 0, 0, 0);
    
    const endDay = new Date(maxTime);
    endDay.setHours(23, 59, 59, 999);
    
    const oneDayMs = 24 * 3600 * 1000;

    for (let time = startDay.getTime(); time <= endDay.getTime(); time += oneDayMs) {
        const d = new Date(time);
        const pct = ((time - minTime) / span) * 100;
        
        if (pct >= 0 && pct <= 100) {
            const tick = document.createElement('div');
            tick.className = 'timeline-day-tick';
            tick.style.left = `${pct}%`;
            
            const label = document.createElement('div');
            label.className = 'timeline-day-label';
            label.style.left = `${pct}%`;
            label.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            scaleOverlay.appendChild(tick);
            scaleOverlay.appendChild(label);
        }

        const dayOfWeek = d.getDay();
        if (dayOfWeek === 6) {
            const weekendStart = Math.max(minTime, time);
            const weekendEnd = Math.min(maxTime, time + 2 * oneDayMs);
            
            const startPct = ((weekendStart - minTime) / span) * 100;
            const endPct = ((weekendEnd - minTime) / span) * 100;
            const widthPct = endPct - startPct;
            
            if (widthPct > 0) {
                const wkndBlock = document.createElement('div');
                wkndBlock.className = 'timeline-weekend-block';
                wkndBlock.style.left = `${startPct}%`;
                wkndBlock.style.width = `${widthPct}%`;
                wkndBlock.textContent = 'WKND';
                scaleOverlay.appendChild(wkndBlock);
            }
        } else if (dayOfWeek === 0 && time === startDay.getTime()) {
            const weekendStart = minTime;
            const weekendEnd = Math.min(maxTime, time + oneDayMs);
            
            const startPct = ((weekendStart - minTime) / span) * 100;
            const endPct = ((weekendEnd - minTime) / span) * 100;
            const widthPct = endPct - startPct;
            
            if (widthPct > 0) {
                const wkndBlock = document.createElement('div');
                wkndBlock.className = 'timeline-weekend-block';
                wkndBlock.style.left = `${startPct}%`;
                wkndBlock.style.width = `${widthPct}%`;
                wkndBlock.textContent = 'WKND';
                scaleOverlay.appendChild(wkndBlock);
            }
        }
    }

    // --- 2. RENDER LAYOVER STAY BLOCKS ---
    const layovers = [];
    if (state.activeMode === 'manual') {
        const activeItin = state.manualItineraries[state.selectedManualItineraryIndex];
        if (activeItin) {
            activeItin.layovers.forEach(lay => {
                layovers.push({
                    city: lay.city,
                    code: lay.code,
                    start: lay.startTime,
                    end: lay.endTime
                });
            });
        }
    } else if (state.selectedItinerary) {
        state.selectedItinerary.layovers.forEach(lay => {
            layovers.push({
                city: lay.city.split(',')[0],
                code: lay.code,
                start: lay.startTime,
                end: lay.endTime
            });
        });
    }

    layovers.forEach(lay => {
        const startPct = ((lay.start - minTime) / span) * 100;
        const endPct = ((lay.end - minTime) / span) * 100;
        const widthPct = endPct - startPct;

        if (widthPct > 0 && startPct >= 0 && endPct <= 100) {
            const stayBlock = document.createElement('div');
            stayBlock.className = 'timeline-stay-block';
            stayBlock.style.left = `${startPct}%`;
            stayBlock.style.width = `${widthPct}%`;

            const days = ((lay.end - lay.start) / (24 * 3600 * 1000)).toFixed(1);
            stayBlock.setAttribute('data-tooltip', `Stay in ${lay.city}: ${days} days`);

            scaleOverlay.appendChild(stayBlock);
        }
    });

    // --- 3. RENDER CITY TAKEOFF & LANDING MILESTONES (WITH OVERLAP DETECTION) ---
    const events = [];
    if (state.activeMode === 'manual') {
        const activeItin = state.manualItineraries[state.selectedManualItineraryIndex];
        if (activeItin) {
            activeItin.legs.forEach(r => {
                events.push({ code: getCityCode(r.origin.name), time: r.departureTime, type: 'dep', color: r.color });
                events.push({ code: getCityCode(r.destination.name), time: r.arrivalTime, type: 'arr', color: r.color });
            });
        }
    } else if (state.selectedItinerary) {
        state.selectedItinerary.legs.forEach(l => {
            events.push({ code: l.origin.code, time: l.departureTime, type: 'dep', color: l.color });
            events.push({ code: l.destination.code, time: l.arrivalTime, type: 'arr', color: l.color });
        });
    }

    // Sort chronologically
    events.sort((a, b) => a.time - b.time);

    let lastDepPct = -100;
    let lastArrPct = -100;
    let alternateDep = false;
    let alternateArr = false;

    events.forEach(evt => {
        const pct = ((evt.time - minTime) / span) * 100;
        if (pct >= 0 && pct <= 100) {
            const isDep = evt.type === 'dep';
            let translateY, hoverTranslateY;

            if (isDep) {
                // Departures alternate above the track
                if (Math.abs(pct - lastDepPct) < 6) {
                    alternateDep = !alternateDep;
                } else {
                    alternateDep = false;
                }
                lastDepPct = pct;
                translateY = alternateDep ? '-38px' : '-20px';
                hoverTranslateY = alternateDep ? '-40px' : '-22px';
            } else {
                // Arrivals alternate below the track
                if (Math.abs(pct - lastArrPct) < 6) {
                    alternateArr = !alternateArr;
                } else {
                    alternateArr = false;
                }
                lastArrPct = pct;
                translateY = alternateArr ? '34px' : '16px';
                hoverTranslateY = alternateArr ? '36px' : '18px';
            }

            const node = document.createElement('div');
            node.className = 'timeline-city-node';
            node.style.left = `${pct}%`;
            node.style.setProperty('--node-color', evt.color);
            node.style.setProperty('--translate-y', translateY);
            node.style.setProperty('--hover-translate-y', hoverTranslateY);
            
            node.innerHTML = `
                <div class="timeline-city-label" style="--node-color: ${evt.color}">
                    ${evt.code}
                </div>
                <div class="timeline-city-dot" style="--node-color: ${evt.color}"></div>
            `;
            
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                state.playback.currentTime = evt.time;
                document.getElementById('timeline-slider').value = evt.time;
                document.getElementById('timeline-current-label').textContent = formatDateTime(new Date(evt.time));
                updateAirplanePositions();
            });
            
            scaleOverlay.appendChild(node);
        }
    });

    // --- 4. RENDER FLIGHT ARCS (DASHED BEZIER CURVES CONNECTING DEP & ARR) ---
    const flights = [];
    if (state.activeMode === 'manual') {
        const activeItin = state.manualItineraries[state.selectedManualItineraryIndex];
        if (activeItin) {
            activeItin.legs.forEach(r => {
                flights.push({ depTime: r.departureTime, arrTime: r.arrivalTime, color: r.color });
            });
        }
    } else if (state.selectedItinerary) {
        state.selectedItinerary.legs.forEach(l => {
            flights.push({ depTime: l.departureTime, arrTime: l.arrivalTime, color: l.color });
        });
    }

    if (flights.length > 0) {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.position = "absolute";
        svg.style.left = "0";
        svg.style.top = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.pointerEvents = "none";
        svg.style.overflow = "visible";
        svg.style.zIndex = "2";

        flights.forEach(f => {
            const depPct = ((f.depTime - minTime) / span) * 100;
            const arrPct = ((f.arrTime - minTime) / span) * 100;

            if (depPct >= 0 && depPct <= 100 && arrPct >= 0 && arrPct <= 100) {
                const path = document.createElementNS(svgNS, "path");
                const midX = (depPct + arrPct) / 2;
                
                // Height of curve is proportional to flight duration but bounded
                const height = Math.min(30, (arrPct - depPct) * 0.75);
                const ctrlY = 39 - height; // baseline is Y=39 (middle of the dots)

                const d = `M ${depPct} 39 Q ${midX} ${ctrlY} ${arrPct} 39`;
                path.setAttribute("d", d);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", f.color);
                path.setAttribute("stroke-width", "1.5");
                path.setAttribute("stroke-dasharray", "4 4");
                path.setAttribute("vector-effect", "non-scaling-stroke");
                svg.appendChild(path);
            }
        });
        scaleOverlay.appendChild(svg);
    }
}

function updateAirplanePositions() {
    const now = state.playback.currentTime;
    planesLayerGroup.clearLayers();
    const currentLabel = document.getElementById('timeline-current-label');

    if (state.activeMode === 'manual') {
        const activeItin = state.manualItineraries[state.selectedManualItineraryIndex];
        if (!activeItin) return;

        let flightActive = false;
        
        activeItin.legs.forEach((route, idx) => {
            const dep = route.departureTime;
            const arr = route.arrivalTime;

            if (now >= dep && now <= arr && !route.soldOut) {
                flightActive = true;
                const fraction = (now - dep) / (arr - dep);
                const pos = interpolateGeodesic(
                    route.origin.lat, route.origin.lng,
                    route.destination.lat, route.destination.lng,
                    fraction
                );

                const nextFraction = Math.min(1.0, fraction + 0.002);
                const nextPos = interpolateGeodesic(
                    route.origin.lat, route.origin.lng,
                    route.destination.lat, route.destination.lng,
                    nextFraction
                );
                const bearing = getBearing(pos.lat, pos.lng, nextPos.lat, nextPos.lng);

                L.marker([pos.lat, pos.lng], {
                    icon: createPlaneIcon(route.color, bearing),
                    zIndexOffset: 1000
                }).addTo(planesLayerGroup)
                  .bindPopup(`<strong>Flight:</strong> In air to ${route.destination.name.split(',')[0]}`);

                const travelTimeStr = formatDateTime(new Date(now));
                const destCode = getCityCode(route.destination.name);
                currentLabel.textContent = `${travelTimeStr} (Flight ${idx + 1}/${activeItin.legs.length} to ${destCode})`;
            }
        });

        if (flightActive) return;

        // Check if staying in a city in manual mode
        activeItin.layovers.forEach(lay => {
            if (now >= lay.startTime && now <= lay.endTime) {
                L.marker([lay.lat, lay.lng], {
                    icon: createExploringIcon(),
                    zIndexOffset: 1000
                }).addTo(planesLayerGroup)
                  .bindPopup(`
                      <div style="font-family: 'Outfit', sans-serif;">
                          <h4 style="margin:0 0 4px 0; color: var(--warning);">Sightseeing Stay</h4>
                          <strong>Exploring:</strong> ${lay.city}<br>
                          <em>Take a photo! Next flight departs soon.</em>
                      </div>
                  `);

                const elapsed = now - lay.startTime;
                const totalStay = lay.endTime - lay.startTime;
                const dayX = Math.floor(elapsed / (24 * 3600 * 1000)) + 1;
                const totalDays = Math.round(totalStay / (24 * 3600 * 1000));
                
                const timeStr = formatDateTime(new Date(now));
                currentLabel.textContent = `${timeStr} (Exploring ${lay.code}: Day ${dayX}/${totalDays})`;
            }
        });
    } else {
        if (!state.selectedItinerary) return;

        const itin = state.selectedItinerary;
        let flightActive = false;
        
        itin.legs.forEach((leg, idx) => {
            if (now >= leg.departureTime && now <= leg.arrivalTime) {
                flightActive = true;
                const fraction = (now - leg.departureTime) / (leg.arrivalTime - leg.departureTime);
                const pos = interpolateGeodesic(
                    leg.origin.lat, leg.origin.lng,
                    leg.destination.lat, leg.destination.lng,
                    fraction
                );

                const nextFraction = Math.min(1.0, fraction + 0.002);
                const nextPos = interpolateGeodesic(
                    leg.origin.lat, leg.origin.lng,
                    leg.destination.lat, leg.destination.lng,
                    nextFraction
                );
                const bearing = getBearing(pos.lat, pos.lng, nextPos.lat, nextPos.lng);

                L.marker([pos.lat, pos.lng], {
                    icon: createPlaneIcon(leg.color, bearing),
                    zIndexOffset: 1000
                }).addTo(planesLayerGroup)
                  .bindPopup(`<strong>Leg ${idx + 1}:</strong> Flight to ${leg.destination.name.split(',')[0]} (${leg.destination.code})`);

                const travelTimeStr = formatDateTime(new Date(now));
                currentLabel.textContent = `${travelTimeStr} (Flight ${idx + 1}/${itin.legs.length})`;
            }
        });

        if (flightActive) return;

        itin.layovers.forEach(lay => {
            if (now >= lay.startTime && now <= lay.endTime) {
                L.marker([lay.lat, lay.lng], {
                    icon: createExploringIcon(),
                    zIndexOffset: 1000
                }).addTo(planesLayerGroup)
                  .bindPopup(`
                      <div style="font-family: 'Outfit', sans-serif;">
                          <h4 style="margin:0 0 4px 0; color: var(--warning);">Sightseeing Stay</h4>
                          <strong>Exploring:</strong> ${lay.city.split(',')[0]}<br>
                          <em>Take a photo! Next flight departs soon.</em>
                      </div>
                  `);

                const elapsed = now - lay.startTime;
                const totalStay = lay.endTime - lay.startTime;
                const dayX = Math.floor(elapsed / (24 * 3600 * 1000)) + 1;
                const totalDays = Math.round(totalStay / (24 * 3600 * 1000));
                
                const timeStr = formatDateTime(new Date(now));
                currentLabel.textContent = `${timeStr} (Exploring ${lay.code}: Day ${dayX}/${totalDays})`;
            }
        });
    }
}

// --- Animation Loop ---
function animationTick(timestamp) {
    if (!state.playback.isPlaying) return;

    if (!state.playback.lastTickTime) {
        state.playback.lastTickTime = timestamp;
    }

    const elapsedRealMs = timestamp - state.playback.lastTickTime;
    state.playback.lastTickTime = timestamp;

    const simulatedDeltaMs = elapsedRealMs * state.playback.speed;
    state.playback.currentTime += simulatedDeltaMs;

    if (state.playback.currentTime >= state.playback.maxTime) {
        state.playback.currentTime = state.playback.minTime;
    }

    const slider = document.getElementById('timeline-slider');
    slider.value = state.playback.currentTime;
    
    document.getElementById('timeline-current-label').textContent = formatDateTime(new Date(state.playback.currentTime));

    updateAirplanePositions();

    state.playback.animationFrameId = requestAnimationFrame(animationTick);
}

function togglePlayPause() {
    const hasData = state.activeMode === 'manual' ? state.routes.length > 0 : state.selectedItinerary !== null;
    if (!hasData) return;

    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');

    state.playback.isPlaying = !state.playback.isPlaying;

    if (state.playback.isPlaying) {
        if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
        if (playPauseBtn) {
            playPauseBtn.title = 'Pause Animation';
            playPauseBtn.style.background = 'var(--danger)';
            playPauseBtn.style.boxShadow = '0 4px 12px var(--danger-glow)';
        }
        
        state.playback.lastTickTime = 0;
        state.playback.animationFrameId = requestAnimationFrame(animationTick);
    } else {
        if (playIcon) playIcon.setAttribute('data-lucide', 'play');
        if (playPauseBtn) {
            playPauseBtn.title = 'Play Animation';
            playPauseBtn.style.background = 'var(--primary)';
            playPauseBtn.style.boxShadow = '0 4px 12px var(--primary-glow)';
        }

        if (state.playback.animationFrameId) {
            cancelAnimationFrame(state.playback.animationFrameId);
            state.playback.animationFrameId = null;
        }
    }
    if (playPauseBtn || playIcon) {
        lucide.createIcons();
    }
}

// --- Event Handlers & Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Toggle Left Panel fold/unfold state (and auto-close edit panel if collapsed)
    const leftPanel = document.getElementById('left-panel');
    const leftToggleBtn = document.getElementById('left-panel-toggle');
    if (leftPanel && leftToggleBtn) {
        leftToggleBtn.addEventListener('click', () => {
            const isCollapsed = leftPanel.classList.toggle('collapsed');
            if (isCollapsed) {
                closeEditPanel();
            }
        });
    }

    // Edit Panel Close Button
    const btnCloseEdit = document.getElementById('btn-close-edit-panel');
    if (btnCloseEdit) {
        btnCloseEdit.addEventListener('click', () => {
            closeEditPanel();
        });
    }

    // Form Panel Close Button
    const btnCloseForm = document.getElementById('btn-close-form-panel');
    if (btnCloseForm) {
        btnCloseForm.addEventListener('click', () => {
            closeFormPanel();
        });
    }

    // Add Flight Leg Left Button
    const btnAddLegLeft = document.getElementById('btn-add-leg-left');
    if (btnAddLegLeft) {
        btnAddLegLeft.addEventListener('click', () => {
            showLegForm(null);
        });
    }

    // Setup autocompletes
    setupAutocomplete('origin-input', 'origin-suggestions');
    setupAutocomplete('destination-input', 'destination-suggestions');

    // Make calendar icons in front clickable to open picker
    const setupClickableCalendars = () => {
        const triggers = document.querySelectorAll('.calendar-trigger');
        triggers.forEach(icon => {
            const container = icon.closest('.input-container');
            const input = container ? container.querySelector('input[type="datetime-local"]') : null;
            if (input) {
                icon.addEventListener('click', () => {
                    try {
                        input.showPicker();
                    } catch (err) {
                        input.focus();
                    }
                });
            }
        });
    };
    setupClickableCalendars();

    // --- Skyscanner Link Importer Event ---
    const importInput = document.getElementById('link-import-input');
    const btnImport = document.getElementById('btn-import-link');

    btnImport.addEventListener('click', async () => {
        const urlVal = importInput.value.trim();
        if (!urlVal) {
            alert("Please paste a Skyscanner flight search URL first.");
            return;
        }

        btnImport.disabled = true;
        const originalText = btnImport.innerHTML;
        btnImport.innerHTML = `<i data-lucide="loader" class="animate-spin" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Parsing Link...`;
        lucide.createIcons();

        try {
            const parsed = parseSkyscannerLink(urlVal);
            if (!parsed) {
                alert("Could not parse the Skyscanner link. Ensure it matches the standard flight details URL structure.");
                return;
            }

            const originData = await getAirportCoords(parsed.originCode);
            const destData = await getAirportCoords(parsed.destCode);

            if (!originData || !destData) {
                alert(`Error: Coordinates for airport ${parsed.originCode} or ${parsed.destCode} could not be resolved.`);
                return;
            }

            const colors = ["#6366f1", "#10b981", "#ec4899", "#f59e0b", "#06b6d4", "#a855f7"];
            const color = colors[state.routes.length % colors.length];

            addRoute(
                originData,
                destData,
                parsed.departureTime,
                parsed.arrivalTime,
                120, // default price
                color,
                urlVal
            );

            importInput.value = '';
            renderItineraryDetails();
            closeFormPanel();
        } catch (err) {
            console.error(err);
            alert("An error occurred while importing the Skyscanner link.");
        } finally {
            btnImport.disabled = false;
            btnImport.innerHTML = originalText;
            lucide.createIcons();
        }
    });

function findAirportInDB(query) {
    const q = query.trim().toUpperCase();
    if (AIRPORT_DB[q]) {
        return { name: AIRPORT_DB[q].name, lat: AIRPORT_DB[q].lat, lng: AIRPORT_DB[q].lng };
    }
    // Search by name containing query or matching code
    for (const code in AIRPORT_DB) {
        const airport = AIRPORT_DB[code];
        if (code === q || airport.name.toUpperCase().includes(q)) {
            return { name: airport.name, lat: airport.lat, lng: airport.lng };
        }
    }
    return null;
}

    // --- Mode 1 Form Submit ---
    const routeForm = document.getElementById('route-form');
    routeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const originInput = document.getElementById('origin-input');
        const destInput = document.getElementById('destination-input');
        const depTimeInput = document.getElementById('departure-time');
        const arrTimeInput = document.getElementById('arrival-time');
        const priceInput = document.getElementById('route-price');
        const colorInput = document.getElementById('route-color');
        const linkInput = document.getElementById('route-link');

        let originLat = parseFloat(originInput.dataset.lat);
        let originLng = parseFloat(originInput.dataset.lng);
        let originName = originInput.value.trim();

        let destLat = parseFloat(destInput.dataset.lat);
        let destLng = parseFloat(destInput.dataset.lng);
        let destName = destInput.value.trim();

        // Helper to resolve location from input value
        const resolveLocation = async (inputVal, datasetLat, datasetLng) => {
            let lat = parseFloat(datasetLat);
            let lng = parseFloat(datasetLng);
            let name = inputVal;

            if (isNaN(lat) || isNaN(lng)) {
                // Try database lookup first
                const dbMatch = findAirportInDB(inputVal);
                if (dbMatch) {
                    return dbMatch;
                }
                // Try Nominatim API lookup as fallback
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inputVal)}+airport&limit=1`, {
                        headers: { 'Accept-Language': 'en' }
                    });
                    const data = await response.json();
                    if (data && data.length > 0) {
                        return {
                            name: `${inputVal} Airport, ${data[0].display_name.split(',')[1] || ''}`,
                            lat: parseFloat(data[0].lat),
                            lng: parseFloat(data[0].lon)
                        };
                    }
                } catch (err) {
                    console.error("Nominatim lookup failed during submit:", inputVal, err);
                }
                return null;
            }
            return { name, lat, lng };
        };

        const resolvedOrigin = await resolveLocation(originName, originInput.dataset.lat, originInput.dataset.lng);
        const resolvedDest = await resolveLocation(destName, destInput.dataset.lat, destInput.dataset.lng);

        if (!resolvedOrigin || !resolvedDest) {
            alert('Please select valid locations or enter known airport codes.');
            return;
        }

        const depMs = new Date(depTimeInput.value).getTime();
        const arrMs = new Date(arrTimeInput.value).getTime();

        if (isNaN(depMs) || isNaN(arrMs)) {
            alert('Error: Please enter valid departure and arrival dates.');
            return;
        }

        if (arrMs <= depMs) {
            alert('Error: Arrival time must be after departure time.');
            return;
        }

        const linkVal = linkInput ? linkInput.value.trim() : '';

        if (state.editingLegId) {
            // Edit existing route leg
            const route = state.routes.find(r => r.id === state.editingLegId);
            if (route) {
                route.origin = resolvedOrigin;
                route.destination = resolvedDest;
                route.departureTime = depMs;
                route.arrivalTime = arrMs;
                route.price = parseFloat(priceInput.value) || 0;
                route.color = colorInput.value;
                route.link = linkVal;

                state.routes.sort((a, b) => a.departureTime - b.departureTime);
                state.manualItineraries = findItineraries(state.routes);
                
                if (state.selectedManualItineraryIndex >= state.manualItineraries.length) {
                    state.selectedManualItineraryIndex = 0;
                }

                saveRoutesToLocalStorage();
                renderManualItinerariesList();
                renderItineraryDetails();
                drawRoutesOnMap();
                updateTimelineBounds();
                updateAirplanePositions();
            }
            state.editingLegId = null;
        } else {
            // Add new route leg
            addRoute(
                resolvedOrigin,
                resolvedDest,
                depMs,
                arrMs,
                parseFloat(priceInput.value) || 0,
                colorInput.value,
                linkVal
            );
            renderItineraryDetails();
        }

        routeForm.reset();
        delete originInput.dataset.lat;
        delete originInput.dataset.lng;
        delete originInput.dataset.name;
        delete destInput.dataset.lat;
        delete destInput.dataset.lng;
        delete destInput.dataset.name;
        closeFormPanel();
    });



    // --- Timeline Controls Scrubber ---
    const slider = document.getElementById('timeline-slider');
    const playPauseBtn = document.getElementById('play-pause-btn');

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }

    // Speed Selector Pill Segments Control
    const speedSegments = document.querySelectorAll('.speed-segment');
    if (speedSegments && speedSegments.length > 0) {
        speedSegments.forEach(btn => {
            btn.addEventListener('click', () => {
                speedSegments.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.playback.speed = parseFloat(btn.dataset.speed);
            });
        });
    }

    slider.addEventListener('input', (e) => {
        state.playback.currentTime = parseFloat(e.target.value);
        document.getElementById('timeline-current-label').textContent = formatDateTime(new Date(state.playback.currentTime));
        updateAirplanePositions();
    });

    // --- Map Right-Click Coordinates ---
    map.on('contextmenu', (e) => {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);
        
        L.popup()
            .setLatLng(e.latlng)
            .setContent(`
                <div style="font-family: 'Outfit', sans-serif; padding: 4px;">
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem;">Use this coordinates point:</p>
                    <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" id="pick-origin-map">Set Departure</button>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" id="pick-dest-map">Set Arrival</button>
                </div>
            `)
            .openOn(map);

        setTimeout(() => {
            document.getElementById('pick-origin-map')?.addEventListener('click', () => {
                const input = document.getElementById('origin-input');
                if (input) {
                    input.value = `Point (${lat}, ${lng})`;
                    input.dataset.lat = lat;
                    input.dataset.lng = lng;
                    input.dataset.name = `Point (${lat}, ${lng})`;
                }
                map.closePopup();
            });

            document.getElementById('pick-dest-map')?.addEventListener('click', () => {
                const input = document.getElementById('destination-input');
                if (input) {
                    input.value = `Point (${lat}, ${lng})`;
                    input.dataset.lat = lat;
                    input.dataset.lng = lng;
                    input.dataset.name = `Point (${lat}, ${lng})`;
                }
                map.closePopup();
            });
        }, 100);
    });

    // --- Price Update Event Listeners ---
    const btnUpdatePrices = document.getElementById('btn-update-prices');
    if (btnUpdatePrices) {
        btnUpdatePrices.addEventListener('click', triggerPriceUpdate);
    }
    const btnUpdatePricesLeft = document.getElementById('btn-update-prices-left');
    if (btnUpdatePricesLeft) {
        btnUpdatePricesLeft.addEventListener('click', triggerPriceUpdate);
    }
    const btnClosePriceModal = document.getElementById('btn-close-price-modal');
    if (btnClosePriceModal) {
        btnClosePriceModal.addEventListener('click', closePriceUpdateModal);
    }
    const btnPriceModalOk = document.getElementById('btn-price-modal-ok');
    if (btnPriceModalOk) {
        btnPriceModalOk.addEventListener('click', closePriceUpdateModal);
    }
    const priceOverlay = document.getElementById('price-update-modal-overlay');
    if (priceOverlay) {
        priceOverlay.addEventListener('click', (e) => {
            if (e.target === priceOverlay) {
                closePriceUpdateModal();
            }
        });
    }

    insertDemoData();
});

// Demo Data (Real trip candidates)
async function insertDemoData() {
    const defaultUrls = [
        "https://www.skyscanner.net/transport/flights/bud/duss/260619/config/10202-2606192010--32332-0-11165-2606192200?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false",
        "https://www.skyscanner.net/transport/flights/duss/krk/260621/config/11165-2606210620--32332-0-13235-2606210800?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&outboundaltsenabled=false&inboundaltsenabled=false&sortby=cheapest&preferdirects=false",
        "https://www.skyscanner.net/transport/flights/duss/lca/260622/config/11165-2606221300--32415-0-13445-2606221800?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false&sortby=cheapest",
        "https://www.skyscanner.net/transport/flights/krk/larn/260624/config/13235-2606241620--31669-0-13445-2606242030?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=true&sortby=cheapest"
    ];
    const colors = ["#6366f1", "#f59e0b", "#10b981", "#ec4899"];

    // --- 1. PERSISTENCE LOAD ---
    const stored = localStorage.getItem('weaver_routes');
    if (stored) {
        try {
            const parsedRoutes = JSON.parse(stored);
            if (Array.isArray(parsedRoutes)) {
                // Defensively filter out malformed routes
                const validRoutes = parsedRoutes.filter(r => 
                    r && 
                    r.origin && typeof r.origin.name === 'string' && typeof r.origin.lat === 'number' && typeof r.origin.lng === 'number' &&
                    r.destination && typeof r.destination.name === 'string' && typeof r.destination.lat === 'number' && typeof r.destination.lng === 'number' &&
                    r.departureTime && r.arrivalTime
                );

                if (validRoutes.length > 0) {
                    state.routes = validRoutes.map(r => ({
                        origin: r.origin,
                        destination: r.destination,
                        departureTime: typeof r.departureTime === 'string' ? new Date(r.departureTime).getTime() : Number(r.departureTime),
                        arrivalTime: typeof r.arrivalTime === 'string' ? new Date(r.arrivalTime).getTime() : Number(r.arrivalTime),
                        price: parseFloat(r.price) || 120,
                        color: r.color || '#6366f1',
                        link: r.link || '',
                        soldOut: !!r.soldOut,
                        id: r.id || (Date.now().toString() + Math.random().toString(36).substr(2, 5)),
                        planeMarker: null
                    }));

                    // Check if any default flight is missing, and restore it by airport codes
                    let restoredAny = false;
                    const defaultLegs = [
                        { from: 'BUD', to: 'DUS', urlIndex: 0 },
                        { from: 'DUS', to: 'KRK', urlIndex: 1 },
                        { from: 'DUS', to: 'LCA', urlIndex: 2 },
                        { from: 'KRK', to: 'LCA', urlIndex: 3 }
                    ];

                    for (let i = 0; i < defaultLegs.length; i++) {
                        const def = defaultLegs[i];
                        const exists = state.routes.some(r => 
                            r && r.origin && r.destination &&
                            getCityCode(r.origin.name) === def.from && 
                            getCityCode(r.destination.name) === def.to
                        );
                        if (!exists) {
                            const urlStr = defaultUrls[def.urlIndex];
                            const parsed = parseSkyscannerLink(urlStr);
                            if (parsed) {
                                const originData = await getAirportCoords(parsed.originCode);
                                const destData = await getAirportCoords(parsed.destCode);
                                if (originData && destData) {
                                    const route = {
                                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                        origin: originData,
                                        destination: destData,
                                        departureTime: new Date(parsed.departureTime).getTime(),
                                        arrivalTime: new Date(parsed.arrivalTime).getTime(),
                                        price: 120, // default price
                                        color: colors[def.urlIndex],
                                        link: urlStr,
                                        soldOut: false,
                                        planeMarker: null
                                    };
                                    state.routes.push(route);
                                    restoredAny = true;
                                }
                            }
                        }
                    }

                    if (restoredAny) {
                        state.routes.sort((a, b) => a.departureTime - b.departureTime);
                        saveRoutesToLocalStorage();
                    }

                    // Run pathfinder for restored routes
                    state.manualItineraries = findItineraries(state.routes);
                    state.selectedManualItineraryIndex = 0;

                    renderManualItinerariesList();
                    renderRoutesList();
                    drawRoutesOnMap();
                    updateTimelineBounds();

                    const coords = [];
                    state.routes.forEach(r => {
                        if (r && r.origin && r.destination) {
                            coords.push([r.origin.lat, r.origin.lng]);
                            coords.push([r.destination.lat, r.destination.lng]);
                        }
                    });
                    if (coords.length > 0) {
                        map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
                    } else {
                        map.setView([47.5, 18.5], 4);
                    }
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to parse stored routes from localStorage:", e);
        }
    }

    // --- 2. FALLBACK LOADER ---
    state.routes = [];
    for (let i = 0; i < defaultUrls.length; i++) {
        const urlStr = defaultUrls[i];
        const parsed = parseSkyscannerLink(urlStr);
        if (parsed) {
            const originData = await getAirportCoords(parsed.originCode);
            const destData = await getAirportCoords(parsed.destCode);
            
            if (originData && destData) {
                state.routes.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    origin: originData,
                    destination: destData,
                    departureTime: new Date(parsed.departureTime).getTime(),
                    arrivalTime: new Date(parsed.arrivalTime).getTime(),
                    price: 120,
                    color: colors[i],
                    link: urlStr,
                    soldOut: false,
                    planeMarker: null
                });
            }
        }
    }

    state.routes.sort((a, b) => a.departureTime - b.departureTime);
    state.manualItineraries = findItineraries(state.routes);
    state.selectedManualItineraryIndex = 0;

    renderManualItinerariesList();
    renderRoutesList();
    drawRoutesOnMap();
    updateTimelineBounds();

    map.setView([47.5, 18.5], 4);
    saveRoutesToLocalStorage();
}

// --- Live Price Update Logic & Modal ---
function triggerPriceUpdate() {
    if (state.routes.length === 0) {
        alert("No flight legs in network to update. Add flight legs first!");
        return;
    }

    const changes = [];
    const numChanges = Math.min(state.routes.length, Math.floor(Math.random() * 3) + 2); // 2 to 4 changes
    const candidates = [...state.routes];
    
    const selected = [];
    for (let i = 0; i < numChanges; i++) {
        if (candidates.length === 0) break;
        const idx = Math.floor(Math.random() * candidates.length);
        selected.push(candidates.splice(idx, 1)[0]);
    }

    selected.forEach(route => {
        const routeName = `${getCityCode(route.origin.name)} → ${getCityCode(route.destination.name)}`;
        const depDate = new Date(route.departureTime);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formatItemDate = `${depDate.getDate()} ${months[depDate.getMonth()]}`;
        
        const decision = Math.random();
        if (decision < 0.25) {
            // Sold out
            const r = state.routes.find(x => x.id === route.id);
            if (r) {
                r.soldOut = true;
                changes.push({
                    name: routeName,
                    time: formatItemDate,
                    status: 'sold-out',
                    oldPrice: r.price,
                    link: r.link
                });
            }
        } else if (decision < 0.65) {
            // Price goes up
            const pct = 0.1 + Math.random() * 0.25; // 10% to 35%
            const oldPrice = route.price;
            const newPrice = Math.round(oldPrice * (1 + pct));
            
            const r = state.routes.find(x => x.id === route.id);
            if (r) {
                r.price = newPrice;
                r.soldOut = false;
                changes.push({
                    name: routeName,
                    time: formatItemDate,
                    status: 'price-up',
                    oldPrice,
                    newPrice,
                    link: r.link
                });
            }
        } else {
            // Price goes down
            const pct = 0.1 + Math.random() * 0.25; // 10% to 35%
            const oldPrice = route.price;
            const newPrice = Math.max(15, Math.round(oldPrice * (1 - pct)));
            
            const r = state.routes.find(x => x.id === route.id);
            if (r) {
                r.price = newPrice;
                r.soldOut = false;
                changes.push({
                    name: routeName,
                    time: formatItemDate,
                    status: 'price-down',
                    oldPrice,
                    newPrice,
                    link: r.link
                });
            }
        }
    });

    if (changes.length > 0) {
        state.manualItineraries = findItineraries(state.routes);
        if (state.selectedManualItineraryIndex >= state.manualItineraries.length) {
            state.selectedManualItineraryIndex = 0;
        }

        saveRoutesToLocalStorage();
        renderManualItinerariesList();
        renderItineraryDetails();
        drawRoutesOnMap();
        updateTimelineBounds();
        updateAirplanePositions();
    }

    showPriceUpdateModal(changes);
}

function showPriceUpdateModal(changes) {
    const overlay = document.getElementById('price-update-modal-overlay');
    const body = document.getElementById('price-update-modal-body');
    if (!overlay || !body) return;

    body.innerHTML = '';

    if (changes.length === 0) {
        body.innerHTML = `
            <div class="empty-state" style="padding: 20px 0;">
                <i data-lucide="check-circle" style="width: 32px; height: 32px; color: var(--secondary); margin-bottom: 8px;"></i>
                <p>All prices are up to date! No changes detected.</p>
            </div>
        `;
    } else {
        changes.forEach(change => {
            let statusHTML = '';
            let priceHTML = '';
            if (change.status === 'sold-out') {
                statusHTML = `<span class="price-change-status sold-out">SOLD OUT</span>`;
                priceHTML = `<span class="price-change-old">$${change.oldPrice}</span>`;
            } else if (change.status === 'price-up') {
                statusHTML = `<span class="price-change-status price-up">+$${change.newPrice - change.oldPrice}</span>`;
                priceHTML = `
                    <span class="price-change-old">$${change.oldPrice}</span>
                    <strong style="font-size: 0.9rem; color: var(--text-main); font-weight:700;">$${change.newPrice}</strong>
                `;
            } else if (change.status === 'price-down') {
                statusHTML = `<span class="price-change-status price-down">-$${change.oldPrice - change.newPrice}</span>`;
                priceHTML = `
                    <span class="price-change-old">$${change.oldPrice}</span>
                    <strong style="font-size: 0.9rem; color: var(--text-main); font-weight:700;">$${change.newPrice}</strong>
                `;
            }

            let linkHTML = '';
            if (change.link) {
                linkHTML = `
                    <a href="${change.link}" target="_blank" class="price-change-link" title="Open Flight Page" style="color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; transition: var(--transition); padding: 2px; border-radius: 4px;">
                        <i data-lucide="external-link" style="width: 13px; height: 13px;"></i>
                    </a>
                `;
            }

            body.innerHTML += `
                <div class="price-change-item">
                    <div class="price-change-route-info">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="price-change-route-name">${change.name}</span>
                            ${linkHTML}
                        </div>
                        <span class="price-change-route-time">${change.time}</span>
                    </div>
                    <div class="price-change-value">
                        ${statusHTML}
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${priceHTML}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    overlay.classList.add('active');
    lucide.createIcons();
}

function closePriceUpdateModal() {
    const overlay = document.getElementById('price-update-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}
