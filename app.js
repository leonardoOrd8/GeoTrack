/// Importar funciones de Firebase (incluyendo deleteDoc y doc)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc,
  doc,
  onSnapshot, 
  GeoPoint, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ MANTÉN TUS CLAVES REALES DE FIREBASE AQUÍ
const firebaseConfig = {
  apiKey: "AIzaSyCDmPXx-zLkUhOVEbRWjeND45Lu7AL_HoM",
  authDomain: "geotrack-firestore.firebaseapp.com",
  projectId: "geotrack-firestore",
  storageBucket: "geotrack-firestore.firebasestorage.app",
  messagingSenderId: "746002368455",
  appId: "1:746002368455:web:2f20550ebf2329ce0b3be2",
  measurementId: "G-280K25XEVC"
};

// Inicializar la conexión con Firebase y Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Referencias a los elementos del HTML
const packageForm = document.getElementById('package-form');
const packageList = document.getElementById('package-list');
const totalPackagesEl = document.getElementById('total-packages');
const inTransitPackagesEl = document.getElementById('in-transit-packages');
const deliveredPackagesEl = document.getElementById('delivered-packages');

// Objeto global para almacenar los marcadores del mapa
const markersMap = {};

// ==========================================
// 1. INICIALIZAR EL MAPA DE LEAFLET
// ==========================================
const map = L.map('map').setView([19.4326, -99.1332], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markersGroup = L.layerGroup().addTo(map);

// Función global para centrar el mapa al hacer clic en una tarjeta
window.focusOnMap = function(lat, lng, docId) {
  map.flyTo([lat, lng], 15, { duration: 1.2 });
  if (markersMap[docId]) {
    markersMap[docId].openPopup();
  }
};

// Función global para eliminar paquetes de Firestore
window.deletePackage = async function(event, docId) {
  event.stopPropagation(); // Evita enfocar el mapa al hacer clic en borrar
  if (confirm("⚠️ ¿Estás seguro de que deseas eliminar este paquete?")) {
    try {
      await deleteDoc(doc(db, "paquetes", docId));
      alert("🗑️ Paquete eliminado correctamente.");
    } catch (error) {
      console.error("Error al eliminar el paquete:", error);
      alert("❌ No se pudo eliminar el paquete.");
    }
  }
};

// Función auxiliar para obtener coordenadas desde la dirección escrita (OpenStreetMap)
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.warn("No se pudo geocodificar la dirección automáticamente:", error);
  }
  // Coordenadas por defecto (CDMX) en caso de no encontrar la dirección
  return { lat: 19.4326, lng: -99.1332 };
}

// ==========================================
// 2. ESCUCHAR EL FORMULARIO Y GUARDAR EN FIRESTORE
// ==========================================
if (packageForm) {
  packageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = document.getElementById('trackingCode').value;
    const recipient = document.getElementById('recipient').value;
    const address = document.getElementById('address').value;
    const status = document.getElementById('status').value;

    const submitBtn = packageForm.querySelector('button[type="submit"]');
    submitBtn.textContent = "Buscando ubicación...";
    submitBtn.disabled = true;

    // Obtener las coordenadas automáticamente a partir del texto de la dirección
    const coords = await geocodeAddress(address);

    try {
      await addDoc(collection(db, "paquetes"), {
        codigo_rastreo: code,
        destinatario: recipient,
        direccion: address,
        estado: status,
        ubicacion_destino: new GeoPoint(coords.lat, coords.lng),
        fecha_creacion: serverTimestamp(),
        historial: [
          { estado: status, fecha: new Date().toISOString() }
        ]
      });

      alert("✅ ¡Paquete registrado exitosamente en Firestore!");
      packageForm.reset();
    } catch (error) {
      console.error("Error guardando documento:", error);
      alert("❌ Error al guardar en Firebase Firestore");
    } finally {
      submitBtn.textContent = "Registrar Paquete";
      submitBtn.disabled = false;
    }
  });
}

// Variable global para almacenar temporalmente los datos en memoria
let ultimoSnapshotGlobal = null;

// ==========================================
// 3. ESCUCHAR CAMBIOS EN TIEMPO REAL (onSnapshot)
// ==========================================
onSnapshot(collection(db, "paquetes"), (snapshot) => {
  ultimoSnapshotGlobal = snapshot; // Guardamos el snapshot en memoria
  renderizarPantalla(snapshot);
});

