/*
 * firebase-config.js — Conexión con el proyecto Firebase de QUEMPIN.
 * Pega aquí los valores de Firebase → Configuración del proyecto → Tus apps → App web
 * (ver docs/FIREBASE.md). Estos valores identifican el proyecto y pueden ser públicos:
 * la seguridad la dan el ingreso con correo y las reglas de firestore.rules.
 * Si apiKey queda vacío, la herramienta funciona en modo local (proyectos en el navegador).
 */
window.QPN_FIREBASE = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
