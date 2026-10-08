# QUEMPIN · Formulación de proyectos

Herramienta web para formular y evaluar los costos de proyectos. Reemplaza las hojas **Costos**, **Resumen** y **Referencias** del Excel `Excel General Proyectos_CLP.xlsm`. La Carta Gantt queda para una etapa posterior.

**Herramienta publicada:** https://cristobal-monzo.github.io/formulacion-proyectos-quempin/

Es una página estática (HTML + CSS + JavaScript), publicada con **GitHub Pages**. Mientras la conexión con SharePoint no esté configurada (hoy), cada presupuesto se guarda en el navegador y en el **repositorio del equipo**, una carpeta de la biblioteca *Formulación de proyectos* sincronizada por OneDrive. Además queda una **copia en Excel en la carpeta de su oferta**. Con SharePoint configurado, se guardan en la carpeta de cada oferta (ver [Dónde quedan los datos](#dónde-quedan-los-datos)).

## Qué hace

- **Formula proyectos con la misma lógica del Excel.** Tiene partidas y detalle de materiales, equipos, mano de obra (3 niveles de tarifa) y otros costos, todo por unidad de partida. Con los datos del Excel entrega exactamente los mismos resultados.
- **Guía la formulación en 5 pasos** (Datos → Partidas → Costos → Utilidad y precio → Evaluación). Cada paso dice para qué sirve, tiene su ayuda «¿Cómo se calcula?», marca si está completo (✓) o tiene errores (!) y termina con el botón al paso siguiente.
- **Acompaña cada proyecto en todo su recorrido** (desde el 2026-10-05, `js/flujo.js`; rediseñado el 2026-10-06). Un proyecto recorre las seis etapas de la guía del equipo: requerimiento → formulación → cotización → oferta y adjudicación → ejecución → cierre.
  - **Barra del recorrido**, arriba del proyecto en todas sus pestañas: las seis etapas (hechas, la actual, las que vienen) y **un solo botón con lo que sigue** (preparar la cotización, marcarla Enviada, pasar a ejecución…). Cada etapa lleva a donde se trabaja.
  - **Pestaña «Seguimiento»**, después de los 5 pasos: una línea de tiempo con las seis etapas, y en cada una lo que hizo su herramienta con el proyecto y sus botones (la cotización y cómo seguir en Sistema QUEMPIN, el aviso a la Planilla, los costos y la venta al Análisis Financiero). Después de cada acción del recorrido, el proyecto queda ahí, con lo que sigue.
  - **Abrir un proyecto lleva a lo pendiente**: al paso que falta mientras se formula, a los datos si falta el N° de requerimiento, y al seguimiento después. La lista lo resume bajo el estado.
  - Si una oferta ya salió de la formulación (Enviada, Adjudicada…), los pasos de la formulación lo advierten y ofrecen **Crear nueva versión**.
  - Al cambiar el estado, un aviso dice qué sigue.
  - **«Marcar como Enviada»**, **«Perdida»** y **«Descartada»** avisan a la Planilla de Ingreso en el mismo clic (Ofertado, No adjudicado o Descartado).
  - **«Pasar a ejecución»** (oferta Adjudicada): un solo envío lleva los costos y la venta al Análisis Financiero y el aviso «Adjudicado» a la planilla. Antes eran tres acciones separadas. El proyecto del Análisis Financiero se propone por el N° de requerimiento.
- **Define la utilidad junto al margen.** En *Utilidad y precio* se ingresa la utilidad de cada partida (% de recargo o monto fijo) y el margen y el precio cambian al escribir. Incluye *Recargo para todas* y *Llevar al margen objetivo*, que calcula el recargo que deja el margen exactamente en la meta, y los valores por partida listos para copiar a la cotización.
- **Formula en la moneda del proyecto** (desde el 2026-10-07): pesos chilenos, soles peruanos, dólares (US$) o euros, elegida en *Datos del proyecto* (y la de los proyectos nuevos en *Configuración*). Todos los montos se ingresan y se muestran en ella, sin conversión: cambiarla no convierte los valores. Los pesos van en unidades enteras; soles, dólares y euros con centavos. La lista muestra cada proyecto en su moneda y suma por separado cada moneda. La cotización a Sistema QUEMPIN sale en la moneda del proyecto. El Análisis Financiero y la Planilla de Ingreso llevan pesos chilenos: un proyecto en otra moneda no les envía costos ni montos (solo el estado, o la venta de una cotización emitida en pesos).
- **Identifica cada proyecto** con código correlativo (`QPN-2026-001`), versión, cliente, ubicación, responsable, fecha y estado (Borrador, En revisión, Enviada, Adjudicada, Perdida, Descartada).
- **Evalúa la oferta con un veredicto en cuatro preguntas** (¿es rentable?, ¿resiste sobrecostos?, ¿cabe en el presupuesto del mandante?, ¿los números están completos?) y los indicadores que las respaldan, con semáforos y metas: margen, utilidad por día-hombre, competitividad, holgura e incidencia de la mano de obra, y un simulador de sobrecostos por categoría. La *Guía de uso* explica cada paso y cada indicador.
- **Valida los datos**, con alertas cuando un costo no tiene partida, una partida tiene cantidad cero o falta la utilidad.
- **Exporta a Excel** (`.xlsx`). El archivo se llama `CÓDIGO_vN_titulo.xlsx` y contiene:
  - Hoja *Ficha*: identificación del proyecto, resultado económico, KPI con su evaluación y descripción, y alertas.
  - Hojas *Partidas*, *Materiales*, *Equipos*, *Mano de obra*, *Otros* y *Parámetros*, con **fórmulas vivas**: si se edita un valor en Excel, todo se recalcula.
  - Una hoja oculta con los datos, para volver a importar el archivo en la herramienta.
- **Exporta la cartera** (todos los proyectos con sus KPI en una planilla) y un respaldo completo en JSON.
- **Respalda por mes de ingreso** (Más → *Respaldar por mes de ingreso*, en Chrome o Edge de escritorio). En la carpeta que se elija deja `Respaldos Formulador/<año>/<año>-<mes> Proyectos ingresados - <Mes> <año>.json`, un archivo por mes con los proyectos creados ese mes en la herramienta. Cada archivo se vuelve a importar como cualquier respaldo. La lista de proyectos se filtra por el mismo criterio («Ingresados en»).
- **Importa** proyectos exportados (Excel o JSON) y también **los Excel antiguos** (`.xlsm`) para migrarlos. Al importar un Excel antiguo verifica que el costo y el precio calculados coincidan con los del archivo original.
- **Envía los costos al Análisis Financiero.** Cuando una oferta se adjudica, sus costos por categoría pasan a ser los costos proyectados del proyecto en ejecución, para compararlos con el gasto real del Centro de Costos. La comunicación va por una carpeta de intercambio compartida en OneDrive: no usa servidor ni inicio de sesión, y no depende de SharePoint. Ver [docs/INTERCAMBIO.md](docs/INTERCAMBIO.md).
- **Trabaja con las demás herramientas QUEMPIN por esa misma carpeta** (desde el 2026-10-01):
  - **N° de requerimiento** (paso 1): une el presupuesto con su requerimiento de la *Planilla de Ingreso*. La lista muestra los 20 últimos ingresados, del más nuevo al más antiguo; al escribir un N° o parte del título se suman los anteriores que calzan. Con la biblioteca conectada, la planilla se lee ahí mismo, al día (si no, la copia que publica el procesador cada 2 horas). «Completar desde la planilla» trae título, ubicación y presupuesto, y «Abrir la planilla» la abre en Excel para la web.
  - **Precios de referencia** (paso 3, botón **$** en materiales y equipos): lo que QUEMPIN pagó por productos parecidos, sin IVA y reajustado por UF (Cotizador Histórico).
  - **Sesgo real** (paso 5, simulador de sobrecostos): «Simular con el sesgo real» usa cuánto se desvió el gasto real del presupuesto en los proyectos terminados (Análisis Financiero).
  - **Otras herramientas QUEMPIN** (pestaña *Seguimiento*): prepara la cotización en **Sistema QUEMPIN** (llega arriba de «Nueva Cotización», donde se revisa y se emite), envía la **venta** al Análisis Financiero, avisa a la **Planilla de Ingreso** el estado y el valor, y **registra la evaluación de costos** (tipo 81) en el Control de Documentos: toma su número sola al elegir la carpeta de la oferta (una por versión, también la versión nueva que hereda la carpeta), y el Excel exportado lleva ese número.
- **Comparte los proyectos con el equipo por esa misma carpeta** mientras no se use SharePoint: cada proyecto queda como un archivo en OneDrive y aparece en la lista de los demás equipos que la tengan conectada.
- **Deja una copia en Excel en la carpeta de cada oferta** (desde el 2026-10-02): `Formulación <código> v<versión>.xlsx`, junto a los antecedentes de la oferta, y la mantiene al día sola mientras se trabaja. Es la misma exportación de *Exportar Excel*, con una nota de que es una copia automática. La carpeta se elige una vez por proyecto: al crearlo o desde el aviso del editor, que la sugiere por el N° de requerimiento.
- **Crea la carpeta de la oferta sin salir del formulario** (2026-10-06). *Nuevo proyecto* es un formulario: se elige la carpeta de la lista o, con **+ Crear nueva carpeta**, se escribe el N° de requerimiento (la lista propone los de la planilla que todavía no tienen carpeta) y el nombre; la carpeta «N°. Nombre» se crea junto a las ofertas en curso y queda elegida. Valida el nombre, avisa si el N° o el nombre ya tienen carpeta (con «Usar esa carpeta») y muestra el error si no se pudo crear. La primera vez pide ahí mismo las iniciales del Control de Documentos.
- **Conecta las herramientas en las dos direcciones** (2026-10-06):
  - Menú **Herramientas** (cabecera): las herramientas del recorrido por etapa; dentro de un proyecto, el Análisis Financiero abre la ficha de ese proyecto.
  - Enlaces de entrada: `#/req/<N°>` y `#/tag/<TAG>` abren el proyecto donde está lo que sigue (los usan el tablero de Análisis Financiero y Sistema QUEMPIN); `#/p/<id>/seguimiento` abre su seguimiento.

## Publicación y actualización

- Repositorio: https://github.com/cristobal-monzo/formulacion-proyectos-quempin
- GitHub Pages publica la rama `main` desde la raíz (`/`). Cada `git push` a `main` actualiza el sitio en uno o dos minutos:
  ```bash
  git add .
  git commit -m "descripción del cambio"
  git push
  ```
- El sitio es público, igual que las demás herramientas QUEMPIN publicadas con GitHub Pages. **No contiene datos de proyectos**: esos viven en SharePoint, donde cada persona entra con su cuenta de QUEMPIN, o en el navegador de cada usuario y la carpeta compartida de OneDrive. Nunca se suben al repositorio archivos de la biblioteca.
- Al abrirla pide una contraseña (ver `GATE_PASSWORD_NORM` en `index.html`). Los scripts de la herramienta se cargan recién después de pasarla. Es una barrera del lado del cliente, no seguridad real: solo disuade a quien reciba el link (la página no lleva datos). El navegador la recuerda (`quempin_viz_unlocked` en `localStorage`). Hasta el 2026-10-05 era la misma de los Tableros Financieros; desde ese día los tableros usan otra, con sus datos cifrados (`quempin_viz_clave`), así que hoy son dos contraseñas distintas.

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
- **Todo presupuesto se guarda también en la carpeta del equipo (obligatorio).** Crear uno nuevo, importarlo, duplicarlo o hacer una nueva versión exige conectar la carpeta. Donde no se puede (Firefox, Safari, celulares, o sin la biblioteca en el computador), el presupuesto se descarga con *Descargar para el equipo* para dejarlo en el buzón, y Claude lo incorpora al repositorio en `/Actualizar_Finanzas`. Lo que queda solo en un navegador lleva la marca «Solo en este navegador».
- **Para que el equipo vea los mismos proyectos**, cada navegador los comparte por la carpeta de intercambio, oculta en la biblioteca de SharePoint *Formulación de proyectos* (`.Herramientas formulación/Intercambio`), que el equipo ya tiene sincronizada en OneDrive (Chrome o Edge de escritorio). La lista de proyectos pide conectarla eligiendo la biblioteca; en **Configuración** se puede cambiar. Cada proyecto queda como un archivo en `publicado/formulador/` (el repositorio de las formulaciones), OneDrive lo lleva a los demás equipos y su formulador lo trae a la lista. Si dos equipos cambian el mismo proyecto a la vez, se conserva una versión y los otros cambios quedan como copia: nunca se pierde trabajo. Detalle en [docs/INTERCAMBIO.md](docs/INTERCAMBIO.md).
- **Además, una copia en Excel en la carpeta de la oferta.** El repositorio guarda el presupuesto completo en JSON: es lo que la herramienta vuelve a abrir y lo que leen las demás herramientas y Claude. Para las personas queda también `Formulación <código> v<versión>.xlsx` en la carpeta de su oferta (por ejemplo `301. Mantención calderas hospital`), con la ficha del resultado y los indicadores y las hojas de detalle con fórmulas.
  - **Cuándo se actualiza:** a los 30 segundos sin editar (o cada 3 minutos si no se para de editar), al salir del presupuesto y al cambiar de pestaña. Lo escribe el navegador donde se hizo el cambio. Si no alcanza, por ejemplo porque se cerró la pestaña, queda pendiente para la próxima vez que se abra la herramienta.
  - **Carpeta:** se elige una vez por presupuesto y viaja con él (`vinculos.carpetaOferta`). Si la oferta se mueve a Presentadas, Adjudicadas o Cerradas, la copia la sigue. La *Nueva versión* deja su propio archivo (v2, v3…) en la misma carpeta; *Duplicar* pregunta la oferta de la copia.
  - **Estado:** el encabezado del presupuesto muestra la carpeta con un punto (verde = al día, ámbar = por actualizar, rojo = error) y abre el detalle con *Guardar ahora*, *Cambiar carpeta* y *Dejar de guardarlo aquí*.
  - **Reglas:** solo escribe su propio archivo `Formulación … .xlsx` dentro de la carpeta de oferta elegida. Nunca la carpeta de herramientas, la carpeta modelo ni la de archivos frecuentes. Un archivo con el mismo nombre que no sea de ese presupuesto no se toca: la copia queda como «… (2).xlsx». No borra, mueve ni renombra nada. Solo crea una carpeta cuando alguien la pide con *+ Crear nueva carpeta*: una carpeta de oferta nueva («N°. Nombre») en la raíz de la biblioteca, nunca encima de una que exista. Lo que alguien cambie en la copia se reemplaza en la siguiente actualización; OneDrive guarda las versiones anteriores.
  - **Necesita la biblioteca completa conectada.** Quien conectó solo la carpeta de herramientas ve un aviso para conectarla, y el navegador pide el permiso una vez por sesión.
- Sin esa carpeta, cada persona ve solo los proyectos de su navegador: se comparten **exportando a Excel o JSON** e **importando**. Borrar los datos del navegador borra los proyectos que no estén en la carpeta.
- Al pasar a SharePoint, la herramienta ofrece guardar los proyectos del navegador en la carpeta de su oferta.

En ambos modos, eliminar un proyecto lo envía a la **papelera** (*Más → Papelera*), desde donde se restaura. En modo local sin carpeta compartida también se puede eliminar definitivamente. En SharePoint y en la carpeta compartida el archivo queda: para borrarlo del todo se hace allá.

## Uso rápido

1. **Datos** → al crear el proyecto eliges (o creas) la carpeta de su oferta: con su N° de requerimiento llegan el título, la ubicación y el presupuesto de la planilla. Completa el cliente y el responsable. Los parámetros (IVA, tarifas, metas) ya vienen con los valores de *Configuración*; ábrelos solo si este proyecto es distinto.
2. **Partidas** → agrega cada partida con su cantidad y unidad.
3. **Costos** → en *Materiales*, *Equipos*, *Mano de obra* y *Otros* agrega los ítems, elige su partida e ingresa las cantidades **por unidad de partida**. En *Otros* puedes usar **Agregar desde catálogo**.
4. **Utilidad y precio** → define la **utilidad** de cada partida (% o $) y copia los valores netos para la cotización.
5. **Evaluación** → revisa el veredicto y corrige las alertas. El botón del pie lleva a lo que sigue: **preparar la cotización** en Sistema QUEMPIN.
6. **Seguimiento** → la oferta sigue sola su recorrido: la cotización emitida aparece con su número, **Marcar como Enviada** cuando sale al cliente y, si se adjudica, **Pasar a ejecución**. La barra de arriba dice siempre qué sigue. Para una revisión de la oferta usa **⋯ → Crear nueva versión** (mismo código, v2, v3…).

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
js/intercambio.js       Carpeta de intercambio con las demás herramientas QUEMPIN (Análisis Financiero)
js/herramientas.js      Lo demás que se intercambia: requerimientos, precios, sesgo, cotización, venta, planilla, Control de Documentos
js/flujo.js             Recorrido de la oferta (seis etapas) y qué sigue: solo calcula, app.js lo pinta
js/esquemas.js          Validador del catálogo de mensajes (copia textual de Finanzas QUEMPIN/Sistema Intercambio/esquemas.js)
js/busqueda.js          Buscador de precios (copia textual del de Cotizador Historico/Visualizador Web/busqueda.js)
js/compartida.js        Proyectos compartidos con el equipo por esa carpeta (modo local)
js/oferta.js            Copia en Excel de cada presupuesto en la carpeta de su oferta (modo local)
js/app.js               Interfaz
js/logo-data.js         Logo oficial embebido para el Excel exportado
vendor/exceljs.min.js   Librería ExcelJS 4.4.0 (licencia MIT, ver vendor/exceljs.LICENSE)
vendor/msal/            MSAL 5.23.0, librería de ingreso de Microsoft (licencia MIT, ver vendor/msal/LICENSE)
assets/                 Logos oficiales (fondo blanco y fondo negro), isotipo e íconos
ejemplos/               Proyecto de ejemplo con los datos del Excel original (JSON importable)
docs/ANALISIS_KPI.md    Evaluación de los KPI del Excel y puntos de mejora
docs/SHAREPOINT.md      Cómo conectar con SharePoint, piloto, permisos y cuidados
docs/INTERCAMBIO.md     Cómo se comunican las herramientas y el envío de costos al Análisis Financiero
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
