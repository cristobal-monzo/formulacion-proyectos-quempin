# Intercambio con las demás herramientas de QUEMPIN

El formulador comparte información con las otras herramientas de QUEMPIN (Análisis Financiero, Centro de Costos, y más adelante Cotizador y Flujo de Caja) por una **carpeta de intercambio** sincronizada por OneDrive.

**Dónde está:** en la biblioteca de SharePoint *Formulación de proyectos - Documentos*, que el equipo ya tiene sincronizada, en `.Herramientas formulación/Intercambio/` (en el disco el nombre quedó en mayúsculas: `.HERRAMIENTAS FORMULACIÓN`). Ahí vive también el repositorio de las formulaciones compartidas. Se movió el 2026-09-30 desde *Finanzas QUEMPIN/Intercambio* para que todos los colegas tengan acceso.
- **Quién la ve:** todos los que entran a esa biblioteca. Eso incluye `publicado/analisis-financiero.json`, con los costos proyectados y reales por proyecto, y el buzón de envíos al Análisis Financiero. La decisión la tomó el usuario sabiendo esto.
- **«Oculta» solo en parte:** el punto inicial la separa de las carpetas de ofertas, y el modo SharePoint no la lista como oferta. SharePoint la muestra igual, y el atributo *oculto* de Windows se marcó solo en el computador de quien la movió: OneDrive no lo lleva a los demás.

- **No hay servidor ni base de datos.** La página abre la carpeta con la API de acceso a archivos del navegador (Chrome o Edge de escritorio).
- **No hay que iniciar sesión** en ningún servicio.
- **No depende del modo SharePoint** ni lo cambia: funciona igual con los proyectos guardados en el navegador o en SharePoint.

## Qué se puede hacer hoy

**Enviar los costos de una oferta adjudicada al Análisis Financiero.** Pasan a ser los *costos proyectados* del proyecto en ejecución, que después se comparan con el gasto real que registra el Centro de Costos.

1. En el paso **Evaluación**, sección *Análisis Financiero* (o en el menú **⋯** del proyecto), elige **Enviar costos…**.
2. La primera vez, elige la biblioteca **Formulación de proyectos - Documentos** de tu OneDrive. El formulador baja solo a su carpeta de intercambio. El navegador la recuerda y pide permiso una vez por sesión.
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

**Navegadores sin acceso a carpetas** (Firefox, Safari, celulares): el envío se descarga como archivo y se deja a mano en `.Herramientas formulación/Intercambio/buzon`.

**Todo presupuesto se guarda en la carpeta del equipo** (modo local, mientras no se use SharePoint). Es obligatorio desde el 2026-09-30, por pedido del usuario. Cada navegador guarda sus proyectos en `localStorage` y, además, los copia en `publicado/formulador/`, el repositorio de las formulaciones, y trae los de los demás.

1. Mientras la carpeta no esté conectada, la lista muestra **Conectar carpeta**, sin opción de posponerlo. Para conectarla se elige la biblioteca *Formulación de proyectos - Documentos*. En **Configuración → Carpeta compartida** se puede cambiar, pero no apagar.
2. **Crear un presupuesto exige la carpeta.** Esto vale para *Nuevo*, *Importar*, *Duplicar* y *Nueva versión*. Si no está conectada, se pide conectarla (*Conectar la biblioteca*). Si falta solo el permiso de la sesión, se pide en el mismo clic. Quien no tiene la biblioteca en ese computador puede elegir *Trabajar sin la carpeta* y entregar el presupuesto por archivo (ver abajo).
3. Desde ahí, cada guardado se copia a la carpeta a los 1,5 s. La lista revisa la carpeta cada 20 s con la página visible, al volver a la pestaña y al abrir la herramienta. OneDrive lleva los archivos de un equipo a otro.
4. Una línea bajo el título dice si está al día. El indicador del editor dice *Guardado en este navegador y en la carpeta compartida*.
5. **Lo que queda solo en un navegador se ve.** En la lista, esos presupuestos llevan la marca «Solo en este navegador». En el editor, un aviso ofrece *Conectar carpeta*, *Dar permiso* o *Descargar para el equipo*. El navegador pide permiso para la carpeta una vez por sesión: el aviso de la lista ofrece **Dar permiso y sincronizar**.

