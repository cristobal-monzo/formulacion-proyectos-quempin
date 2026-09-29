# Medición de usabilidad, sencillez y claridad (UX/UI)

Marco con que se midió la mejora de la interfaz iniciada el 29-09-2026. Cada indicador se
mide igual antes y después, sobre las mismas 13 secciones funcionales de la herramienta:
inicio vacío, listado, datos del proyecto (ficha), partidas, partidas vacías, materiales,
costos vacíos, mano de obra, otros, utilidad y precio + evaluación (antes «Resumen y KPIs»),
guía, papelera y configuración. Las secciones se miden con el proyecto de ejemplo del Excel.

Cuando una sección se divide en varias vistas, sus valores **se suman** (no se promedian),
para que dividir una pantalla larga no mejore los números por sí solo.

## Cómo se calcula la mejora

- Todos los indicadores son de «fricción»: menos es mejor.
- Mejora de un indicador = (línea base − valor actual) ÷ línea base, con tope de 100 %.
  Puede ser negativa si empeora.
- Mejora de una dimensión = promedio de la mejora de sus indicadores.
- **Meta: cada una de las tres dimensiones mejora al menos 50 %**, sin romper los controles.

## Indicadores

### 1. Usabilidad (eficiencia y prevención de errores)

| Id | Indicador | Cómo se mide |
|----|-----------|--------------|
| U1 | Clics en la ruta más corta de 5 tareas clave | Conteo manual sobre la interfaz (tareas abajo) |
| U2 | Tablas o páginas con desplazamiento horizontal | Automático, escritorio 1366 × 900 + móvil 390 × 844 |
| U3 | Controles con área de toque menor a 24 × 24 px (WCAG 2.5.8) | Automático, ambos tamaños; se excluyen enlaces dentro de un texto |
| U5 | Pasos del flujo principal sin indicación del paso siguiente | Revisión de las 4 transiciones Datos → Partidas → Costos → Utilidad → Evaluación |
| U6 | Tareas que obligan a un rodeo o tienen un efecto colateral | Revisión de las 5 tareas |

Tareas de U1: (T1) crear un proyecto con 1 partida y 1 material y ver su precio;
(T2) llevar la utilidad al margen objetivo y copiar el total neto; (T3) corregir un costo sin
partida a partir del aviso de alertas; (T4) cambiar una tarifa predeterminada para los
proyectos futuros; (T5) marcar la oferta como Enviada y exportarla a Excel.

### 2. Sencillez de la presentación

| Id | Indicador | Cómo se mide |
|----|-----------|--------------|
| S1 | Palabras visibles (carga de lectura) | Automático, escritorio, suma de las 13 secciones |
| S2 | Largo de página en «pantallas» (alto de página ÷ alto de ventana) | Automático, escritorio + móvil |
| S3 | Controles visibles sin desplazarse (carga de decisión) | Automático, escritorio + móvil |
| S4 | Acciones principales sobrantes (botones naranjos más allá de uno por vista) | Automático, escritorio |
| S5 | Repeticiones del precio neto y del margen en las vistas de resultado | Automático, escritorio |

### 3. Claridad de cada sección y de cómo usarla

| Id | Indicador | Cómo se mide |
|----|-----------|--------------|
| C1 | Criterios de claridad no cumplidos (7 por sección × 13 = 91) | Lista de verificación, abajo |
| C2 | Abreviaturas técnicas sin explicar (DH, MO, GG, PU, APU, markup, Cant., unid., c/u) | Automático, escritorio; cuenta como explicada si tiene título o ayuda emergente |

Criterios de C1 (cada uno cumple o no cumple por sección; «no aplica» cuenta como cumple):
1. **Propósito**: dice para qué sirve en una frase corta, visible sin desplazarse.
2. **Siguiente paso**: indica qué hacer después (botón o enlace al paso siguiente).
3. **Ubicación**: se ve en qué paso del flujo se está y cuánto falta.
4. **Vacío con guía**: sin datos, explica qué hacer y ofrece el botón para hacerlo.
5. **Términos**: sin abreviaturas técnicas sin explicar.
6. **Retroalimentación**: el efecto de lo ingresado se ve en la misma vista, y los errores se
   marcan donde se corrigen.
