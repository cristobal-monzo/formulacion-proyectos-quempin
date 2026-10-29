# QUEMPIN · Formulación de proyectos

Herramienta web para formular y evaluar los costos de proyectos. Reemplaza las hojas **Costos**, **Resumen** y **Referencias** del Excel `Excel General Proyectos_CLP.xlsm`. La Carta Gantt es una herramienta aparte, en `gantt/`.

**Herramienta publicada:** https://cristobal-monzo.github.io/formulacion-proyectos-quempin/

Es una página estática (HTML + CSS + JavaScript), publicada con **GitHub Pages**. Cada presupuesto se guarda en el navegador y en el **repositorio del equipo**, una carpeta de la biblioteca *Formulación de proyectos* sincronizada por OneDrive. Además queda una **copia en Excel en la carpeta de su oferta**. Ver [Dónde quedan los datos](#dónde-quedan-los-datos).

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
  - **«Cerrar el proyecto»** (2026-10-26): cuando la ejecución termina, el estado **Cerrada** lo describe como terminado en todas las herramientas. El Portal lo pone en «Cierre» y lo saca de la Planificación semanal. En la Planilla de Ingreso sigue «Adjudicado», así que no se manda aviso. Con el 100 % de avance en el Análisis Financiero, el recorrido propone marcarlo, y en el Seguimiento se puede volver a «Adjudicada».
- **Define la utilidad junto al margen.** En *Utilidad y precio* se ingresa la utilidad de cada partida (% de recargo, monto fijo o *Final*: el valor final de la partida, del que se calcula la utilidad) y el margen y el precio cambian al escribir. Incluye *Recargo para todas* y *Llevar al margen objetivo*, que calcula el recargo que deja el margen exactamente en la meta, y los valores por partida listos para copiar a la cotización.
- **Formula en la moneda del proyecto** (desde el 2026-10-07): pesos chilenos, soles peruanos, dólares (US$) o euros, elegida en *Datos del proyecto* (y la de los proyectos nuevos en *Configuración*). Todos los montos se ingresan y se muestran en ella, sin conversión: cambiarla no convierte los valores. Los pesos van en unidades enteras; soles, dólares y euros con centavos. La lista muestra cada proyecto en su moneda y suma por separado cada moneda. La cotización a Sistema QUEMPIN sale en la moneda del proyecto. El Análisis Financiero y la Planilla de Ingreso llevan pesos chilenos: un proyecto en otra moneda no les envía costos ni montos (solo el estado, o la venta de una cotización emitida en pesos).
- **Identifica cada proyecto** con un código `QMPN-año-N° de requerimiento` (`QMPN-2026-280`) o, sin N°, un correlativo (`QMPN-2026-001`), versión, cliente, ubicación, responsable, fecha y estado (Borrador, En revisión, Enviada, Adjudicada, Cerrada, Perdida, Descartada).
- **Muestra siempre el precio bruto** (2026-10-27). La barra junto a los pasos, en todas las pestañas del proyecto, lleva el precio neto, el **precio bruto** (neto + IVA: lo que paga el cliente), el margen y las alertas. Cabe en una línea desde el teléfono hasta el escritorio.
- **Clasifica el proyecto por categoría** (2026-10-27, `CATEGORIAS` en `js/store.js`): *Licitación*, *Compra ágil*, *Trato directo*, *Cliente privado* o *Formulación general*, en *Datos del proyecto*. La categoría dice qué datos lleva el proyecto:

  | Categoría | ID | Presupuesto del mandante |
  |---|---|---|
  | Licitación | «ID de licitación» (`1234-56-LE26`) | Sí |
  | Compra ágil | «ID de la compra ágil» (`1234-56-COT26`) | Sí (el monto disponible) |
  | Trato directo | No | No: no hay con qué competir |
  | Cliente privado | No | Opcional, si el cliente lo informó |
  | Formulación general | No | No |

  - Lo que la categoría no lleva se oculta y no se usa: la evaluación no compara la oferta con un presupuesto (el veredicto queda en tres preguntas), el Excel no muestra el ID y deja el presupuesto en 0, y el registro de un proyecto nuevo en la Planilla de Ingreso no los manda. Lo que estaba escrito queda guardado y vuelve si se cambia la categoría. Completar desde la planilla tampoco lo llena.
  - Sin elegirla, la deduce el ID de Mercado Público: `COT` es una compra ágil; `LE`, `LP`, `L1`, `LR`, `CO`, `B2`… son licitaciones. Así los proyectos de antes ya aparecen clasificados, sin cambiar sus archivos. Un proyecto sin ID queda «Sin definir» y muestra todo, como siempre.
  - Un proyecto que llega desde *Oportunidades de Mercado Público* nace con su categoría.
  - La categoría va en el encabezado del proyecto, bajo el título en la lista (y se busca por ella), en el Excel (*Datos del proyecto*) y en la cartera exportada.
- **Lleva la lista de entregables para postular** (2026-10-27, opcional). En *Datos del proyecto*, la sección plegable *Entregables para postular* anota lo que piden las bases: anexos administrativos, técnicos, la oferta económica… Cada entregable tiene nombre, tipo (Administrativo, Técnico, Económico u Otro), responsable (las iniciales del equipo) y la casilla *Listo*. Plegada, dice el avance («3 de 12 listos · 5 administrativos · 4 técnicos · 3 económicos»).
  - **Pegar una lista…** toma la lista de anexos copiada de las bases (un entregable por línea) o filas de un Excel. Quita viñetas y numeración. El tipo sale de la línea («Oferta económica»), de una celda que lo diga o del último título de sección («Antecedentes técnicos», que no se agrega); si no, del que se elija.
  - El *Seguimiento* dice cuántos están listos y cuáles faltan. **Marcar como Enviada** desde el recorrido avisa si falta alguno, con *Revisar la lista* o *Marcar como Enviada* igual.
  - La versión nueva conserva la lista con su avance; *Duplicar* la copia sin marcar, porque es otra oferta.
  - En el Excel van en la hoja *Entregables*, junto a la *Ficha*.
- **Evalúa la oferta con un veredicto en cuatro preguntas** (¿es rentable?, ¿resiste sobrecostos?, ¿cabe en el presupuesto del mandante?, ¿los números están completos?; tres en un trato directo o una formulación general, que no tienen presupuesto con que competir) y los indicadores que las respaldan, con semáforos y metas: margen, utilidad por día-hombre, competitividad, holgura e incidencia de la mano de obra, y un simulador de sobrecostos por categoría. La *Guía de uso* explica cada paso y cada indicador.
- **Valida los datos**, con alertas cuando un costo no tiene partida, una partida tiene cantidad cero o falta la utilidad.
- **Exporta a Excel** (`.xlsx`). El archivo se llama `CÓDIGO_vN_titulo.xlsx` y contiene:
  - Hoja *Ficha*: identificación del proyecto (con su categoría), resultado económico, KPI con su evaluación y descripción, y alertas.
  - Hoja *Entregables*, si el proyecto tiene la lista: cada entregable con su tipo, responsable y estado.
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
  - **Si el procesador del intercambio se detiene, se avisa** (2026-10-08): con más de 4 horas hábiles sin correr (lunes a viernes, 8:30 a 19:00; las noches y los fines de semana no cuentan), la lista de proyectos y el *Seguimiento* lo dicen en rojo, porque lo que se envía a las demás herramientas queda esperando.
  - **Otras herramientas QUEMPIN** (pestaña *Seguimiento*): prepara la cotización en **Sistema QUEMPIN** (llega arriba de «Nueva Cotización», donde se revisa y se emite; el botón *Abrir Sistema QUEMPIN* de la etapa abre el programa en esa sección con `quempin://cotizacion`, QUEMPIN.exe 1.3.8 o más nuevo), envía la **venta** al Análisis Financiero, avisa a la **Planilla de Ingreso** el estado y el valor, y **registra la evaluación de costos** (tipo 81) en el Control de Documentos: toma su número sola al elegir la carpeta de la oferta (una por versión, también la versión nueva que hereda la carpeta), y el Excel exportado lleva ese número.
- **Comparte los proyectos con el equipo por esa misma carpeta**: cada proyecto queda como un archivo en OneDrive y aparece en la lista de los demás equipos que la tengan conectada.
- **Deja una copia en Excel en la carpeta de cada oferta** (desde el 2026-10-02): `Formulación <código> v<versión>.xlsx` (con el código «N°. Nombre», solo el N°: `Formulación 312 v1.xlsx`), junto a los antecedentes de la oferta, y la mantiene al día sola mientras se trabaja. Es la misma exportación de *Exportar Excel*, con una nota de que es una copia automática. La carpeta se elige una vez por proyecto: al crearlo o desde el aviso del editor, que la sugiere por el N° de requerimiento.
- **El código es el nombre de la carpeta** (2026-10-19): «N°. Nombre», por ejemplo `312. Gimnasio municipal`. Se propone al crear el proyecto, al elegir su carpeta y con «Completar desde la planilla»; un código escrito a mano no se toca. En la lista y el encabezado se corta con «…» (completo al pasar el mouse).
- **Nuevo proyecto pregunta por la carpeta** (2026-10-19). Se escribe el N° de requerimiento (la lista propone los de la planilla que todavía no tienen carpeta, y el nombre llega de la planilla) y el nombre; el formulario muestra el código y pregunta *¿Crear la carpeta de la oferta?*: «Sí, crear «N°. Nombre» en la biblioteca Formulación de proyectos» o «No, sin carpeta por ahora». Si ese N° o ese nombre ya tienen carpeta, propone usarla; «Elegir otra carpeta que ya existe…» abre el selector de siempre, que también permite **+ Crear nueva carpeta** (2026-10-06). Las iniciales del usuario se piden solo si hay carpeta (con ellas se registra la evaluación de costos).
- **Abre la carpeta en el Explorador y, al adjudicarse, la pasa a Gestión de Proyectos** (2026-10-19). El navegador no abre carpetas del computador: lo hace QUEMPIN.exe 1.3.10 con `quempin://carpeta/…` (menú ⋯, la carpeta del encabezado, Seguimiento, y el botón de carpeta del Portal QUEMPIN). Al quedar *Adjudicada*, pregunta si la carpeta se copia a «Gestión de Proyectos», donde sigue la ejecución, y el original pasa a «0 OFERTAS ADJUDICADAS» (`quempin://trasladar/…`); el programa vuelve a preguntar, muestra el avance y no junta ni reemplaza nada. El Excel de la formulación sigue al día en el original. Desde QUEMPIN.exe 1.3.15 (2026-10-28) la carpeta de Gestión trae «Formulación», con la copia de la oferta, y «Facturas del proyecto»: lo que se deja ahí lo copia el procesador del Intercambio al Centro de Costos, que además crea la carpeta de facturas del proyecto cuando se adjudica.
- **Conecta las herramientas en las dos direcciones** (2026-10-06):
  - Menú **Herramientas** (cabecera): las herramientas del recorrido por etapa; dentro de un proyecto, el Análisis Financiero abre la ficha de ese proyecto.
  - Enlaces de entrada: `#/req/<N°>` y `#/tag/<TAG>` abren el proyecto donde está lo que sigue (los usan el tablero de Análisis Financiero y Sistema QUEMPIN); `#/p/<id>/seguimiento` abre su seguimiento.
  - **Desde el tablero Oportunidades de Mercado Público** (2026-10-16, `js/oportunidad.js`): «Llevar al Formulador» abre `#/oportunidad/<datos>`. Si la licitación ya tiene proyecto (por su ID de licitación o su N° de la planilla), lo abre; si no, *Nuevo proyecto* se abre con su N° de la planilla (y la carpeta de ese N°, si existe) o con el nombre de la licitación (sin la biblioteca con permiso, espera el clic en el aviso de la lista). El proyecto nace con el título, el cliente (organismo), el ID de licitación, la ubicación, el presupuesto (el monto publicado, con IVA, solo en pesos) y, en la descripción, el alcance, el cierre, la visita y la duración. Solo llena lo vacío: lo que trae la Planilla de Ingreso manda.
- **Muestra lo pendiente del equipo** (2026-10-14, `js/pendientes.js`). Arriba de la lista de proyectos, con la biblioteca conectada, la sección **Pendientes del equipo** lee la Planilla y el buzón de la carpeta de intercambio (solo lectura):
  - **Por ofertar**: los requerimientos «En evaluación» de la Planilla, del cierre más próximo al más lejano, con un aviso «Cierra mañana / en N días» (rojo hasta 2 días, ámbar hasta 5). Si ya tienen proyecto, **Abrir**; si no, **Formular** abre *Nuevo proyecto* con la carpeta de ese N° elegida, o con «Nueva carpeta» lista si todavía no existe.
  - **Pasar a la Planilla**: las sugerencias del Formulador y del monitor de Mercado Público que esperan, agrupadas por N° y solo con lo que falta escribir (la más nueva de cada columna; lo que la planilla ya muestra no se pide), con el valor para copiar, lo que dice hoy la planilla y de dónde viene. El procesador las cierra solas cuando la planilla las muestra.
  - **En Sistema QUEMPIN**: las cotizaciones preparadas que nadie ha emitido.
  - El mismo aviso de cierre va junto al estado en la lista y en el encabezado de cada proyecto en formulación.
- **Pega filas desde Excel** en materiales, equipos y otros (2026-10-14, `js/pegar.js`): de una planilla de formulación antigua, de cualquier Excel o de la cotización del tablero del Cotizador Histórico («Copiar para el Formulador»). Reconoce descripción, unidad, cantidad y costo unitario con o sin encabezados, números escritos como en Chile y unidades comunes; muestra una vista previa, deja los costos con IVA en neto si se marca, y agrega todas las filas a la partida elegida.
- **Muestra por qué no se emitió una cotización**: si se descartó en Sistema QUEMPIN (1.3.7 o posterior), el motivo aparece en el *Seguimiento* y en lo que sigue.
- **Sabe quién trabaja** (2026-10-16, `js/usuario.js`). El botón de usuario de la cabecera elige las iniciales del equipo (NB, ES, LC, CM, MP, SV); se recuerdan en el navegador, en la misma clave que el Portal QUEMPIN (`quempin_usuario`), así que elegirlas en uno vale para el otro.
  - Un proyecto nuevo parte con su **responsable**: el Evaluador que la Planilla le asignó a ese N° o, si no tiene, el usuario. El campo *Responsable* es una lista con el equipo (un texto de antes se conserva) y sale en el Excel.
  - La lista de proyectos filtra **Mis proyectos** (se recuerda en el navegador), cada inicial con su cuenta, y *Sin responsable*.
  - *Pendientes del equipo* dice el evaluador de cada requerimiento por ofertar y marca **Tuyo** los del usuario.
  - La evaluación de costos se registra en el Control de Documentos con las iniciales del usuario, sin volver a pedirlas, y lo que se envía a las demás herramientas va firmado por él. La primera vez se adoptan las iniciales que el navegador ya tenía (`qpn.formulacion.iniciales` o el «Responsable por defecto» de antes) si son del equipo.
  - La lista del equipo también está en el registro del Portal y en Sistema QUEMPIN (`app/config.py`, `USUARIOS`): si el equipo cambia, se cambia en los tres.

## Publicación y actualización

- Repositorio: https://github.com/cristobal-monzo/formulacion-proyectos-quempin
- GitHub Pages publica la rama `main` desde la raíz (`/`). Cada `git push` a `main` actualiza el sitio en uno o dos minutos:
  ```bash
  git add .
  git commit -m "descripción del cambio"
  git push
  ```
- El sitio es público, igual que las demás herramientas QUEMPIN publicadas con GitHub Pages. **No contiene datos de proyectos**: esos viven en el navegador de cada usuario y la carpeta compartida de OneDrive. Nunca se suben al repositorio archivos de la biblioteca.
- Al abrirla pide **la misma contraseña de los Tableros Financieros** (desde el 2026-10-13). La página no la lleva escrita: trae un sobre corto cifrado con ella (`<script id="llaveFormulador">` en `index.html`), y la barrera la verifica abriéndolo con `js/candado.js`, copia del candado de los tableros. El navegador recuerda la misma clave que los tableros (`quempin_viz_clave`): quien ya entró a un tablero entra directo, y entrar acá abre los tableros. Los scripts de la herramienta se cargan recién después. Si la contraseña cambia, se regenera el sobre con `py -3.14 "Visualizador Web/candado.py" --llave-formulador` (repositorio Finanzas QUEMPIN) y se publica. Las marcas antiguas (`quempin_formulador_unlocked`) ya no abren en el sitio publicado; solo en `127.0.0.1`, donde corren las pruebas.

También funciona abriendo `index.html` directamente desde el computador (doble clic). Para exportar e importar Excel se usa la copia local de la librería en `vendor/`, así que no necesita internet. Sin conexión solo cambian las tipografías.

## Dónde quedan los datos

Los proyectos se guardan en el navegador y en la carpeta del equipo (el modo SharePoint, que nunca se configuró, se retiró el 2026-10-19; queda en el historial de git).

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

Eliminar un proyecto lo envía a la **papelera** (*Más → Papelera*), desde donde se restaura. Sin carpeta compartida también se puede eliminar definitivamente; en la carpeta compartida el archivo queda: para borrarlo del todo se hace allá.

## Uso rápido

1. **Datos** → al crear el proyecto eliges (o creas) la carpeta de su oferta: con su N° de requerimiento llegan el título, la ubicación y el presupuesto de la planilla. Completa el cliente, la **categoría** (un trato directo no lleva ID ni presupuesto) y el responsable. Si las bases piden anexos, anótalos en **Entregables para postular** (o pega la lista de las bases) y márcalos a medida que estén listos. Los parámetros (IVA, tarifas, metas) ya vienen con los valores de *Configuración*; ábrelos solo si este proyecto es distinto.
2. **Partidas** → agrega cada partida con su cantidad y unidad. Los costos comunes a todo el trabajo (instalación de faenas, traslados…) van en la **partida base** (*Agregar partida base*, o *⋯ → Convertir en partida base*; código PB, siempre primera): no va sola en la cotización y su costo directo se divide en partes iguales entre las demás partidas, por categoría, antes de la utilidad de cada una (2026-10-09). En el Excel exportado queda en un bloque bajo el total de la hoja *Partidas*, con fórmulas vivas.
3. **Costos** → en *Materiales*, *Equipos*, *Mano de obra* y *Otros* agrega los ítems, elige su partida e ingresa las cantidades **por unidad de partida**. En *Otros* puedes usar **Agregar desde catálogo**. Un costo común a varias partidas se **reparte**: en el selector de partida se marcan sus casillas (o *Seleccionar todas*) y *Dividir entre N partidas*; su total (cantidad × costo unitario, sin multiplicar por la cantidad de ninguna partida) se divide en partes iguales entre ellas (2026-10-20). En el Excel su partida queda como «P1+P2+P3». Los campos de texto ponen en mayúscula la primera letra al escribir.
4. **Utilidad y precio** → define la **utilidad** de cada partida (% o $) y copia los valores netos para la cotización.
5. **Evaluación** → revisa el veredicto y corrige las alertas. El botón del pie lleva a lo que sigue: **preparar la cotización** en Sistema QUEMPIN.
6. **Seguimiento** → la oferta sigue sola su recorrido: la cotización emitida aparece con su número, **Marcar como Enviada** cuando sale al cliente y, si se adjudica, **Pasar a ejecución**. La línea «Recorrido de la oferta», arriba de los pasos, dice en qué etapa va; al desplegarla se ven las seis etapas y qué sigue. Para una revisión de la oferta usa **⋯ → Crear nueva versión** (mismo código, v2, v3…).

Los valores con que parten los proyectos nuevos (IVA, tarifas, metas y el prefijo del código) se cambian en **Configuración**, arriba a la derecha.

Proyectos grandes: una pestaña de costos con más de 300 filas usa columnas de ancho fijo, para que escribir siga siendo inmediato (con 1.500 materiales, cada tecla pasó de ~0,5 s a ~0,08 s el 2026-10-08).

**Carta Gantt: herramienta aparte (2026-10-20).** La Carta Gantt nació como pestaña del Formulador (2026-10-13) y el 2026-10-20 pasó a ser una herramienta propia, en `gantt/` (publicada en `/formulacion-proyectos-quempin/gantt/`), con su ventana en el Portal QUEMPIN. Tiene su lista de cartas y sus datos: en este navegador (`qpn.gantt.cartas.v1`) y, con el equipo, en la carpeta de intercambio (`publicado/gantt/<uid>.json`, con la misma regla de conflictos que los proyectos). Cada carta va vinculada a un proyecto del Formulador (lo lee, no lo cambia: para su código y para *Crear desde las partidas*) o es suelta, con nombre propio. Las cartas que había dentro de los proyectos (`p.gantt`) se **traspasan solas** la primera vez que se abre la herramienta, en cualquier navegador: el Formulador ya no las muestra ni las cambia, pero conserva `p.gantt` para ese traspaso, y una copia o versión nueva del proyecto ya no lo arrastra. El Excel del Formulador ya no lleva la hoja *Carta Gantt*: la herramienta descarga su propio PDF y su propio Excel. Un enlace antiguo `#/p/<uid>/gantt` lleva a `gantt/#/proyecto/<uid>`. *Crear desde las partidas* agrega un hito de inicio, una tarea por partida (una tras otra, con la duración que sugiere su mano de obra: días por unidad × cantidad, una cuadrilla) y un hito de entrega; también se agregan tareas e hitos a mano. Cada tarea lleva responsable, duración, predecesoras (`2`, `2CC`, `2FF`, `2+3`), fecha «no antes de» y avance. El calendario es de días hábiles (con días no laborables) o corridos. La ruta crítica va en naranja. Ctrl+Z y Ctrl+Y deshacen y rehacen.

Atajos: en el proyecto abierto, **Ctrl+Z** deshace el último cambio y **Ctrl+Y** (o Ctrl+Shift+Z) lo rehace, hasta 100 pasos; también con las flechas junto a *Exportar Excel* (2026-10-09). Lo escrito seguido en un mismo campo es un paso, y cada acción (agregar o eliminar una fila, aplicar la utilidad) es otro; al deshacer, la herramienta vuelve a la pestaña donde se hizo el cambio y lo marca. No retira lo ya enviado a otras herramientas (Análisis Financiero, Sistema QUEMPIN, carpeta de la oferta). En las tablas, **Enter** baja a la fila siguiente (en la última fila agrega una nueva). En la columna de unidad, **↓** abre la lista de unidades. Duplicar, mover o eliminar una fila está en su menú **⋯**. En el listado, **/** enfoca el buscador. Los menús y selectores se manejan con flechas, **Enter** y **Esc**. En el teléfono las tablas se muestran como tarjetas.

## Estructura

```
index.html              Página principal
css/brand.css           Sistema de marca compartido con las demás herramientas QUEMPIN (no editar)
css/styles.css          Estilos propios (componentes, gráficos, modo claro/oscuro, impresión)
js/calc.js              Motor de cálculo (replica las fórmulas del Excel)
js/kpis.js              Definición y descripción de cada KPI
js/usuario.js           Quién trabaja: las iniciales del equipo, compartidas con el Portal QUEMPIN (quempin_usuario)
js/store.js             Modelo de datos, valores por defecto, papelera y guardado en el navegador
js/excel.js             Exportación e importación (Excel y JSON)
js/intercambio.js       Carpeta de intercambio con las demás herramientas QUEMPIN (Análisis Financiero)
js/herramientas.js      Lo demás que se intercambia: requerimientos, precios, sesgo, cotización, venta, planilla, Control de Documentos
js/flujo.js             Recorrido de la oferta (seis etapas) y qué sigue: solo calcula, app.js lo pinta
js/esquemas.js          Validador del catálogo de mensajes (copia textual de Finanzas QUEMPIN/Sistema Intercambio/esquemas.js)
js/pulso.js             Pulso del procesador del intercambio: cuándo avisar que está detenido (copia textual de Finanzas QUEMPIN/Sistema Intercambio/pulso.js)
js/busqueda.js          Buscador de precios (copia textual del de Cotizador Historico/Visualizador Web/busqueda.js)
js/compartida.js        Proyectos compartidos con el equipo por esa carpeta (modo local)
js/oferta.js            Copia en Excel de cada presupuesto en la carpeta de su oferta (modo local)
js/candado.js           Verificación de la contraseña (copia textual de Finanzas QUEMPIN/Visualizador Web/candado.js)
js/app.js               Interfaz
gantt/                  Carta Gantt, herramienta aparte (index.html, app.js interfaz, datos.js cartas y carpeta
                        del equipo, gantt.js cálculo y lámina, pdf.js PDF sin librerías, excel.js su Excel, gantt.css)
js/logo-data.js         Logo oficial embebido para el Excel exportado
vendor/exceljs.min.js   Librería ExcelJS 4.4.0 (licencia MIT, ver vendor/exceljs.LICENSE)
assets/                 Logos oficiales (fondo blanco y fondo negro), isotipo e íconos
ejemplos/               Proyecto de ejemplo con los datos del Excel original (JSON importable)
docs/ANALISIS_KPI.md    Evaluación de los KPI del Excel y puntos de mejora
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

- **Valores por defecto** (IVA, tarifas por nivel, metas, catálogo de otros costos): ajústalos en la ficha de un proyecto y presiona *Usarlos como predeterminados para proyectos nuevos*. Para cambiar los valores de fábrica, edita `DEFAULT_PARAMETROS` y `DEFAULT_CATALOGO` en `js/store.js`.
- **Textos de los KPI:** se editan en `js/kpis.js`. Se reflejan en la herramienta, en la guía y en el Excel exportado.
- **Fórmulas:** están en `js/calc.js`. Con el ejemplo del Excel el resultado debe ser costo directo $2.046.404 y precio neto $4.092.808.