**Entrega por archivo** (Firefox, Safari, celulares, o sin la biblioteca en el computador):
- *Descargar para el equipo* baja el presupuesto como mensaje `formulacion` para el buzón (`AAAAMMDD-HHMMSS_formulador_formulacion_<id>.json`). Se deja en `.Herramientas formulación/Intercambio/buzon`. En la lista, *Descargar para el equipo* baja todos los pendientes.
- Desde ahí el editor dice «Descargado para el equipo» hasta que se vuelva a cambiar.
- Claude lo incorpora al repositorio en el paso 0 de `/Actualizar_Finanzas`, o con `driver.py formulaciones incorporar` del Análisis Financiero. Usa las mismas reglas de quién gana; si choca con otra versión, queda como copia «(entregado por archivo)».

**Claude revisa los presupuestos.** Cada archivo del repositorio trae un `resumen` calculado por el mismo motor de la página (`QCalc`): costo directo, gastos generales, imprevistos, costo total, utilidad, precio neto, margen, costos por categoría del Análisis Financiero (`costosAF`), errores y alertas. Con eso, `/Actualizar_Finanzas` hace dos cosas:
- resume al usuario los presupuestos nuevos o cambiados;
- propone cargar en el Análisis Financiero los *Adjudicada* que no están cargados. Pregunta el TAG y deja el mismo `presupuesto-proyecto` que el botón *Enviar costos*.

Python no recalcula precios: si se calcularan dos veces, terminarían divergiendo.

Un colega necesita la biblioteca *Formulación de proyectos - Documentos* sincronizada en su computador (botón *Sincronizar* en SharePoint, o *Agregar acceso directo a Mis archivos*). En el formulador elige esa biblioteca al conectar.

Si la carpeta cambia de lugar, el formulador lo detecta porque ya no encuentra su `intercambio.json`. En ese caso avisa «La carpeta compartida cambió de lugar» y pide volver a elegir la biblioteca. Mientras tanto, los proyectos siguen guardándose en el navegador.

Cómo se resuelve quién gana, sin un reloj común entre equipos:
- Cada archivo lleva la versión del proyecto (`datos.modificado`, que nunca se repite en un mismo proyecto) y su `historia`: las versiones anteriores que pasaron por la carpeta. Cada navegador recuerda la última versión que sincronizó de cada proyecto (`qpn.formulacion.compartida.v1` en `localStorage`).
- Si la carpeta viene de esa versión y aquí no se tocó, se trae. Si aquí se editó y la carpeta sigue igual, se sube.
- Si cambiaron los dos, o la carpeta perdió una versión que subió este navegador (un conflicto de OneDrive), se trae la de la carpeta y **los cambios de aquí quedan como un proyecto aparte** con «(cambios sin subir)» en el título. Si el proyecto estaba abierto con cambios sin guardar, se pregunta como en SharePoint.
- Eliminar manda a la papelera de todos. En los navegadores que pueden abrir la carpeta no hay *Eliminar definitivamente*: el archivo queda en la carpeta.
- Las copias que deja OneDrive en un conflicto (`<uid>-EQUIPO.json`) y cualquier archivo que no sea `<uid>.json` se ignoran.
- Dos pestañas del mismo navegador se avisan los cambios y sincronizan de a una.

## Con las demás herramientas (plan de integración, 2026-10-01)

Además de los costos, el formulador usa la carpeta para trabajar con el resto de las herramientas
de QUEMPIN. Todo está en `js/herramientas.js` (la interfaz, en la sección *OTRAS HERRAMIENTAS* de
`js/app.js`) y nada requiere iniciar sesión.

