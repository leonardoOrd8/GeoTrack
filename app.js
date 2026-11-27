//  funciones de Firebase ( deleteDoc, doc, updateDoc y arrayUnion)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot, 
  GeoPoint, 
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyCDmPXx-zLkUhOVEbRWjeND45Lu7AL_HoM",
  authDomain: "geotrack-firestore.firebaseapp.com",
  projectId: "geotrack-firestore",
  storageBucket: "geotrack-firestore.firebasestorage.app",
  messagingSenderId: "746002368455",
  appId: "1:746002368455:web:2f20550ebf2329ce0b3be2",
  measurementId: "G-280K25XEVC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const packageForm = document.getElementById('package-form');
const packageList = document.getElementById('package-list');
const totalPackagesEl = document.getElementById('total-packages');
const inTransitPackagesEl = document.getElementById('in-transit-packages');
const deliveredPackagesEl = document.getElementById('delivered-packages');

const markersMap = {};
const packagesCache = {}; // Guarda los datos de cada paquete por docId


// MAPA DE LEAFLET

const map = L.map('map').setView([19.4326, -99.1332], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markersGroup = L.layerGroup().addTo(map);

window.focusOnMap = function(lat, lng, docId) {
  map.flyTo([lat, lng], 15, { duration: 1.2 });
  if (markersMap[docId]) {
    markersMap[docId].openPopup();
  }
};

window.deletePackage = async function(event, docId) {
  event.stopPropagation();
  if (confirm(" ¿Estás seguro de que deseas eliminar este paquete?")) {
    try {
      await deleteDoc(doc(db, "paquetes", docId));
      alert(" Paquete eliminado correctamente.");
    } catch (error) {
      console.error("Error al eliminar el paquete:", error);
      alert(" No se pudo eliminar el paquete.");
    }
  }
};

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
  return { lat: 19.4326, lng: -99.1332 };
}


//  FORMULARIO Y GUARDAR EN FIRESTORE

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

      alert(" ¡Paquete registrado exitosamente en Firestore!");
      packageForm.reset();
    } catch (error) {
      console.error("Error guardando documento:", error);
      alert(" Error al guardar en Firebase Firestore");
    } finally {
      submitBtn.textContent = "Registrar Paquete";
      submitBtn.disabled = false;
    }
  });
}

let ultimoSnapshotGlobal = null;


//  CAMBIOS EN TIEMPO REAL (onSnapshot)

onSnapshot(collection(db, "paquetes"), (snapshot) => {
  ultimoSnapshotGlobal = snapshot;
  renderizarPantalla(snapshot);
});