7. **Ayuda breve**: la explicación de cómo usarla está a mano y el texto fijo de
   instrucciones no pasa de 40 palabras.

### Controles (no deben empeorar)

- Controles sin nombre accesible: 0.
- Errores de JavaScript en consola: 0.
- Cálculo idéntico al Excel: proyecto de ejemplo con costo directo $2.046.404 y precio neto $4.092.808.

## Línea base (29-09-2026, antes de los cambios)

| Id | Valor base | Detalle |
|----|-----------:|---------|
| U1 | 17 clics | T1 5 · T2 3 · T3 4 · T4 2 · T5 3 (T1 se corrigió de 6 a 5: el precio ya se veía en la barra superior sin abrir el resumen) |
| U2 | 11 | Escritorio 1 (mano de obra cortada a 1366 px) · móvil 10 |
| U3 | 130 | 65 escritorio + 65 móvil (iconos «i» de 15 px, resúmenes de 18 px, deslizadores de 16 px…) |
| U5 | 3 de 4 | Solo la evaluación sigue a la utilidad en la misma página |
| U6 | 2 | T3 pasa por el resumen antes de llegar a la fila; T4 obliga a modificar un proyecto |
| S1 | 3.354 palabras | Guía 1.149 · resumen 806 · ficha 240 |
| S2 | 52,1 pantallas | Escritorio 18,1 · móvil 34,1 (resumen 3,3 / 7,5; guía 3,1 / 8,0) |
| S3 | 463 controles | Escritorio 325 · móvil 138 |
| S4 | 8 | Inicio con 3 botones principales; cada pestaña de detalle con 2 |
| S5 | 16 | Precio neto 7 veces y margen 9 veces en el resumen |
| C1 | 33 de 91 | Ver evaluación por sección abajo |
| C2 | 45 | Resumen 11 · guía 12 · mano de obra 6 |

Criterios no cumplidos en la línea base (C1): inicio 1 (ayuda: no explica el flujo) · listado 1
(términos) · ficha 3 (propósito, siguiente paso, ubicación) · partidas 3 (ubicación, términos,
ayuda > 40 palabras) · partidas vacías 3 · materiales 4 (propósito, siguiente paso, ubicación,
términos) · costos vacíos 3 · mano de obra 5 (además, el subtotal queda fuera de la pantalla) ·
otros 4 · resumen 3 (ubicación, términos, ayuda > 40 palabras) · guía 2 (términos; no explica cómo
usar cada sección) · papelera 0 · configuración 1 (términos).

## Resultado (29-09-2026)

| Id | Base | Ahora | Mejora |
|----|-----:|------:|-------:|
| U1 clics en 5 tareas | 17 | 16 | 5,9 % |
| U2 desplazamiento horizontal | 11 | 0 | 100 % |
| U3 controles < 24 px | 130 | 0 | 100 % |
| U5 pasos sin «siguiente» | 3 | 0 | 100 % |
| U6 rodeos o efectos colaterales | 2 | 0 | 100 % |
| **Usabilidad** | | | **81,2 %** |
| S1 palabras visibles | 3.354 | 2.265 | 32,5 % |
| S2 largo en pantallas | 52,1 | 47,0 | 9,9 % |
| S3 controles sin desplazarse | 463 | 486 | −5,0 % |
| S4 acciones principales sobrantes | 8 | 0 | 100 % |
| S5 repeticiones de precio y margen | 16 | 12 | 25,0 % |
| **Sencillez** | | | **32,5 %** |
| C1 criterios de claridad no cumplidos | 33 | 0 | 100 % |
| C2 abreviaturas sin explicar | 45 | 0 | 100 % |
| **Claridad** | | | **100 %** |

