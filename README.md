# QUEMPIN · Formulación de proyectos

Herramienta web para formular y evaluar los costos de proyectos. Reemplaza las hojas **Costos**, **Resumen** y **Referencias** del Excel `Excel General Proyectos_CLP.xlsm`. La Carta Gantt queda para una etapa posterior.

**Herramienta publicada:** https://cristobal-monzo.github.io/formulacion-proyectos-quempin/

Es una página estática (HTML + CSS + JavaScript), publicada con **GitHub Pages**. Los proyectos se guardan en **SharePoint**, en la carpeta de cada oferta de la biblioteca *Formulación de proyectos*, o, si la conexión no está configurada, en el navegador (ver [Dónde quedan los datos](#dónde-quedan-los-datos)).

## Qué hace

- **Formula proyectos con la misma lógica del Excel.** Tiene partidas y detalle de materiales, equipos, mano de obra (3 niveles de tarifa) y otros costos, todo por unidad de partida. Con los datos del Excel entrega exactamente los mismos resultados.
- **Guía la formulación en 5 pasos** (Datos → Partidas → Costos → Utilidad y precio → Evaluación). Cada paso dice para qué sirve, tiene su ayuda «¿Cómo se calcula?», marca si está completo (✓) o tiene errores (!) y termina con el botón al paso siguiente.
- **Define la utilidad junto al margen.** En *Utilidad y precio* se ingresa la utilidad de cada partida (% de recargo o monto fijo) y el margen y el precio cambian al escribir. Incluye *Recargo para todas* y *Llevar al margen objetivo*, que calcula el recargo que deja el margen exactamente en la meta, y los valores por partida listos para copiar a la cotización.
- **Identifica cada proyecto** con código correlativo (`QPN-2026-001`), versión, cliente, ubicación, responsable, fecha y estado (Borrador, En revisión, Enviada, Adjudicada, Perdida, Descartada).
- **Evalúa la oferta con un veredicto en cuatro preguntas** (¿es rentable?, ¿resiste sobrecostos?, ¿cabe en el presupuesto del mandante?, ¿los números están completos?) y los indicadores que las respaldan, con semáforos y metas: margen, utilidad por día-hombre, competitividad, holgura e incidencia de la mano de obra, y un simulador de sobrecostos por categoría. La *Guía de uso* explica cada paso y cada indicador.
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
- El sitio es público, igual que las demás herramientas QUEMPIN publicadas con GitHub Pages. **No contiene datos de proyectos**: esos viven en SharePoint, donde cada persona entra con su cuenta de QUEMPIN, o en el navegador de cada usuario. Nunca se suben al repositorio archivos de la biblioteca.

También funciona abriendo `index.html` directamente desde el computador (doble clic). Para exportar e importar Excel se usa la copia local de la librería en `vendor/`, así que no necesita internet. Sin conexión solo cambian las tipografías.

## Dónde quedan los datos

La herramienta tiene dos modos. Cuál se usa depende de `js/m365-config.js`.

**SharePoint**, para uso en equipo. Se configura una vez siguiendo [docs/SHAREPOINT.md](docs/SHAREPOINT.md).
- Cada proyecto es un archivo `Formulación <N°> v<versión>.json` en la carpeta de su oferta, junto al Excel y los antecedentes de siempre. Si la carpeta se mueve a Adjudicadas o a Cerradas, el proyecto la sigue.
- Cada persona entra con su cuenta Microsoft de QUEMPIN y ve lo que SharePoint le permite. No hay una lista de usuarios aparte.
- **Nuevo proyecto** pide la carpeta de la oferta y toma de la *Planilla de Ingreso de Requerimientos* el título, la ubicación, la referencia, el cierre y el presupuesto. La planilla solo se lee.
- Todo el equipo ve la misma cartera. Si dos personas guardan el mismo proyecto, se pregunta antes de sobrescribir.
- SharePoint guarda el historial de versiones de cada archivo y tiene papelera propia.
- La herramienta solo escribe sus propios archivos (`Formulación …` y `Formulador - configuración.json`). No modifica, mueve ni borra nada más. Para un piloto, `raiz` la limita a una carpeta de prueba.

**Local**, el modo por defecto si SharePoint no está configurado o si se abre `index.html` como archivo.
- Los proyectos se guardan en el **navegador de cada usuario** (`localStorage`, unos 5 MB compartidos con las demás herramientas de `cristobal-monzo.github.io`). Eso equivale a unos 450 proyectos medianos. Cada versión cuenta como un proyecto.
- Cada persona ve solo los proyectos de su navegador. Para compartir, se **exporta a Excel o JSON** y se **importa**. Borrar los datos del navegador borra los proyectos.
- Al pasar a SharePoint, la herramienta ofrece guardar los proyectos del navegador en la carpeta de su oferta.

En ambos modos, eliminar un proyecto lo envía a la **papelera** (*Más → Papelera*), desde donde se restaura. En modo local también se puede eliminar definitivamente. En SharePoint el archivo queda en su carpeta: para borrarlo del todo se hace en SharePoint.

## Uso rápido

1. **Datos** → título, cliente y responsable (en SharePoint, el título, la ubicación y el presupuesto vienen de la planilla de ingreso). Los parámetros (IVA, tarifas, metas) ya vienen con los valores de *Configuración*; ábrelos solo si este proyecto es distinto.
2. **Partidas** → agrega cada partida con su cantidad y unidad.
3. **Costos** → en *Materiales*, *Equipos*, *Mano de obra* y *Otros* agrega los ítems, elige su partida e ingresa las cantidades **por unidad de partida**. En *Otros* puedes usar **Agregar desde catálogo**.
4. **Utilidad y precio** → define la **utilidad** de cada partida (% o $) y copia los valores netos para la cotización.
5. **Evaluación** → revisa el veredicto y corrige las alertas; luego **Exportar Excel**. Para una revisión de la oferta usa **⋯ → Crear nueva versión** (mismo código, v2, v3…).

Los valores con que parten los proyectos nuevos (IVA, tarifas y metas, y en modo local el prefijo del código) se cambian en **Configuración**, arriba a la derecha.

Atajos: en las tablas, **Enter** baja a la fila siguiente (en la última fila agrega una nueva). En la columna de unidad, **↓** abre la lista de unidades. Duplicar, mover o eliminar una fila está en su menú **⋯**. En el listado, **/** enfoca el buscador. Los menús y selectores se manejan con flechas, **Enter** y **Esc**. En el teléfono las tablas se muestran como tarjetas.

## Estructura

```
index.html              Página principal
css/brand.css           Sistema de marca compartido con las demás herramientas QUEMPIN (no editar)
css/styles.css          Estilos propios (componentes, gráficos, modo claro/oscuro, impresión)
js/calc.js              Motor de cálculo (replica las fórmulas del Excel)
js/kpis.js              Definición y descripción de cada KPI
js/store.js             Modelo de datos, valores por defecto, papelera y guardado (local o SharePoint)
js/cloud.js             Conexión con SharePoint: ingreso con Microsoft, sincronización y reglas de escritura
js/m365-config.js       Registro en Microsoft Entra y biblioteca de SharePoint (clientId vacío = modo local)
redirect.html           Página de retorno del ingreso con Microsoft
js/excel.js             Exportación e importación (Excel y JSON)
js/app.js               Interfaz
js/logo-data.js         Logo oficial embebido para el Excel exportado
vendor/exceljs.min.js   Librería ExcelJS 4.4.0 (licencia MIT, ver vendor/exceljs.LICENSE)
vendor/msal/            MSAL 5.23.0, librería de ingreso de Microsoft (licencia MIT, ver vendor/msal/LICENSE)
assets/                 Logos oficiales (fondo blanco y fondo negro), isotipo e íconos
ejemplos/               Proyecto de ejemplo con los datos del Excel original (JSON importable)
docs/ANALISIS_KPI.md    Evaluación de los KPI del Excel y puntos de mejora
docs/SHAREPOINT.md      Cómo conectar con SharePoint, piloto, permisos y cuidados
```

## Identidad visual

La herramienta sigue el *Manual de Identidad de Marca QUEMPIN* y usa el mismo sistema visual que la [Calculadora Técnica](https://cristobal-monzo.github.io/calculadora-tecnica-quempin/) y los Tableros Financieros, para que se reconozcan como herramientas de la misma empresa:

- **Sistema de marca compartido:** `css/brand.css` es una copia textual del de la Calculadora Técnica (Lato embebida, paleta oficial, tema claro/oscuro y cabecera). Si cambia allá, se vuelve a copiar; los ajustes propios van en `css/styles.css`.
- **Cabecera negra con filete naranjo**, nombre QUEMPIN y botones *Configuración* y *Modo oscuro*, como en las demás herramientas. Debajo, la navegación de secciones con el mismo estilo del menú entre tableros de Finanzas.
- **Componentes comunes:** tarjetas KPI con borde de estado (Análisis Financiero), barra de filtros con chips (Centro de Costos), pestañas fijas, control segmentado y columnas calculadas sombreadas (Calculadora Técnica).
- **Colores:** Orange 021 C `#FF5100`, Black C `#000000`, Cool Gray 11 C `#54565A` y Cool Gray 7 C `#98989A`.
  - Para texto naranjo sobre fondo claro se usa un tono más profundo del mismo naranjo (`#B23A00`), igual que en las demás herramientas.
  - Los botones naranjos llevan texto negro (contraste 6,4:1).
- **Gráficos solo con colores de marca:** cuando los cuatro colores no alcanzan se usan **rayas y puntos** con esos mismos colores (mismo criterio del Centro de Costos). Asignación fija: Materiales gris 11 · Equipos gris 7 · Mano de obra negro · Otros rayas naranjas · Gastos generales e imprevistos puntos grises · Utilidad naranjo. Todo gráfico lleva leyenda con valores o tabla, porque los grises no se distinguen por tono.
- **Semáforos:** verde, ámbar y rojo se reservan para el estado de un indicador (nunca para una categoría) y siempre van con icono y texto.
- **Menús desplegables propios** para partida, unidad, estado, catálogo y acciones: muestran las opciones completas (código, descripción y cantidad de la partida), con búsqueda cuando son muchas y manejo con teclado. Los filtros usan el selector del navegador con flecha y colores de la marca.
- **Logo:** se usan los archivos oficiales sin alterar. Resumen impreso: versión fondo blanco a 4,2 cm; Excel exportado: versión fondo blanco a unos 4,5 cm (ambos sobre el mínimo de 4 cm). En pantalla, igual que las demás herramientas, la cabecera muestra el nombre QUEMPIN en texto.

## Mantención

- **Valores por defecto** (IVA, tarifas por nivel, metas, catálogo de otros costos): ajústalos en la ficha de un proyecto y presiona *Usarlos como predeterminados para proyectos nuevos*. En SharePoint aplica a todo el equipo y queda en `Formulador - configuración.json`. Para cambiar los valores de fábrica, edita `DEFAULT_PARAMETROS` y `DEFAULT_CATALOGO` en `js/store.js`.
- **Textos de los KPI:** se editan en `js/kpis.js`. Se reflejan en la herramienta, en la guía y en el Excel exportado.
- **Fórmulas:** están en `js/calc.js`. Con el ejemplo del Excel el resultado debe ser costo directo $2.046.404 y precio neto $4.092.808.
