# QUEMPIN · Formulación de proyectos

Herramienta web para formular y evaluar los costos de proyectos. Reemplaza las hojas **Costos**, **Resumen** y **Referencias** del Excel `Excel General Proyectos_CLP.xlsm`. La Carta Gantt queda para una etapa posterior.

**Herramienta publicada:** https://cristobal-monzo.github.io/formulacion-proyectos-quempin/

Es una página estática (HTML + CSS + JavaScript, sin servidor ni base de datos), publicada con **GitHub Pages**.

## Qué hace

- **Formula proyectos con la misma lógica del Excel.** Tiene partidas y detalle de materiales, equipos, mano de obra (3 niveles de tarifa) y otros costos, todo por unidad de partida. La utilidad se define por partida, como % o como monto fijo. Con los datos del Excel entrega exactamente los mismos resultados.
- **Identifica cada proyecto** con código correlativo (`QPN-2026-001`), versión, cliente, ubicación, responsable, fecha y estado (Borrador, En revisión, Enviada, Adjudicada, Perdida, Descartada).
- **Muestra KPI con semáforos y la descripción de cada uno:** margen, recargo, utilidad por día-hombre, incidencia y holgura de MO, sensibilidad por categoría y competitividad frente al presupuesto del mandante. La pestaña *Guía de KPIs* explica qué mide cada indicador y cómo aporta a la evaluación.
- **Valida los datos**, con alertas cuando un costo no tiene partida, una partida tiene cantidad cero o falta la utilidad.
- **Exporta a Excel** (`.xlsx`). El archivo se llama `CÓDIGO_vN_titulo.xlsx` y contiene:
  - Hoja *Ficha*: identificación del proyecto, resultado económico, KPI con su evaluación y descripción, y alertas.
  - Hojas *Partidas*, *Materiales*, *Equipos*, *Mano de obra*, *Otros* y *Parámetros*, con **fórmulas vivas**: si se edita un valor en Excel, todo se recalcula.
  - Una hoja oculta con los datos, para volver a importar el archivo en la herramienta.
- **Exporta la cartera** (todos los proyectos con sus KPI en una planilla) y un respaldo completo en JSON.
- **Importa** proyectos exportados (Excel o JSON) y también **los Excel antiguos** (`.xlsm`) para migrarlos. Al importar un Excel antiguo verifica que el costo y el precio calculados coincidan con los del archivo original.

## Publicación y actualización

- Repositorio: https://github.com/cristobal-monzo/formulacion-proyectos-quempin
- GitHub Pages publica la rama `main` desde la raíz (`/`). Cada `git push` a `main` actualiza el sitio en uno o dos minutos:
  ```bash
  git add .
  git commit -m "descripción del cambio"
  git push
  ```
- El sitio es público, igual que las demás herramientas QUEMPIN publicadas con GitHub Pages. No contiene datos de proyectos: esos viven solo en el navegador de cada usuario.

También funciona abriendo `index.html` directamente desde el computador (doble clic). Para exportar e importar Excel se usa la copia local de la librería en `vendor/`, así que no necesita internet. Sin conexión solo cambian las tipografías.

## Dónde quedan los datos

- Los proyectos se guardan en el **navegador de cada usuario** (`localStorage`). No se envían a ningún servidor.
- Cada persona ve solo los proyectos de su navegador. Para compartir un proyecto, se **exporta a Excel o JSON** y la otra persona lo **importa**.
- Borrar los datos del navegador borra los proyectos. Conviene usar **Más → Respaldar todos los proyectos** periódicamente.
- El código correlativo se sugiere según los proyectos del navegador y se puede editar. Si varias personas formulan en paralelo, acuerden un rango o un prefijo por persona (*Configuración → Prefijo del código*).

## Uso rápido

1. **Nuevo proyecto** → completa la *Ficha* (título, cliente, responsable). Revisa IVA, tarifas y metas.
2. **Partidas** → agrega cada partida con su unidad, cantidad y utilidad (% de recargo o $ fijo).
3. **Materiales / Equipos / Mano de obra / Otros** → agrega los ítems, asócialos a una partida e ingresa las cantidades **por unidad de partida**. En *Otros* puedes agregar desde el catálogo de referencias.
4. **Resumen y KPIs** → revisa los resultados, la composición del precio, los indicadores, la sensibilidad y las alertas.
5. **Exportar Excel** para enviar o archivar. Para una revisión de la oferta usa **Crear nueva versión** (mismo código, v2, v3…).

Atajo: en las tablas, **Enter** baja a la fila siguiente. En la última fila, agrega una nueva.

## Estructura

```
index.html              Página principal
css/styles.css          Estilos (colores de marca, modo claro/oscuro, impresión)
js/calc.js              Motor de cálculo (replica las fórmulas del Excel)
js/kpis.js              Definición y descripción de cada KPI
js/store.js             Modelo de datos, valores por defecto y guardado local
js/excel.js             Exportación e importación (Excel y JSON)
js/app.js               Interfaz
js/logo-data.js         Logo oficial embebido para el Excel exportado
vendor/exceljs.min.js   Librería ExcelJS 4.4.0 (licencia MIT, ver vendor/exceljs.LICENSE)
assets/                 Logos oficiales (fondo blanco y fondo negro), isotipo e íconos
ejemplos/               Proyecto de ejemplo con los datos del Excel original (JSON importable)
docs/ANALISIS_KPI.md    Evaluación de los KPI del Excel y puntos de mejora
```

## Identidad visual

La herramienta sigue el *Manual de Identidad de Marca QUEMPIN*:

- **Colores:** Orange 021 C `#FF5100`, Black C `#000000`, Cool Gray 11 C `#54565A` y Cool Gray 7 C `#98989A`.
  - Para texto naranjo sobre fondo blanco se usa un tono más profundo (`#C23D00`), porque `#FF5100` no alcanza el contraste mínimo de lectura en letra pequeña.
  - Los botones naranjos llevan texto negro por la misma razón (contraste 6,4:1).
- **Tipografía:** Lato, la sugerida por el manual para textos y documentos. También se usa en el Excel exportado.
- **Logo:** se usan los archivos oficiales sin alterar el orden, las proporciones ni los colores de sus elementos.
  - Pie de página: aplicación principal sobre fondo negro, a 170 px de ancho.
  - Resumen impreso: versión fondo blanco a 4,2 cm.
  - Excel exportado: versión fondo blanco a unos 4,5 cm.
  - En los tres casos se respeta el tamaño mínimo de 4 cm.
  - La barra superior usa solo el isotipo, como el sitio web de QUEMPIN.
- **Gráfico de composición:** usa una paleta categórica validada para daltonismo. La paleta de marca (naranjo, negro y grises) no tiene suficientes tonos distinguibles para 6 categorías.

## Mantención

- **Valores por defecto** (IVA, tarifas por nivel, metas, catálogo de otros costos): ajústalos en la ficha de un proyecto y presiona *Usarlos como predeterminados para proyectos nuevos*. Para cambiarlos para todos los usuarios, edita `DEFAULT_PARAMETROS` y `DEFAULT_CATALOGO` en `js/store.js`.
- **Textos de los KPI:** se editan en `js/kpis.js`. Se reflejan en la herramienta, en la guía y en el Excel exportado.
- **Fórmulas:** están en `js/calc.js`. Con el ejemplo del Excel el resultado debe ser costo directo $2.046.404 y precio neto $4.092.808.