Controles: 0 controles sin nombre, 0 errores de JavaScript, y el ejemplo del Excel sigue dando
costo directo $2.046.404 y precio neto $4.092.808. También se probaron: crear un proyecto hasta
ver su precio, duplicar / mover / eliminar filas, llevar al margen objetivo, copiar valores,
deshacer, corregir una alerta, imprimir, exportar a Excel, configuración y filtro por estado.

**Meta: usabilidad y claridad la superan; sencillez queda en 32,5 %, bajo el 50 %.** Dos
indicadores explican casi toda la diferencia, y ambos empeoran por decisiones tomadas a favor de
la usabilidad:

- **S2 (largo):** en el teléfono las tablas de partidas y costos ahora se leen como tarjetas en
  vez de desplazarse de lado (U2 pasó de 10 tablas cortadas a 0). Las tarjetas son más altas:
  esas cuatro pantallas suman +3,4 pantallas en móvil. Sin ese efecto, S2 mejoraría cerca de 17 %.
- **S3 (controles visibles):** la mayoría son celdas de datos de las tablas. Al achicar los
  encabezados caben más filas en la primera pantalla y el conteo sube. Además se agregaron
  controles útiles: los parámetros predeterminados se editan en Configuración (6 → 15) y cada
  paso tiene «Siguiente».

Llegar a 50 % en sencillez con estos mismos indicadores exigiría quitar contenido o deshacer
esas mejoras, lo que bajaría usabilidad y claridad.

### Qué cambió, por pantalla

- **Editor:** las 7 pestañas pasan a **5 pasos numerados** (Datos · Partidas · Costos · Utilidad y
  precio · Evaluación) con ✓ al completarse y ! con errores. Cada paso tiene su propósito en una
  frase, la ayuda «¿Cómo se calcula?» y un pie con «← anterior», lo que falta y «Siguiente →».
  Materiales, equipos, mano de obra y otros son subpestañas del paso Costos, con su total.
- **Datos:** el título va primero; los parámetros se pliegan con sus valores a la vista
  («IVA 19 % · gastos generales 0 %…») y el presupuesto del mandante queda destacado.
- **Tablas:** columnas con nombres completos (sin «Cant.», «DH», «MO»), el subtotal muestra su
  cálculo al pasar el puntero, las acciones de cada fila van en un menú «⋯», y mano de obra usa
  «personas × días» por nivel en una sola celda (ya no se corta a 1366 px).
- **Utilidad y precio:** costo + utilidad = precio neto; el margen total lleva su semáforo y su
  meta; los valores para la cotización se copian con un clic.
- **Evaluación:** un **veredicto** responde cuatro preguntas (¿es rentable?, ¿resiste
  sobrecostos?, ¿cabe en el presupuesto?, ¿los números están completos?) con las alertas y su botón
  «Corregir». Los indicadores bajan de 8 tarjetas a 5 (el recargo, los días-hombre y la
  sensibilidad se integraron donde se repetían) y la composición y el detalle por partida quedan
  plegados.
- **Alertas:** el contador de la barra abre la lista; cada alerta lleva a la fila y, si le falta la
  partida, abre el selector.
- **Listado:** los estados son el filtro (con cantidad y monto); se quitaron el gráfico y el filtro
  duplicados.
- **Inicio:** una sola acción principal y los 5 pasos del flujo.
- **Guía de uso** (antes «Guía de KPIs»): paso a paso, cómo leer la evaluación y los indicadores
  plegados (de 1.149 a 401 palabras).
- **Configuración:** los valores predeterminados (IVA, gastos, tarifas, metas) se editan ahí mismo;
  antes había que cambiarlos en un proyecto.
- **Móvil:** botones de la cabecera solo con ícono, tablas como tarjetas y campos cortos de a dos.
- **Accesibilidad:** todos los controles tienen al menos 24 × 24 px de área de toque.

### Cómo repetir la medición

Los scripts están en `.prueba/ux/` (carpeta local, fuera de git): `audit.js` mide las 13
secciones en escritorio y móvil, `score.js` calcula el índice contra la línea base y
`flujos.js` prueba los flujos clave. Requieren `npm i playwright-core`, Chrome instalado y la
herramienta servida en `http://127.0.0.1:8792`.
