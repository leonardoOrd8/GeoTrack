Instituto Politécnico Nacional
Unidad Profesional Interdisciplinaria de Ingeniería y Ciencias Sociales y Administrativas (UPIICSA)
Materia: Bases de Datos No SQL
Secuencia: 6CM68
Profesor: Yventz Entzana Garduño
Proyecto: GeoTrack Firestore

Integrantes del Equipo:
Embríz Torres Natali Elena
Medel Cortes Logan Yarom
Ordoñez Gomez Leonardo

GeoTrack Firestore - Sistema de Monitoreo e Inventario Last-Mile
1. Descripción General
En la logística moderna de paquetería local, el rastreo de envíos en la última milla (last-mile) representa uno de los mayores retos técnicos debido a la alta dinamicidad de la información. Este proyecto consiste en el desarrollo de una plataforma web/móvil ligera orientada al monitoreo en tiempo real, registro de eventos y gestión de inventario en ruta para repartidores urbanos.

El sistema resuelve la problemática del acoplamiento rígido de esquemas relacionales utilizando el modelo documental de Firebase Cloud Firestore, optimizando la latencia en lecturas y escrituras intensivas con sincronización en tiempo real (real-time listeners).

2. Objetivos
Objetivo General
Diseñar e implementar una base de datos NoSQL alojada en la nube mediante Firebase Cloud Firestore (Google Cloud Platform), integrada a una arquitectura web/móvil, para centralizar la telemetría, el inventario dinámico y el historial de eventos en el proceso de entregas de última milla.

Objetivos Específicos
Diseñar un modelo de datos flexible: Estructurar documentos y subcolecciones heterogéneas para almacenar paquetes e historial de estados.
Implementar consultas geoespaciales: Utilizar tipos de datos nativos GeoPoint y geohashing para determinar la proximidad entre unidades de reparto y destinos.
Seguridad en la nube: Configurar reglas de seguridad (Firebase Security Rules) y autenticación para proteger el acceso a los datos.
Procesamiento analítico: Desarrollar Cloud Functions y consultas analíticas para medir métricas de rendimiento y entrega.

3. Base de Datos
Tecnología: Firebase Cloud Firestore (Google Cloud Platform)
Tipo: NoSQL Documental (Documentos / Colecciones JSON)
Estructura de Colecciones:
usuarios: Perfiles de repartidores, clientes y administradores.
paquetes: Información del envío, peso, estado e historial.
rutas_telemetria: Trazas GPS transmitidas por repartidores con GeoPoint y marcas de tiempo.
