/*
 * m365-config.js — Conexión con SharePoint (Microsoft 365 de QUEMPIN).
 * Ver docs/SHAREPOINT.md para registrar la herramienta en Microsoft Entra y obtener clientId.
 * Mientras clientId esté vacío, la herramienta funciona en modo local (proyectos en el navegador).
 * Estos valores identifican la aplicación y la biblioteca, y pueden ser públicos: no dan acceso
 * por sí solos. Cada persona entra con su cuenta de QUEMPIN y ve solo lo que SharePoint le permite.
 */
window.QPN_M365 = {
  // «Id. de aplicación (cliente)» del registro en Microsoft Entra
  clientId: '',
  // Microsoft 365 de QUEMPIN SPA
  tenantId: '368afb81-f6a9-4b23-95ff-bd048dca44fd',
  // Sitio «Formulación de proyectos»; se usa su biblioteca de documentos
  sitio: 'quempinspa2020.sharepoint.com:/sites/Licitaciones-Enproceso',
  // Carpeta de la biblioteca donde trabaja la herramienta. Vacío = toda la biblioteca.
  // Para un piloto, el nombre de una carpeta de prueba (p. ej. 'ZZ Pruebas formulador'):
  // la herramienta no ve ni escribe nada fuera de ella.
  raiz: '',
  // Planilla de ingreso en la raíz de la biblioteca (solo lectura)
  planilla: 'Planilla de Ingreso de Requerimientos.xlsx',
  // La misma planilla en Excel para la web: el link «Abrir la planilla» junto al N° de requerimiento
  planillaWeb: 'https://quempinspa2020.sharepoint.com/sites/Licitaciones-Enproceso/Documentos%20compartidos/Planilla%20de%20Ingreso%20de%20Requerimientos.xlsx?web=1',
  // Carpeta donde queda «Formulador - configuración.json» (tarifas, IVA y metas del equipo)
  carpetaConfig: '2 ARCHIVOS Y INFORMACION FRECUENTE'
};