function renderizarPantalla(snapshot) {
  if (!packageList) return;

  const searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
  const selectedStatus = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : 'TODOS';

  packageList.innerHTML = "";
  markersGroup.clearLayers(); 
  Object.keys(markersMap).forEach(key => delete markersMap[key]);
  Object.keys(packagesCache).forEach(key => delete packagesCache[key]);

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

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const docId = docSnap.id;
    const estado = data.estado || 'EN_ALMACEN';

    packagesCache[docId] = { id: docId, ...data };

    if (estado === 'EN_RUTA') enRuta++;
    if (estado === 'ENTREGADO') entregados++;

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
          <strong style="color: #0284c7;"> ${data.codigo_rastreo || 'Sin código'}</strong><br>
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
        <h4> ${data.codigo_rastreo || 'Sin código'}</h4>
        <p><strong>Destinatario:</strong> ${data.destinatario || 'N/A'}</p>
        <p><strong>Dirección:</strong> ${data.direccion || 'N/A'}</p>
        <p><small> GPS: ${hasLocation ? `${data.ubicacion_destino.latitude.toFixed(4)}, ${data.ubicacion_destino.longitude.toFixed(4)}` : 'No disponible'}</small></p>
        
        <div class="timeline-container">
          <strong> Historial de ruta:</strong>
          ${historialHtml || '<p><small>Sin registros previos</small></p>'}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-left: 15px;">
        <span class="badge ${estado}">${estado.replace('_', ' ')}</span>
        <div style="display: flex; gap: 6px;">
          <button type="button" onclick="window.simularPaqueteExistente(event, '${docId}')" style="background: #f59e0b; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
             Simular
          </button>
          <button type="button" class="btn-delete" onclick="deletePackage(event, '${docId}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
             Eliminar
          </button>
        </div>
      </div>
    `;
    packageList.appendChild(item);
  });

  if (totalPackagesEl) totalPackagesEl.textContent = total;
  if (inTransitPackagesEl) inTransitPackagesEl.textContent = enRuta;
  if (deliveredPackagesEl) deliveredPackagesEl.textContent = entregados;
}


// DISPARAR FILTROS EN TIEMPO REAL DESDE EL DOM

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


// 5. SIMULACIÓN HACIA UBICACIÓN REAL 

let marcadorRepartidorActivo = null;
let lineaRutaActiva = null;
let intervaloSimulacionActivo = null;

// Genera una ruta interpolada desde un punto cercano (~1.2 km) hasta el destino exacto
function generarRutaHaciaDestino(destLat, destLng, pasos = 6) {
  // Punto de partida cercano (desplazamiento aproximado)
  const startLat = destLat - 0.008;
  const startLng = destLng - 0.008;

  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    // Ligera curvatura para que no sea una línea recta plana
    const curva = Math.sin(t * Math.PI) * 0.0012;
    const lat = startLat + (destLat - startLat) * t + curva;
    const lng = startLng + (destLng - startLng) * t - curva * 0.5;
    puntos.push([lat, lng]);
  }
  // Asegurar que el último punto sea exactamente la ubicación destino
  puntos[puntos.length - 1] = [destLat, destLng];
  return puntos;
}

async function actualizarEstadoEnFirestore(docId, nuevoEstado) {
  if (!docId) return;
  try {
    const paqueteActual = packagesCache[docId];
    // Evita duplicar el mismo estado consecutivo si ya está en ese estado
    if (paqueteActual && paqueteActual.estado === nuevoEstado) return;

    await updateDoc(doc(db, "paquetes", docId), {
      estado: nuevoEstado,
      historial: arrayUnion({
        estado: nuevoEstado,
        fecha: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error(`Error al actualizar estado a ${nuevoEstado}:`, error);
  }
}

async function ejecutarAnimacionHaciaDestino(destLat, destLng, etiqueta, docId = null) {
  if (intervaloSimulacionActivo) {
    clearInterval(intervaloSimulacionActivo);
  }
  if (marcadorRepartidorActivo) {
    map.removeLayer(marcadorRepartidorActivo);
  }
  if (lineaRutaActiva) {
    map.removeLayer(lineaRutaActiva);
  }

  const ruta = generarRutaHaciaDestino(destLat, destLng, 5);
  let paso = 0;

  map.setView(ruta[0], 15);

  lineaRutaActiva = L.polyline(ruta, {
    color: '#f59e0b',
    weight: 3,
    dashArray: '6, 6'
  }).addTo(map);

  marcadorRepartidorActivo = L.marker(ruta[0], { title: "Repartidor GPS" }).addTo(map);
  marcadorRepartidorActivo.bindPopup(`
    <div style="font-family: sans-serif;">
      <strong style="color: #f59e0b;"> Repartidor en Ruta</strong><br>
      <b>Destino:</b> ${etiqueta}<br>
      <b>Estado:</b> EN RUTA
    </div>
  `).openPopup();

  // Al iniciar la simulación de un paquete registrado, pasa a EN_RUTA
  if (docId) {
    await actualizarEstadoEnFirestore(docId, "EN_RUTA");
  }

  intervaloSimulacionActivo = setInterval(async () => {
    paso++;
    if (paso < ruta.length) {
      const coordActual = ruta[paso];
      marcadorRepartidorActivo.setLatLng(coordActual);
      map.panTo(coordActual);

      if (paso === ruta.length - 1) {
        clearInterval(intervaloSimulacionActivo);
        marcadorRepartidorActivo.bindPopup(`
          <div style="font-family: sans-serif;">
            <strong style="color: #10b981;"> ¡Entrega Completada!</strong><br>
            <b>Destino:</b> ${etiqueta}<br>
            <b>Estado:</b> ENTREGADO
          </div>
        `).openPopup();

        if (docId) {
          await actualizarEstadoEnFirestore(docId, "ENTREGADO");
        }
      }
    }
  }, 1800);
}

// Botón " Simular" del formulario
window.iniciarSimulacionRepartidor = async function() {
  const addressInput = document.getElementById('address');
  const codeInput = document.getElementById('trackingCode');
  const direccionTexto = addressInput ? addressInput.value.trim() : '';
  const codigoTexto = codeInput && codeInput.value.trim() ? codeInput.value.trim() : 'Nuevo Envío';

  if (!direccionTexto) {
    alert(" Escribe primero una Dirección en el formulario para calcular la ruta hacia ese lugar.");
    if (addressInput) addressInput.focus();
    return;
  }

  const coords = await geocodeAddress(direccionTexto);
  await ejecutarAnimacionHaciaDestino(
    coords.lat,
    coords.lng,
    `${codigoTexto} (${direccionTexto})`,
    null
  );
};

// Botón " Simular" en cada paquete ya registrado
window.simularPaqueteExistente = async function(event, docId) {
  event.stopPropagation();
  const paquete = packagesCache[docId];
  if (!paquete) return;

  let lat, lng;
  if (
    paquete.ubicacion_destino &&
    typeof paquete.ubicacion_destino.latitude === 'number' &&
    typeof paquete.ubicacion_destino.longitude === 'number'
  ) {
    lat = paquete.ubicacion_destino.latitude;
    lng = paquete.ubicacion_destino.longitude;
  } else if (paquete.direccion) {
    const coords = await geocodeAddress(paquete.direccion);
    lat = coords.lat;
    lng = coords.lng;
  } else {
    alert(" Este paquete no tiene coordenadas ni dirección válida.");
    return;
  }

  await ejecutarAnimacionHaciaDestino(
    lat,
    lng,
    `${paquete.codigo_rastreo || 'Paquete'} - ${paquete.direccion || ''}`,
    docId
  );
};