| Dónde | Qué hace | Mensaje o publicación |
|---|---|---|
| Paso 1 · N° de requerimiento | La clave común de proyecto: el N° de la *Planilla de Ingreso*. La lista muestra los 20 últimos ingresados (el N° es correlativo), del más nuevo al más antiguo; al escribir se suman los anteriores que calzan con el N° o el título. «Completar desde la planilla» llena título, ubicación y presupuesto (con IVA) **solo si están vacíos**. Se guarda en `vinculos.requerimiento`. En modo SharePoint, el código ya es ese N°. | con la biblioteca conectada lee la planilla misma (raíz de la biblioteca, al día, mismo formato que `requerimientos.py`); si no, `publicado/requerimientos.json` |
| Paso 3 · botón **$** (materiales y equipos) | Busca compras parecidas con el mismo buscador del tablero del Cotizador y ofrece el **promedio** o la **última compra**, sin IVA y reajustadas por UF. El ítem guarda de dónde salió (`precioRef`). | lee `publicado/precios-referencia.json` |
| Paso 5 · simulador de sobrecostos | «Simular con el sesgo real»: usa la desviación real del presupuesto por categoría en los proyectos terminados. Queda anotado en `parametros.sensibilidadOrigen`. | lee `sesgo` de `publicado/analisis-financiero.json` |
| Seguimiento · Cotización en Sistema QUEMPIN | Envía las partidas con su precio neto unitario. En Sistema QUEMPIN aparecen arriba de «Nueva Cotización» («Revisar y emitir…»; también el botón «Borradores del Formulador» al pie); una persona la revisa y la emite, y el seguimiento muestra el número. | mensaje `borrador-cotizacion`; lee `publicado/documentos-comerciales.json` y `contrapartes.json` |
| Seguimiento · Venta al Análisis Financiero | Con la oferta **Adjudicada**, va en el mismo envío que los costos («Pasar a ejecución», marcada por defecto) o sola después: el monto sale de la cotización emitida en pesos o, si no hay, del precio neto del paso 4. Mismas garantías que los costos. Si el envío crea el proyecto en el Análisis Financiero, la venta se deja un segundo después, para que se decida detrás de él. | mensaje `venta-proyecto` |
| Seguimiento · Planilla de Ingreso | Con la oferta **Enviada** (Ofertado), **Adjudicada** (Adjudicado), **Perdida** (No adjudicado) o **Descartada** (Descartado), avisa el estado y, si se envió o adjudicó, el valor con IVA. «Marcar como Enviada / Perdida» del recorrido lo hace en el mismo clic, y «Pasar a ejecución» lleva el de la adjudicación. Un aviso igual al último no se repite. **Nadie escribe la planilla**: quien la lleva lo pasa a mano (`/Sugerencias_Requerimientos`) y el aviso se cierra solo cuando la planilla ya lo muestra. | mensaje `actualizar-requerimiento` |
| Seguimiento · Control de Documentos | Registra la evaluación de costos (tipo 81) sola, al elegir la carpeta de la oferta: al crear o duplicar con carpeta, al unirla a una y al crear una versión nueva que la hereda. Una por versión y solo desde el navegador donde se eligió la carpeta; las iniciales se piden una vez por navegador y el país es Chile. Propone el siguiente del Control, o uno más que el último que el equipo propuso y Sistema QUEMPIN todavía no atiende; si ya se usó, Sistema QUEMPIN asigna otro y el proyecto se queda con el definitivo. «Registrar ahora» queda para la versión con carpeta que no alcanzó a registrarse. El Excel exportado lleva el número adelante. | mensaje `registro-documento`; lee `publicado/folios.json` |
| Seguimiento y Configuración · pulso | «Las demás herramientas revisaron la carpeta hace N min»: lo publica el procesador del intercambio cada 2 horas. | lee `publicado/estado.json` |
| Barra del recorrido y pestaña Seguimiento (y pie del paso 5, lista) | El recorrido en seis etapas y la acción que sigue (`js/flujo.js`). Lo que Sistema QUEMPIN respondió al borrador (estado y N°) queda en `vinculos.sistemaQuempin.ultimoBorrador`, para que la lista y el aviso del editor lo sepan sin leer la carpeta. | lee `documentos-comerciales`, `analisis-financiero` (avance para el cierre) y la planilla |

Antes de dejar cualquier mensaje, se valida contra el catálogo de esquemas que el procesador deja
en la carpeta (`esquemas.json`, con `js/esquemas.js`, gemelo de `esquemas.py`). El formato de cada
mensaje y publicación está en `Finanzas QUEMPIN/Sistema Intercambio/esquemas/`.

Pruebas: `.prueba/integracion/` (datos ficticios con `generar_datos.py`, y `e2e.js` sobre una
biblioteca simulada en el almacenamiento privado del navegador; 22 comprobaciones).

## La carpeta

