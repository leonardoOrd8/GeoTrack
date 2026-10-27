// Importar funciones necesarias desde los servidores CDN de Firebase (versión 10.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  GeoPoint, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ REEMPLAZA ESTE OBJETO CON LAS CLAVES QUE COPIASTE DE TU CONSOLA DE FIREBASE
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

// 1. ESCUCHAR EL FORMULARIO Y GUARDAR EN FIRESTORE
if (packageForm) {
  packageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Obtener los datos introducidos por el usuario
    const code = document.getElementById('trackingCode').value;
    const recipient = document.getElementById('recipient').value;
    const address = document.getElementById('address').value;
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    const status = document.getElementById('status').value;

    try {
      // Crear un documento en la colección 'paquetes' de Firestore[cite: 5]
      await addDoc(collection(db, "paquetes"), {
        codigo_rastreo: code,
        destinatario: recipient,
        direccion: address,
        estado: status,
        ubicacion_destino: new GeoPoint(lat, lng), // Tipo nativo GeoPoint para mapas/GPS[cite: 5]
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
    }
  });
}

// 2. ESCUCHAR CAMBIOS EN TIEMPO REAL (onSnapshot)
// Cada vez que se agregue o cambie un paquete en la nube, se actualizará la pantalla automáticamente
onSnapshot(collection(db, "paquetes"), (snapshot) => {
  if (!packageList) return;

  packageList.innerHTML = "";

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

    if (data.estado === 'EN_RUTA') enRuta++;
    if (data.estado === 'ENTREGADO') entregados++;

    const item = document.createElement('div');
    item.className = 'package-item';
    item.innerHTML = `
      <div class="package-info">
        <h4>📦 ${data.codigo_rastreo}</h4>
        <p><strong>Destinatario:</strong> ${data.destinatario}</p>
        <p><strong>Dirección:</strong> ${data.direccion}</p>
        <p><small>GPS: ${data.ubicacion_destino ? `${data.ubicacion_destino.latitude},${data.ubicacion_destino.longitude}` : 'No disponible'}</small></p>
      </div>
      <div>
       <span class="badge ${data.estado || 'EN_ALMACEN'}">${(data.estado || 'EN_ALMACEN').replace('_', ' ')}</span>
      </div>
    `;
    packageList.appendChild(item);
  });

  // Actualizar métricas del Dashboard
  if (totalPackagesEl) totalPackagesEl.textContent = total;
  if (inTransitPackagesEl) inTransitPackagesEl.textContent = enRuta;
  if (deliveredPackagesEl) deliveredPackagesEl.textContent = entregados;
});
