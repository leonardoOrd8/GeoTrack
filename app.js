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

const ADMIN_CREDENCIALES = {
  email: "admin@geotrack.com",
  password: "admin123"
};

const packageForm = document.getElementById('package-form');
const userOrderForm = document.getElementById('user-order-form');
const packageList = document.getElementById('package-list');
const totalPackagesEl = document.getElementById('total-packages');
const inTransitPackagesEl = document.getElementById('in-transit-packages');
const deliveredPackagesEl = document.getElementById('delivered-packages');

const markersMap = {};
const packagesCache = {}; 
let sesionActual = null; 


function mostrarNotificacionToast(titulo, mensaje, tipo = "success") {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.background = tipo === "success" ? "#10b981" : "#0284c7";
  toast.style.color = "#ffffff";
  toast.style.padding = "12px 18px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  toast.style.marginBottom = "10px";
  toast.style.fontFamily = "sans-serif";
  toast.style.fontSize = "0.9rem";
  toast.style.transition = "all 0.3s ease";

  toast.innerHTML = `<strong>${titulo}</strong><br>${mensaje}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// MAPA LEAFLET
const map = L.map('map').setView([19.4326, -99.1332], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markersGroup = L.layerGroup().addTo(map);

function limpiarSimulacionMapa() {
  if (intervaloSimulacionActivo) {
    clearInterval(intervaloSimulacionActivo);
    intervaloSimulacionActivo = null;
  }
  if (marcadorRepartidorActivo) {
    map.removeLayer(marcadorRepartidorActivo);
    marcadorRepartidorActivo = null;
  }
  if (lineaRutaActiva) {
    map.removeLayer(lineaRutaActiva);
    lineaRutaActiva = null;
  }
}

function renderizarMapaUsuario(paquete) {
  markersGroup.clearLayers();
  Object.keys(markersMap).forEach(key => delete markersMap[key]);

  if (
    !paquete ||
    !paquete.ubicacion_destino ||
    typeof paquete.ubicacion_destino.latitude !== 'number' ||
    typeof paquete.ubicacion_destino.longitude !== 'number'
  ) {
    map.setView([19.4326, -99.1332], 11);
    return;
  }

  const lat = paquete.ubicacion_destino.latitude;
  const lng = paquete.ubicacion_destino.longitude;
  const estado = paquete.estado || 'EN_ALMACEN';

  const marker = L.marker([lat, lng]);
  marker.bindPopup(`
    <div style="font-family: sans-serif;">
      <strong style="color: #0284c7;">${paquete.codigo_rastreo || 'Mi Pedido'}</strong><br>
      <b>Destinatario:</b> ${paquete.destinatario || 'N/A'}<br>
      <b>Dirección:</b> ${paquete.direccion || 'N/A'}<br>
      <b>Estado:</b> <span style="font-weight:bold;">${estado.replace('_', ' ')}</span>
    </div>
  `);

  markersGroup.addLayer(marker);
  markersMap[paquete.id] = marker;
  map.setView([lat, lng], 14);
}

window.focusOnMap = function(lat, lng, docId) {
  map.flyTo([lat, lng], 15, { duration: 1.2 });
  if (markersMap[docId]) {
    markersMap[docId].openPopup();
  }
};

window.deletePackage = async function(event, docId) {
  event.stopPropagation();
  if (confirm("¿Estás seguro de que deseas eliminar este paquete?")) {
    try {
      await deleteDoc(doc(db, "paquetes", docId));

      await publicarEventoMensajeria("PAQUETE_ELIMINADO", {
        paqueteId: docId
      });

      mostrarNotificacionToast("Paquete Eliminado", "El paquete se eliminó del sistema.", "info");
    } catch (error) {
      console.error("Error al eliminar el paquete:", error);
      alert("No se pudo eliminar el paquete.");
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

// CONTROL DE SESIÓN Y VISTAS
const loginSection = document.getElementById('login-section');
const appWorkspace = document.getElementById('app-workspace');
const userView = document.getElementById('user-view');
const adminFullContent = document.getElementById('admin-full-content');
const adminNavLinks = document.getElementById('admin-nav-links');
const loginRoleSelect = document.getElementById('login-role');
const loginError = document.getElementById('login-error');
const sessionBadge = document.getElementById('session-badge');

document.getElementById('btn-login')?.addEventListener('click', () => {
  const email = document.getElementById('login-email')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('login-password')?.value.trim() || '';
  const rol = loginRoleSelect ? loginRoleSelect.value : 'USUARIO';

  if (loginError) loginError.textContent = '';

  if (!email || !email.includes('@')) {
    if (loginError) loginError.textContent = "Ingresa un correo electrónico válido.";
    return;
  }

  if (!password || password.length < 4) {
    if (loginError) loginError.textContent = "Ingresa una contraseña válida (mínimo 4 caracteres).";
    return;
  }

  if (rol === 'ADMIN') {
    if (email !== ADMIN_CREDENCIALES.email.toLowerCase() || password !== ADMIN_CREDENCIALES.password) {
      if (loginError) {
        loginError.textContent = `Credenciales de administrador inválidas (usa ${ADMIN_CREDENCIALES.email} / ${ADMIN_CREDENCIALES.password}).`;
      }
      return;
    }
    sesionActual = { rol: 'ADMIN', email };
  } else {
    sesionActual = { rol: 'USUARIO', email };
  }

  aplicarVistaPorRol();
});

document.getElementById('btn-logout')?.addEventListener('click', () => {
  sesionActual = null;
  limpiarSimulacionMapa();
  markersGroup.clearLayers();
  const passInput = document.getElementById('login-password');
  if (passInput) passInput.value = '';
  if (appWorkspace) appWorkspace.style.display = 'none';
  if (adminNavLinks) adminNavLinks.style.display = 'none';
  if (loginSection) loginSection.style.display = 'block';
});

function buscarPaqueteUsuario() {
  if (!sesionActual || sesionActual.rol !== 'USUARIO') return null;
  const correoUsuario = sesionActual.email.toLowerCase();
  const prefijoCorreo = correoUsuario.split('@')[0];

  const listaPaquetes = Object.values(packagesCache);

  let encontrado = listaPaquetes.find(
    (p) => (p.correo_cliente || '').trim().toLowerCase() === correoUsuario
  );

  if (!encontrado) {
    encontrado = listaPaquetes.find((p) => {
      const dest = (p.destinatario || '').trim().toLowerCase();
      return dest === correoUsuario || (prefijoCorreo.length >= 3 && dest.includes(prefijoCorreo));
    });
  }

  return encontrado || null;
}

function aplicarVistaPorRol() {
  if (!sesionActual) return;
  if (loginSection) loginSection.style.display = 'none';
  if (appWorkspace) appWorkspace.style.display = 'grid';

  if (sesionActual.rol === 'ADMIN') {
    if (adminNavLinks) adminNavLinks.style.display = 'flex';
    if (sessionBadge) sessionBadge.innerHTML = `<strong>Sesión:</strong> Administrador (${sesionActual.email})`;
    if (userView) userView.style.display = 'none';
    if (adminFullContent) adminFullContent.style.display = 'block';
    if (ultimoSnapshotGlobal) renderizarPantalla(ultimoSnapshotGlobal);
  } else {
    if (adminNavLinks) adminNavLinks.style.display = 'none';
    if (sessionBadge) sessionBadge.innerHTML = `<strong>Sesión:</strong> Usuario (${sesionActual.email})`;
    if (adminFullContent) adminFullContent.style.display = 'none';
    if (userView) userView.style.display = 'block';
    renderizarVistaUsuario();
  }

  setTimeout(() => map.invalidateSize(), 150);
}

function construirRegistroEstatusHtml(paquete) {
  if (!paquete.historial || !Array.isArray(paquete.historial) || paquete.historial.length === 0) {
    return `<p><small>Sin registros de estatus previos.</small></p>`;
  }

  return paquete.historial
    .map((item, idx) => {
      const estadoNombre = item.estado ? item.estado.replace('_', ' ') : 'ESTADO';
      const fechaTexto = item.fecha ? new Date(item.fecha).toLocaleString() : 'Fecha no disponible';
      return `
        <div class="timeline-item" style="padding: 6px 0; border-bottom: ${idx < paquete.historial.length - 1 ? '1px dashed #cbd5e1' : 'none'};">
          <div class="timeline-dot"></div>
          <span><strong>${estadoNombre}</strong> — <small>${fechaTexto}</small></span>
        </div>
      `;
    })
    .join('');
}

function renderizarVistaUsuario() {
  const createOrderBox = document.getElementById('user-create-order-box');
  const orderStatusBox = document.getElementById('user-order-status-box');
  const cardEl = document.getElementById('user-package-card');
  const historyEl = document.getElementById('user-status-history');

  if (!sesionActual || sesionActual.rol !== 'USUARIO') return;

  const paquete = buscarPaqueteUsuario();

  if (!paquete) {
    markersGroup.clearLayers();
    if (createOrderBox) createOrderBox.style.display = 'block';
    if (orderStatusBox) orderStatusBox.style.display = 'none';
    return;
  }

  if (createOrderBox) createOrderBox.style.display = 'none';
  if (orderStatusBox) orderStatusBox.style.display = 'block';

  const estadoActual = paquete.estado || 'EN_ALMACEN';
  const estadoTexto = estadoActual.replace('_', ' ');

  if (cardEl) {
    cardEl.innerHTML = `
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; background: #f8fafc;">
        <p><strong>Código de Rastreo:</strong> ${paquete.codigo_rastreo || 'Sin código'}</p>
        <p><strong>Destinatario:</strong> ${paquete.destinatario || 'N/A'}</p>
        <p><strong>Dirección de Entrega:</strong> ${paquete.direccion || 'N/A'}</p>
        <p><strong>Estado Actual:</strong> <span class="badge ${estadoActual}">${estadoTexto}</span></p>
      </div>
    `;
  }

  if (historyEl) {
    historyEl.innerHTML = `
      <h4 style="margin: 0 0 8px 0;"><i class="fas fa-history"></i> Registro de Estatus del Pedido</h4>
      <div class="timeline-container">
        ${construirRegistroEstatusHtml(paquete)}
      </div>
    `;
  }

  // Solo muestra en el mapa el marcador del pedido de este usuario
  renderizarMapaUsuario(paquete);
}

// EVENTO: REGISTRO DE PEDIDO POR PARTE DEL USUARIO
if (userOrderForm) {
  userOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!sesionActual || sesionActual.rol !== 'USUARIO') return;

    const recipient = document.getElementById('user-recipient-name').value;
    const address = document.getElementById('user-address').value;
    const clientEmail = sesionActual.email;
    const trackingCode = `GTK-${Math.floor(1000 + Math.random() * 9000)}`;

    const submitBtn = userOrderForm.querySelector('button[type="submit"]');
    submitBtn.textContent = "Procesando pedido...";
    submitBtn.disabled = true;

    const coords = await geocodeAddress(address);

    try {
      await addDoc(collection(db, "paquetes"), {
        codigo_rastreo: trackingCode,
        destinatario: recipient,
        correo_cliente: clientEmail,
        direccion: address,
        estado: "EN_ALMACEN",
        ubicacion_destino: new GeoPoint(coords.lat, coords.lng),
        fecha_creacion: serverTimestamp(),
        historial: [
          { estado: "EN_ALMACEN", fecha: new Date().toISOString() }
        ]
      });

      await publicarEventoMensajeria("PAQUETE_CREADO", {
        codigo_rastreo: trackingCode,
        destinatario: recipient,
        correo_cliente: clientEmail,
        direccion: address,
        estado_inicial: "EN_ALMACEN",
        destino: { lat: coords.lat, lng: coords.lng }
      });

      mostrarNotificacionToast(
        "¡Pedido Realizado Exitosamente!",
        `Tu código de seguimiento es <strong>${trackingCode}</strong>.`,
        "success"
      );

      userOrderForm.reset();
    } catch (error) {
      console.error("Error al registrar pedido del usuario:", error);
      alert("Error al guardar el pedido en Firestore.");
    } finally {
      submitBtn.textContent = "Confirmar y Realizar Pedido";
      submitBtn.disabled = false;
    }
  });
}

document.getElementById('btn-ask-order')?.addEventListener('click', async () => {
  const paquete = buscarPaqueteUsuario();
  if (!paquete) {
    alert("No encontramos ningún pedido asociado a tu correo.");
    return;
  }

  setTimeout(() => map.invalidateSize(), 120);
  await window.simularPaqueteExistente(new Event('click'), paquete.id);
});

// REGISTRO DE PAQUETE (ADMIN)
if (packageForm) {
  packageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = document.getElementById('trackingCode').value;
    const recipient = document.getElementById('recipient').value;
    const clientEmail = (document.getElementById('clientEmail')?.value || '').trim().toLowerCase();
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
        correo_cliente: clientEmail || null,
        direccion: address,
        estado: status,
        ubicacion_destino: new GeoPoint(coords.lat, coords.lng),
        fecha_creacion: serverTimestamp(),
        historial: [
          { estado: status, fecha: new Date().toISOString() }
        ]
      });

      await publicarEventoMensajeria("PAQUETE_CREADO", {
        codigo_rastreo: code,
        destinatario: recipient,
        correo_cliente: clientEmail || null,
        direccion: address,
        estado_inicial: status,
        destino: { lat: coords.lat, lng: coords.lng }
      });

      mostrarNotificacionToast("Paquete Registrado", `Paquete ${code} guardado correctamente.`, "success");
      packageForm.reset();
    } catch (error) {
      console.error("Error guardando documento:", error);
      alert("Error al guardar en Firebase Firestore");
    } finally {
      submitBtn.textContent = "Registrar Paquete";
      submitBtn.disabled = false;
    }
  });
}

let ultimoSnapshotGlobal = null;

// ESCUCHADOR EN TIEMPO REAL (onSnapshot)
onSnapshot(collection(db, "paquetes"), (snapshot) => {
  ultimoSnapshotGlobal = snapshot;

  
  Object.keys(packagesCache).forEach(key => delete packagesCache[key]);
  snapshot.forEach((docSnap) => {
    packagesCache[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
  });

  if (sesionActual?.rol === 'ADMIN') {
    renderizarPantalla(snapshot);
  } else if (sesionActual?.rol === 'USUARIO') {
    renderizarVistaUsuario();
  }
});

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

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const docId = docSnap.id;
    const estado = data.estado || 'EN_ALMACEN';

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
          <strong style="color: #0284c7;">${data.codigo_rastreo || 'Sin código'}</strong><br>
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
        <h4>${data.codigo_rastreo || 'Sin código'}</h4>
        <p><strong>Destinatario:</strong> ${data.destinatario || 'N/A'}</p>
        ${data.correo_cliente ? `<p><small><strong>Correo Cliente:</strong> ${data.correo_cliente}</small></p>` : ''}
        <p><strong>Dirección:</strong> ${data.direccion || 'N/A'}</p>
        <p><small>GPS: ${hasLocation ? `${data.ubicacion_destino.latitude.toFixed(4)}, ${data.ubicacion_destino.longitude.toFixed(4)}` : 'No disponible'}</small></p>
        
        <div class="timeline-container">
          <strong>Historial de ruta:</strong>
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

// SIMULACIÓN DE RUTA Y REPARTIDOR
let marcadorRepartidorActivo = null;
let lineaRutaActiva = null;
let intervaloSimulacionActivo = null;

function generarRutaHaciaDestino(destLat, destLng, pasos = 6) {
  const startLat = destLat - 0.008;
  const startLng = destLng - 0.008;

  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const curva = Math.sin(t * Math.PI) * 0.0012;
    const lat = startLat + (destLat - startLat) * t + curva;
    const lng = startLng + (destLng - startLng) * t - curva * 0.5;
    puntos.push([lat, lng]);
  }
  puntos[puntos.length - 1] = [destLat, destLng];
  return puntos;
}

async function actualizarEstadoEnFirestore(docId, nuevoEstado) {
  if (!docId) return;
  try {
    const paqueteActual = packagesCache[docId];
    if (paqueteActual && paqueteActual.estado === nuevoEstado) return;

    await updateDoc(doc(db, "paquetes", docId), {
      estado: nuevoEstado,
      historial: arrayUnion({
        estado: nuevoEstado,
        fecha: new Date().toISOString()
      })
    });

    const tipoEventoEstado = nuevoEstado === "ENTREGADO"
      ? "PAQUETE_ENTREGADO"
      : "REPARTIDOR_EN_RUTA";

    await publicarEventoMensajeria(tipoEventoEstado, {
      paqueteId: docId,
      codigo_rastreo: paqueteActual?.codigo_rastreo || null,
      nuevo_estado: nuevoEstado
    });
  } catch (error) {
    console.error(`Error al actualizar estado a ${nuevoEstado}:`, error);
  }
}

async function ejecutarAnimacionHaciaDestino(destLat, destLng, etiqueta, docId = null) {
  limpiarSimulacionMapa();

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
      <strong style="color: #f59e0b;">Repartidor en Ruta</strong><br>
      <b>Destino:</b> ${etiqueta}<br>
      <b>Estado:</b> EN RUTA
    </div>
  `).openPopup();

  if (docId) {
    await actualizarEstadoEnFirestore(docId, "EN_RUTA");
  }

  intervaloSimulacionActivo = setInterval(async () => {
    paso++;
    if (paso < ruta.length) {
      const coordActual = ruta[paso];
      marcadorRepartidorActivo.setLatLng(coordActual);
      map.panTo(coordActual);

      await publicarEventoMensajeria(
        "TELEMETRIA_GPS",
        {
          paqueteId: docId,
          destino: etiqueta,
          paso: `${paso}/${ruta.length - 1}`,
          coordenadas: { lat: coordActual[0], lng: coordActual[1] }
        },
        false
      );

      if (paso === ruta.length - 1) {
        clearInterval(intervaloSimulacionActivo);
        marcadorRepartidorActivo.bindPopup(`
          <div style="font-family: sans-serif;">
            <strong style="color: #10b981;">¡Entrega Completada!</strong><br>
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

window.iniciarSimulacionRepartidor = async function() {
  const addressInput = document.getElementById('address');
  const codeInput = document.getElementById('trackingCode');
  const direccionTexto = addressInput ? addressInput.value.trim() : '';
  const codigoTexto = codeInput && codeInput.value.trim() ? codeInput.value.trim() : 'Nuevo Envío';

  if (!direccionTexto) {
    alert("Escribe primero una Dirección en el formulario para calcular la ruta hacia ese lugar.");
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
    alert("Este paquete no tiene coordenadas ni dirección válida.");
    return;
  }

  await ejecutarAnimacionHaciaDestino(
    lat,
    lng,
    `${paquete.codigo_rastreo || 'Paquete'} - ${paquete.direccion || ''}`,
    docId
  );
};

// BUS DE MENSAJERÍA
const MENSAJERIA_CONFIG = {
  brokerSimulado: "GeoTrack-EventBus (compatible con Pub/Sub / RabbitMQ)",
  topico: "geotrack.envios.eventos",
  guardarEnFirestore: true
};

async function publicarEventoMensajeria(tipoEvento, payload, registrarEnDb = true) {
  const mensaje = {
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    topic: MENSAJERIA_CONFIG.topico,
    eventType: tipoEvento,
    producer: "geotrack-web-client",
    timestamp: new Date().toISOString(),
    payload
  };

  console.log(` [${mensaje.topic}] ${mensaje.eventType}:`, mensaje);

  if (MENSAJERIA_CONFIG.guardarEnFirestore && registrarEnDb) {
    try {
      await addDoc(collection(db, "eventos_mensajeria"), {
        ...mensaje,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn("No se pudo persistir el evento en eventos_mensajeria:", error);
    }
  }

  return mensaje;
}