```
Formulación de proyectos - Documentos/   biblioteca de SharePoint
├── .Herramientas formulación/
│   └── Intercambio/
│       ├── intercambio.json   marca que identifica la carpeta (esquema quempin.intercambio/1)
│       ├── buzon/             mensajes que una herramienta le envía a otra
│       ├── procesado/AAAA-MM/ mensajes ya atendidos, con su resultado
│       └── publicado/         lo que cada herramienta publica para las demás
│           ├── analisis-financiero.json
│           └── formulador/    repositorio de formulaciones: un archivo por proyecto, <uid>.json
└── 301. Oferta de ejemplo/     carpeta de una oferta: el formulador solo agrega su copia en Excel
    └── Formulación QPN-2026-001 v1.xlsx
```

Reglas:
- **Cada herramienta es dueña de sus datos.** El formulador nunca escribe los archivos de otra herramienta: deja mensajes en `buzon/` y lee lo que las otras publican en `publicado/`.
- **El destinatario decide** si aplica cada mensaje, con sus propias validaciones y respaldos. Después lo mueve a `procesado/` con el resultado.

Al conectar se puede elegir la biblioteca completa, `.Herramientas formulación` o la carpeta `Intercambio`: el formulador baja solo, sin distinguir mayúsculas. Una carpeta *Intercambio* nueva y vacía se prepara al conectarla.

Elegir la biblioteca le da permiso al navegador sobre toda ella. El formulador escribe en dos lugares:
- dentro de `Intercambio`;
- desde el 2026-10-02, en la carpeta de oferta elegida para cada presupuesto, solo su propio Excel (`Formulación <código> v<versión>.xlsx`, ver `js/oferta.js` y el README).

Para eso recuerda la biblioteca además de la carpeta de intercambio. Quien conectó `.Herramientas formulación` o `Intercambio` sigue compartiendo igual, pero para el Excel en la carpeta de la oferta tiene que elegir la biblioteca completa (el editor lo avisa). Volver a elegir la misma carpeta no reinicia la sincronización.

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

## Publicación `formulador`

`publicado/formulador/<uid>.json`, uno por presupuesto, es el repositorio de las formulaciones. Lo escribe el formulador de cada equipo y, con las entregas por archivo, `formulaciones.py` de Finanzas QUEMPIN. Lo leen los demás formuladores y Claude, en el comando `formulaciones` del Análisis Financiero:

```json
{
  "esquema": "quempin.intercambio/1",
  "herramienta": "formulador",
  "tipo": "proyecto",
  "generado": "2026-09-30T18:20:01.512Z",
  "autor": "Responsable por defecto de quien guardó (Configuración)",
  "historia": ["2026-09-29T14:02:10.004Z", "2026-09-30T12:11:45.870Z"],
  "resumen": { "moneda": "CLP", "costoDirecto": 2046404, "gastosGenerales": 0, "imprevistos": 0, "costoTotal": 2046404,
               "utilidad": 2046404, "precioNeto": 4092808, "margen": 0.5,
               "costosAF": { "Materiales": 126404, "Equipos": 0, "Mano de Obra": 1800000, "Otros": 120000 }, "errores": 1, "alertas": 0 },
  "datos": { "uid": "a1b2c3d4e5f6", "codigo": "QPN-2026-001", "version": 1, "modificado": "2026-09-30T18:20:00.000Z", "…": "el proyecto completo, igual que en la exportación JSON" }
}
```

El mensaje `formulacion` (entrega por archivo) lleva lo mismo dentro del sobre de un mensaje: `id`, `tipo: "formulacion"`, `destino: "formulador"` y `origen {herramienta, usuario, enviado}`, más `historia`, `resumen` y `datos`.

## Código

- `js/intercambio.js`: carpeta, permisos, lectura de publicaciones, envío de mensajes y descarga de respaldo. Sin dependencias.
- `js/compartida.js`: proyectos compartidos por la carpeta (decisión de quién gana, lectura y escritura de `publicado/formulador/`, momentos de sincronización, resumen calculado y entrega por archivo). Usa `QStore`, `QCalc` e `QIntercambio`; no hace nada con SharePoint configurado.
- `js/app.js`, sección *CARPETA COMPARTIDA*: aviso de la lista, aviso del editor, marca «Solo en este navegador» y exigencia de la carpeta al crear (`exigirCarpeta`).
- `js/app.js`, sección *ANÁLISIS FINANCIERO*: diálogo de envío, panel del paso Evaluación y opción en Configuración.
- El vínculo con el Análisis Financiero queda en el propio proyecto (`vinculos.analisisFinanciero`: TAG, nombre y último envío). Así viaja con el proyecto en el modo local, en SharePoint y en las exportaciones JSON.