// Función centralizada para renderizar tarjetas y marcadores según filtros
function renderizarPantalla(snapshot) {
  if (!packageList) return;

  const searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
  const selectedStatus = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : 'TODOS';

  packageList.innerHTML = "";
  markersGroup.clearLayers(); 
  
  Object.keys(markersMap).forEach(key => delete markersMap[key]);

  let total = snapshot.size;
  let enRuta = 0;
  let entregados = 0;

  if (snapshot.empty) {
    packageList.innerHTML = "<p>No hay paquetes registrados aún.</p>";
    if (totalPackagesEl) totalPackagesEl.textContent = "0";
    if (inTransitPackagesEl) inTransitPackagesEl.textContent = "0";
    if (deliveredPackagesEl) deliveredPackagesEl.textContent = "0";
    return;
  }

  snapshot.forEach((doc) => {
    const data = doc.data();
    const docId = doc.id;
    const estado = data.estado || 'EN_ALMACEN';

    if (estado === 'EN_RUTA') enRuta++;
    if (estado === 'ENTREGADO') entregados++;

    // Aplicar Filtros
    const codigo = (data.codigo_rastreo || '').toLowerCase();
    const destinatario = (data.destinatario || '').toLowerCase();
    const matchesSearch = codigo.includes(searchText) || destinatario.includes(searchText);
    const matchesStatus = (selectedStatus === 'TODOS' || estado === selectedStatus);

    if (!matchesSearch || !matchesStatus) return;

    const hasLocation = data.ubicacion_destino && 
                        typeof data.ubicacion_destino.latitude === 'number' && 
                        typeof data.ubicacion_destino.longitude === 'number';

    if (hasLocation) {
      const lat = data.ubicacion_destino.latitude;
      const lng = data.ubicacion_destino.longitude;

      const marker = L.marker([lat, lng]);
      marker.bindPopup(`
        <div style="font-family: sans-serif;">
          <strong style="color: #0284c7;">📦 ${data.codigo_rastreo || 'Sin código'}</strong><br>
          <b>Destinatario:</b> ${data.destinatario || 'N/A'}<br>
          <b>Dirección:</b> ${data.direccion || 'N/A'}<br>
          <b>Estado:</b> <span style="font-weight:bold;">${estado.replace('_', ' ')}</span>
        </div>
      `);

      markersGroup.addLayer(marker);
      markersMap[docId] = marker;
    }

    const item = document.createElement('div');
    item.className = 'package-item';
    
    if (hasLocation) {
      const lat = data.ubicacion_destino.latitude;
      const lng = data.ubicacion_destino.longitude;
      item.style.cursor = 'pointer';
      item.title = 'Haz clic para enfocar en el mapa';
      item.setAttribute('onclick', `focusOnMap(${lat}, ${lng}, '${docId}')`);
    }

    let historialHtml = '';
    if (data.historial && Array.isArray(data.historial)) {
      historialHtml = data.historial.map(h => {
        const fechaFormateada = h.fecha ? new Date(h.fecha).toLocaleString() : 'Fecha no disponible';
        const nombreEstado = h.estado ? h.estado.replace('_', ' ') : 'ESTADO';
        return `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <span><b>${nombreEstado}</b> - <small>${fechaFormateada}</small></span>
          </div>
        `;
      }).join('');
    }

    item.innerHTML = `
      <div class="package-info" style="flex: 1;">
        <h4>📦 ${data.codigo_rastreo || 'Sin código'}</h4>
        <p><strong>Destinatario:</strong> ${data.destinatario || 'N/A'}</p>
        <p><strong>Dirección:</strong> ${data.direccion || 'N/A'}</p>
        <p><small>📍 GPS: ${hasLocation ? `${data.ubicacion_destino.latitude.toFixed(4)}, ${data.ubicacion_destino.longitude.toFixed(4)}` : 'No disponible'}</small></p>
        
        <div class="timeline-container">
          <strong>📋 Historial de ruta:</strong>
          ${historialHtml || '<p><small>Sin registros previos</small></p>'}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: 15px;">
        <span class="badge ${estado}">${estado.replace('_', ' ')}</span>
        <button class="btn-delete" onclick="deletePackage(event, '${docId}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
          🗑️ Eliminar
        </button>
      </div>
    `;
    packageList.appendChild(item);
  });

  if (totalPackagesEl) totalPackagesEl.textContent = total;
  if (inTransitPackagesEl) inTransitPackagesEl.textContent = enRuta;
  if (deliveredPackagesEl) deliveredPackagesEl.textContent = entregados;
}

// ==========================================
// 4. DISPARAR FILTROS EN TIEMPO REAL DESDE EL DOM
// ==========================================
document.addEventListener('input', (e) => {
  if (e.target.id === 'searchInput' && ultimoSnapshotGlobal) {
    renderizarPantalla(ultimoSnapshotGlobal);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'statusFilter' && ultimoSnapshotGlobal) {
    renderizarPantalla(ultimoSnapshotGlobal);
  }
});

// ==========================================
// 5. SIMULACIÓN DE MOVIMIENTO DE REPARTIDOR (LOCAL)
// ==========================================
window.iniciarSimulacionRepartidor = function() {
  console.log("🚀 Iniciando simulación de repartidor...");

  // Coordenadas cerca de UPIICSA
  const rutaSimulada = [
    [19.3950, -99.0900],
    [19.3958, -99.0912],
    [19.3965, -99.0925],
    [19.3972, -99.0938],
    [19.3980, -99.0950]
  ];

  let indiceRuta = 0;

  // Centrar el mapa en la posición inicial
  map.setView(rutaSimulada[0], 15);

  const markerRepartidor = L.marker(rutaSimulada[0], {
    title: "Repartidor GPS"
  }).addTo(map);

  markerRepartidor.bindPopup(`
    <div style="font-family: sans-serif;">
      <strong style="color: #f59e0b;">🛵 Repartidor en Ruta</strong><br>
      <b>Unidad:</b> Moto-01<br>
      <b>Estado:</b> En movimiento simulado
    </div>
  `).openPopup();

  const intervaloMovimiento = setInterval(() => {
    if (indiceRuta < rutaSimulada.length) {
      const siguientePunto = rutaSimulada[indiceRuta];
      markerRepartidor.setLatLng(siguientePunto);
      map.panTo(siguientePunto);
      indiceRuta++;
    } else {
      clearInterval(intervaloMovimiento);
      markerRepartidor.bindPopup("<b>✅ ¡Entrega Completada con Éxito!</b>").openPopup();
    }
  }, 2500);
};