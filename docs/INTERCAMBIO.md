# Intercambio con las demás herramientas de QUEMPIN

El formulador comparte información con las otras herramientas de QUEMPIN (Análisis Financiero, Centro de Costos, y más adelante Cotizador y Flujo de Caja) por una **carpeta de intercambio** sincronizada por OneDrive.

- **No hay servidor ni base de datos.** La página abre la carpeta con la API de acceso a archivos del navegador (Chrome o Edge de escritorio).
- **No hay que iniciar sesión** en ningún servicio.
- **No depende del modo SharePoint** ni lo cambia: funciona igual con los proyectos guardados en el navegador o en SharePoint.

## Qué se puede hacer hoy

**Enviar los costos de una oferta adjudicada al Análisis Financiero.** Pasan a ser los *costos proyectados* del proyecto en ejecución, que después se comparan con el gasto real que registra el Centro de Costos.

1. En el paso **Evaluación**, sección *Análisis Financiero* (o en el menú **⋯** del proyecto), elige **Enviar costos…**.
2. La primera vez, elige la carpeta **Finanzas QUEMPIN › Intercambio**. El navegador la recuerda y pide permiso una vez por sesión.
3. Elige el proyecto del Análisis Financiero. La lista la publica el propio Análisis Financiero. La tabla compara, por categoría, lo que tiene hoy y lo que se enviará, y avisa si reemplazará valores escritos a mano.
4. **Enviar.** El envío queda en la carpeta y se aplica en la próxima actualización del Análisis Financiero, con respaldo previo.
5. El panel del paso Evaluación muestra en qué quedó el envío:
   - *En espera*: todavía no se procesa.
   - *Aplicado*: ya está en el Análisis Financiero.
   - *Requiere decisión*: allá hay valores escritos a mano que no se veían al enviar.
   - *Reemplazado*, *Rechazado* o *Descartado*.
   
   El panel también avisa si los costos cambiaron después del último envío.

Qué se envía:

| Categoría del Análisis Financiero | Sale de |
|---|---|
| Materiales | Total de materiales del proyecto |
| Equipos | Total de equipos |
| Mano de Obra | Total de mano de obra (días-hombre × tarifa) |
| Otros | Total de otros costos |

- **Gastos generales e imprevistos no se envían.** El Análisis Financiero compara costos directos contra el gasto real, y los gastos generales de la empresa tienen su propio proyecto.
- **Si el TAG no existe todavía** en el Análisis Financiero, se puede escribir a mano en la opción *Otro* junto con el nombre del proyecto. El Análisis Financiero lo crea con ese nombre.

**Garantías del lado del Análisis Financiero:**
- Nunca reemplaza un valor escrito a mano que no se haya visto al enviar.
- Nunca aplica un envío a medias.
- Cada celda escrita lleva una nota de Excel con su procedencia: oferta, versión, quién la envió y cuándo.

**Navegadores sin acceso a carpetas** (Firefox, Safari, celulares): el envío se descarga como archivo y se deja a mano en `Intercambio/buzon`.

## La carpeta

```
Intercambio/
├── intercambio.json   marca que identifica la carpeta (esquema quempin.intercambio/1)
├── buzon/             mensajes que una herramienta le envía a otra
├── procesado/AAAA-MM/ mensajes ya atendidos, con su resultado
└── publicado/         lo que cada herramienta publica para las demás
```

Reglas:
- **Cada herramienta es dueña de sus datos.** El formulador nunca escribe los archivos de otra herramienta: deja mensajes en `buzon/` y lee lo que las otras publican en `publicado/`.
- **El destinatario decide** si aplica cada mensaje, con sus propias validaciones y respaldos. Después lo mueve a `procesado/` con el resultado.

Si se elige la carpeta de arriba (*Finanzas QUEMPIN*), el formulador baja sola a *Intercambio*. Una carpeta *Intercambio* nueva y vacía se prepara al conectarla.

## Mensaje `presupuesto-proyecto`

Cada archivo del buzón se llama `AAAAMMDD-HHMMSS_formulador_presupuesto-proyecto_<id>.json`. Ejemplo con datos ficticios:

```json
{
  "esquema": "quempin.intercambio/1",
  "id": "3f9c0d2b7a1e4c5d6f708192",
  "tipo": "presupuesto-proyecto",
  "destino": "analisis-financiero",
  "origen": { "herramienta": "formulador", "usuario": "persona@empresa.cl", "enviado": "2026-09-30T15:30:12-03:00" },
  "proyecto": { "tag": "OBRA" },
  "fuente": { "uid": "a1b2c3d4e5f6", "codigo": "100", "version": 2, "titulo": "Oferta de ejemplo", "cliente": "Cliente de ejemplo", "estado": "Adjudicada", "modificado": "2026-09-30T18:20:00.000Z" },
  "costos": { "Materiales": 1000000, "Equipos": 200000, "Mano de Obra": 450000, "Otros": 150000 },
  "informativo": { "moneda": "CLP", "costoDirecto": 1800000, "gastosGenerales": 0, "imprevistos": 0, "costoTotal": 1800000, "precioNeto": 2571429 },
  "reemplaza": { "Materiales": null, "Equipos": null, "Mano de Obra": 380000, "Otros": null }
}
```

- `costos`: pesos enteros por categoría.
- `reemplaza`: lo que la persona vio en el Análisis Financiero al decidir (`null` = vacío). Funciona como un *If-Match*:
  - autoriza a reemplazar esos valores, y solo esos;
  - si allá cambiaron antes de aplicarse, el envío queda esperando una decisión.
- `proyecto.crear` + `proyecto.nombre`: solo cuando el TAG no está en la lista y se pide crear el proyecto.

## Publicación `analisis-financiero`

`publicado/analisis-financiero.json` la escribe el Análisis Financiero al final de cada actualización. Contiene:
- **Sus proyectos**: TAG, nombre, cliente, categoría y avance; costos proyectados por categoría, con su origen (escrito a mano o enviado desde el formulador); y costos reales por categoría, que vienen del Centro de Costos.
- **El estado de los mensajes recibidos**.

El formulador solo la lee. Así el Centro de Costos comparte sus datos sin que se modifique ni se toque su ingreso de facturas.

## Código

- `js/intercambio.js`: carpeta, permisos, lectura de publicaciones, envío de mensajes y descarga de respaldo. Sin dependencias.
- `js/app.js`, sección *ANÁLISIS FINANCIERO*: diálogo de envío, panel del paso Evaluación y opción en Configuración.
- El vínculo con el Análisis Financiero queda en el propio proyecto (`vinculos.analisisFinanciero`: TAG, nombre y último envío). Así viaja con el proyecto en el modo local, en SharePoint y en las exportaciones JSON.
