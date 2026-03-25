
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicjalizacja mapy
    const map = L.map('map').setView([52.237, 19.145], 6); // Wycentrowanie na Polskę

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const markers = L.markerClusterGroup();
    const pointsData = new Map(); // Użycie Map do deduplikacji punktów (klucz: "lat,lon")

    // 2. Pobieranie i parsowanie danych
    async function loadBadges() {
        try {
            // Wczytanie głównego pliku indeksu
            const indexResponse = await fetch('zasoby/odznaki/indeks.csv');
            const indexText = await indexResponse.text();
            // Pomijamy nagłówek (pierwsza linia)
            const badges = parseCSV(indexText).slice(1);

            for (const badge of badges) {
                const [badgeName, , category, csvFile] = badge;

                // Przetwarzanie tylko odznak z kategorii A i B, które mają zdefiniowany plik CSV
                if ((category === 'A' || category === 'B') && csvFile) {
                    const csvPath = resolveCsvPath(csvFile);
                    const csvResponse = await fetch(csvPath);
                    if (!csvResponse.ok) continue; // Pomiń, jeśli plik nie istnieje
                    const csvText = await csvResponse.text();
                     // Pomijamy nagłówek (pierwsza linia)
                    const points = parseCSV(csvText).slice(1);

                    for (const point of points) {
                        const [name, , , address, coords] = point;
                        // Upewnij się, że współrzędne istnieją i są w poprawnym formacie
                        if (coords && coords.includes(',')) {
                            const coordKey = coords.trim();
                            
                            // 3. Deduplikacja i agregacja danych o punktach
                            if (!pointsData.has(coordKey)) {
                                pointsData.set(coordKey, {
                                    name: name,
                                    address: address,
                                    coords: coordKey.split(',').map(Number).reverse(), // Format Leaflet to [lat, lon], a dane to "lon, lat"
                                    badges: []
                                });
                            }
                            // Dodaj odznakę do listy dla danego punktu
                            pointsData.get(coordKey).badges.push(badgeName);
                        }
                    }
                }
            }
            renderMarkers(); // Wywołanie funkcji renderującej markery po przetworzeniu danych
        } catch (error) {
            console.error("Błąd podczas ładowania danych odznak:", error);
        }
    }

    // Obsługa obu wariantów z indeks.csv:
    // - sama nazwa pliku, np. "plik.csv"
    // - pełna ścieżka, np. "zasoby/odznaki/plik.csv"
    function resolveCsvPath(csvFile) {
        const normalized = String(csvFile).trim().replace(/\\/g, '/');
        if (normalized.startsWith('zasoby/')) {
            return normalized;
        }
        return `zasoby/odznaki/${normalized}`;
    }

    // 4. Renderowanie Markerów na mapie
    function renderMarkers() {
        for (const [key, data] of pointsData.entries()) {
            const [lat, lon] = data.coords;
            if (!isNaN(lat) && !isNaN(lon)) {
                const marker = L.marker([lat, lon]);

                // Tworzenie treści Popupa
                const popupContent = `
                    <b>${data.name}</b><br>
                    ${data.address || ''}<br><br>
                    <b>Ten punkt zalicza się do odznak:</b>
                    <ul>
                        ${data.badges.map(b => `<li>${b}</li>`).join('')}
                    </ul>
                    <button class="check-in-btn" onclick="handleCheckIn('${key}')">Zamelduj się</button>
                    <input type="file" accept="image/*" capture="environment" id="camera-${key}" style="display:none;">
                `;

                marker.bindPopup(popupContent);
                markers.addLayer(marker);
            }
        }
        map.addLayer(markers); // Dodanie warstwy klastrów do mapy
    }
    
    // Prosty parser CSV
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        return lines.map(line => line.split(';'));
    }

    // 5. Placeholder dla funkcji "Zamelduj się"
    window.handleCheckIn = (pointKey) => {
        const cameraInput = document.getElementById(`camera-${pointKey}`);
        cameraInput.onchange = () => {
            const file = cameraInput.files[0];
            if (file) {
                console.log(`Placeholder: Wysyłanie ${file.name} dla punktu ${pointKey} do Firebase Storage...`);
                // W tym miejscu docelowo znajdzie się kod do uploadu pliku do Firebase Storage
                // np. uploadToFirebase(file, pointKey);
                alert('Zdjęcie przechwycone! (Funkcjonalność w trakcie implementacji)');
            }
        };
        cameraInput.click();
    };

    // Inicjalizacja ładowania danych
    loadBadges();
});
