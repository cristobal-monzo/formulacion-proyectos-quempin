# Evaluación de KPIs y puntos de mejora

**Archivo analizado:** `Excel General Proyectos_CLP.xlsm` (hojas Costos, Resumen, Carta Gantt y Referencias)
**Fecha del análisis:** 28-09-2026
**Alcance:** hojas de costos, resumen e indicadores. La Carta Gantt quedó fuera por ahora.

---

## 1. Resumen ejecutivo

- **El modelo de costos del Excel es sólido.** Funciona como un análisis de precio unitario: cada partida tiene cantidad, y los materiales, equipos, mano de obra y otros costos se ingresan por unidad de partida. La herramienta web replica exactamente ese cálculo. Con los datos del Excel da el mismo costo directo ($2.046.404), el mismo precio neto ($4.092.808) y los mismos KPI.
- **De los 8 indicadores del Resumen, 5 funcionan bien, 2 están incompletos y 1 es engañoso.**
  - Incompletos: *Presupuesto máximo* no tiene valor y *Competitividad de oferta* no tiene fórmula.
  - Engañoso: en F2 hay un ratio sin etiqueta, Utilidad ÷ Precio con IVA (42 %), que mezcla el IVA con la rentabilidad.
  - Además, la *Sensibilidad MO* está fija en +10 % dentro de la fórmula.
- **Los mayores riesgos no están en los KPI sino en la estructura de costos.**
  - Los identificadores dependen del número de fila.
  - Los costos sin partida se pierden sin aviso.
  - Las utilidades quedan amarradas a la posición de la fila, no a la partida.
  - Una fila vacía entre partidas puede sacar la última partida del resumen.

  Estos errores no dan mensaje: el total simplemente queda mal.
- **La herramienta corrige esos problemas y agrega 3 indicadores:** recargo sobre costo (markup), holgura de mano de obra y costo total con gastos generales e imprevistos. También añade sensibilidad por categoría, semáforos con metas configurables y alertas de validación.

---

## 2. Cómo calcula el Excel (y la herramienta)

| Concepto | Fórmula |
|---|---|
| Subtotal material | Cant. partida × Cant. M × Costo unitario M |
| Subtotal equipo | Cant. partida × Cant. E × Costo unitario E |
| Subtotal mano de obra | Cant. partida × Σ (personas × días × tarifa del nivel) |
| Días-Hombre | Cant. partida × Σ (personas × días) |
| Subtotal otros | Cant. partida × Cant. O × Costo unitario O |
| Costo directo de la partida | Materiales + Equipos + MO + Otros |
| Utilidad de la partida | "100%" → costo directo × 100 % · "$500.000" → monto fijo |
| Precio neto | Σ costo directo + Σ utilidad |
| IVA / Precio bruto | Precio neto × 19 % / Precio neto + IVA |

Tarifas día-hombre (hoja Referencias): Nivel 1 $45.000 · Nivel 2 $60.000 · Nivel 3 $75.000.

> **Implícito importante:** todas las cantidades de detalle son **por unidad de partida**. Si la partida son 3 medidores y cada uno lleva 2 flanges, se ingresa 2 (no 6). El Excel no lo dice en los encabezados; la herramienta sí.

---

## 3. Evaluación de los KPI presentes en el Excel

Valores del ejemplo incluido en el Excel (3 partidas de instalación de medidores de gas natural).

| # | KPI (celda) | Fórmula actual | Valor | Evaluación | Qué se hizo en la herramienta |
|---|---|---|---|---|---|
| 1 | Costo total (G1) | Σ costos directos | $2.046.404 | ✔ Correcto, pero el nombre induce a error: es **costo directo**. No incluye gastos generales ni imprevistos. | Se renombra *Costo directo*. Se agrega *Costo total* = CD + GG + imprevistos (opcional; con 0 % queda igual al Excel). |
| 2 | Utilidades (G2) | Σ utilidad por partida | $2.046.404 | ✔ Correcto. | Se muestra junto al recargo equivalente. |
| 3 | Precio de venta neto (G3) | Costo + Utilidad | $4.092.808 | ✔ Correcto. | Igual. |
| 4 | IVA (G4) | Precio neto × F4 | $777.634 | ✔ Correcto; la tasa está en una celda editable. | Tasa editable por proyecto. |
| 5 | Precio de venta bruto (G5) | Neto + IVA | $4.870.442 | ✔ Correcto. | Igual. |
| 6 | Presupuesto máximo (G6) | — (vacío) | — | ✖ No tiene valor y ninguna fórmula lo usa. No indica si es neto o con IVA. | Campo en la ficha con casilla "incluye IVA". Alimenta el KPI de competitividad. |
| 7 | Margen bruto (K1) | Utilidad ÷ Precio neto | 50,0 % | ▲ Cálculo correcto, pero **sobreestima el margen real**: no descuenta gastos generales. No hay meta: no dice si 50 % es bueno o malo. | Se renombra *Margen sobre venta*. Semáforo con margen objetivo y mínimo editables. |
| 8 | Ratio sin etiqueta (F2) | Utilidad ÷ Precio **con IVA** | 42,0 % | ✖ **Engañoso.** El IVA no es ingreso de la empresa. Este ratio siempre muestra un margen menor al real y puede confundirse con el margen. | Se elimina. |
| 9 | Rentabilidad por Día-Hombre (K2) | Utilidad ÷ DH | $85.267 | ✔ Muy útil para priorizar cuando las cuadrillas son el recurso escaso. ▲ "Rentabilidad" suele asociarse a retorno sobre inversión. | Se renombra *Utilidad por día-hombre*. Se agrega la venta por DH y una meta opcional con semáforo. |
| 10 | Incidencia de MO sobre venta (K3) | Costo MO ÷ Precio neto | 44,0 % | ✔ Útil. ▲ Aislado no dice cuánto riesgo implica. | Se complementa con la incidencia sobre el costo directo (88 %) y con la *holgura de MO*. |
| 11 | Sensibilidad MO +10 % (K4) | `=E210*-0.1/G2` | −8,8 % | ▲ Idea correcta, pero el +10 % está **escrito dentro de la fórmula**, solo cubre MO y no muestra la utilidad resultante. | Simulador con variación editable para materiales, equipos, MO y otros. Muestra el sobrecosto, la utilidad y el margen del escenario, con semáforo. |
| 12 | Días-Hombre ejecución (K5) | Σ columna Días Hombre | 24 | ✔ Útil. ▲ En las filas 6 a 8 los DH están **escritos a mano** (12, 4, 8) y no con fórmula: si cambia la cantidad de la partida, no se actualizan. ▲ Se puede confundir con el plazo. | Siempre se calcula. La descripción aclara que no es el plazo. |
| 13 | Competitividad de oferta (I6) | — (sin fórmula) | — | ✖ Existe la etiqueta pero no el cálculo. | Precio ÷ Presupuesto máximo, con criterio neto o con IVA. Semáforo: con holgura, ajustada (≥ 95 %) o excede el presupuesto (> 100 %). |

El gráfico del Resumen pone el IVA junto a los costos y la utilidad, como si fuera parte de la composición del precio. La herramienta muestra la composición del **precio neto** y deja el IVA aparte.

---

## 4. Indicadores agregados y por qué

| Indicador nuevo | Fórmula | Por qué aporta |
|---|---|---|
| **Recargo sobre costo (markup)** | Utilidad ÷ Costo total | Aclara que el "100 %" que se escribe en la utilidad es un recargo sobre el costo, equivalente a 50 % de margen. También se lee como holgura total: cuánto pueden subir los costos antes de perder. |
| **Holgura de mano de obra** | Utilidad ÷ Costo MO | En proyectos donde la MO es 88 % del costo directo, el riesgo principal es la productividad. Este número dice cuánto más puede costar la MO antes de trabajar gratis. En el ejemplo es 113,7 %. |
| **Costo total con GG e imprevistos** | CD × (1 + %GG + %imprevistos) | Permite que el margen refleje la estructura de la empresa y una reserva de riesgo. Es opcional: con 0 % el resultado es idéntico al Excel. |
| **Sensibilidad por categoría** | −Σ (costo × variación) ÷ Utilidad | Reemplaza el +10 % fijo. Permite, por ejemplo, simular un alza de 15 % en materiales. |
| **Semáforos con metas** | Configurables por proyecto | Convierten cada número en una lectura inmediata: cumple, atención o bajo el mínimo. |

---

## 5. Descripción de cada KPI y cómo aporta a la evaluación

Estas descripciones son las mismas que aparecen en la herramienta (pestaña *Resumen y KPIs*, sección *Guía de KPIs*) y en la hoja *Ficha* del Excel exportado.

### Resultado económico

#### Costo directo

| | |
|---|---|
| **Origen en el Excel** | Resumen!G1 «Costo total» |
| **Fórmula** | Σ Materiales + Equipos + Mano de obra + Otros de todas las partidas |
| **Valor en el ejemplo** | $2.046.404 |
| **Qué mide** | Lo que cuesta ejecutar físicamente el proyecto: insumos, equipos, días-hombre y gastos asociados a cada partida. |
| **Cómo aporta a la evaluación** | Es la base del precio: cualquier error aquí se propaga a la utilidad, al precio y a todos los indicadores. Un ítem sin partida asociada no suma, por eso la herramienta lo marca como alerta. |

#### Costo total · *nuevo*

| | |
|---|---|
| **Origen en el Excel** | No existía |
| **Fórmula** | Costo directo + Gastos generales + Imprevistos |
| **Valor en el ejemplo** | $2.046.404 |
| **Qué mide** | El costo completo del proyecto, incluyendo la estructura de la empresa (gastos generales) y una reserva para riesgos (imprevistos), ambos como % del costo directo. |
| **Cómo aporta a la evaluación** | Evita sobreestimar el margen: el Excel calculaba el margen solo contra costos directos. Con GG e imprevistos en 0 % el resultado es idéntico al Excel. |

#### Utilidad

| | |
|---|---|
| **Origen en el Excel** | Resumen!G2 «Utilidades» |
| **Fórmula** | Σ por partida: % sobre su costo directo, o monto fijo |
| **Valor en el ejemplo** | $2.046.404 |
| **Qué mide** | La ganancia esperada si el proyecto se ejecuta tal como se presupuestó. |
| **Cómo aporta a la evaluación** | Es el resultado que se arriesga en la ejecución. Se complementa con la sensibilidad y las holguras para saber cuánto sobrecosto soporta. |

#### Precio de venta neto

| | |
|---|---|
| **Origen en el Excel** | Resumen!G3 |
| **Fórmula** | Costo total + Utilidad |
| **Valor en el ejemplo** | $4.092.808 |
| **Qué mide** | El monto a ofertar sin IVA. |
| **Cómo aporta a la evaluación** | Es la base para comparar con el presupuesto del cliente y para calcular margen e incidencias. |

#### IVA

| | |
|---|---|
| **Origen en el Excel** | Resumen!G4 |
| **Fórmula** | Precio neto × tasa de IVA (19 %) |
| **Valor en el ejemplo** | $777.634 |
| **Qué mide** | El impuesto que se recarga al cliente. |
| **Cómo aporta a la evaluación** | No es ingreso de la empresa (se entera al SII), por eso ningún margen ni rentabilidad debe calcularse sobre el precio con IVA. |

#### Precio de venta bruto

| | |
|---|---|
| **Origen en el Excel** | Resumen!G5 |
| **Fórmula** | Precio neto + IVA |
| **Valor en el ejemplo** | $4.870.442 |
| **Qué mide** | El monto total que paga el cliente. |
| **Cómo aporta a la evaluación** | Es el valor a comparar cuando el presupuesto del mandante viene informado con IVA incluido. |

### Indicadores de evaluación

#### Margen sobre venta

| | |
|---|---|
| **Origen en el Excel** | Resumen!K1 «Margen bruto» |
| **Fórmula** | Utilidad ÷ Precio de venta neto |
| **Valor en el ejemplo** | 50,0 % |
| **Qué mide** | Qué parte de cada peso vendido queda como ganancia. |
| **Cómo aporta a la evaluación** | Es el indicador principal de conveniencia económica y permite comparar proyectos de distinto tamaño. Ojo: un recargo de 100 % sobre el costo equivale a un margen de 50 %. |
| **Semáforo** | Verde ≥ margen objetivo · Amarillo entre mínimo y objetivo · Rojo bajo el mínimo (metas editables en Parámetros). |

#### Recargo sobre costo (markup) · *nuevo*

| | |
|---|---|
| **Origen en el Excel** | No existía |
| **Fórmula** | Utilidad ÷ Costo total |
| **Valor en el ejemplo** | 100,0 % |
| **Qué mide** | Cuánto se agrega sobre el costo para llegar al precio. |
| **Cómo aporta a la evaluación** | Se lee también como holgura total: los costos pueden subir hasta este % antes de que el proyecto pierda dinero. Aclara la confusión entre "100 %" de utilidad (recargo) y 50 % de margen. |

#### Días-Hombre de ejecución

| | |
|---|---|
| **Origen en el Excel** | Resumen!K5 |
| **Fórmula** | Σ Cant. partida × (personas × días) de los tres niveles |
| **Valor en el ejemplo** | 24 |
| **Qué mide** | El esfuerzo total de mano de obra del proyecto. |
| **Cómo aporta a la evaluación** | Sirve para dimensionar cuadrillas y es la base de los indicadores por día-hombre. No es el plazo: 24 DH pueden ejecutarse en 6 días con 4 personas. |

#### Utilidad por día-hombre

| | |
|---|---|
| **Origen en el Excel** | Resumen!K2 «Rentabilidad por Día-Hombre» |
| **Fórmula** | Utilidad ÷ Días-Hombre |
| **Valor en el ejemplo** | $85.267 |
| **Qué mide** | Cuánto gana la empresa por cada día de trabajo de una persona. |
| **Cómo aporta a la evaluación** | Cuando la capacidad de las cuadrillas es el recurso escaso, conviene priorizar los proyectos con mayor utilidad por DH aunque su margen % sea menor. Define una meta en Parámetros para activar el semáforo. |

#### Incidencia de MO sobre venta

| | |
|---|---|
| **Origen en el Excel** | Resumen!K3 |
| **Fórmula** | Costo de mano de obra ÷ Precio de venta neto |
| **Valor en el ejemplo** | 44,0 % |
| **Qué mide** | El peso de la mano de obra dentro del precio. |
| **Cómo aporta a la evaluación** | Una incidencia alta hace al proyecto sensible a rendimientos, atrasos y retrabajos; una baja lo hace sensible al precio de los materiales. Orienta dónde enfocar el control en la ejecución. |

#### Holgura de mano de obra · *nuevo*

| | |
|---|---|
| **Origen en el Excel** | No existía |
| **Fórmula** | Utilidad ÷ Costo de mano de obra |
| **Valor en el ejemplo** | 113,7 % |
| **Qué mide** | Cuánto puede crecer el costo de MO (más días, más personal) antes de que la utilidad llegue a cero. |
| **Cómo aporta a la evaluación** | Traduce el riesgo de productividad a un número concreto: si la holgura es 30 %, basta que la cuadrilla demore 30 % más para trabajar gratis. |

#### Sensibilidad de la utilidad

| | |
|---|---|
| **Origen en el Excel** | Resumen!K4 «Sensibilidad MO (+10%)» |
| **Fórmula** | −Σ (costo de la categoría × variación simulada) ÷ Utilidad |
| **Valor en el ejemplo** | -8,8 % |
| **Qué mide** | Cuánto cae la utilidad si los costos suben según el escenario simulado. |
| **Cómo aporta a la evaluación** | El Excel solo simulaba +10 % de MO con un valor fijo en la fórmula. Aquí se simula cualquier variación por categoría y se muestra la utilidad y el margen resultantes. |
| **Semáforo** | Rojo si el escenario deja utilidad negativa · Amarillo si el margen cae bajo el mínimo. |

#### Competitividad de la oferta

| | |
|---|---|
| **Origen en el Excel** | Resumen!I6 (estaba sin fórmula) |
| **Fórmula** | Precio ofertado ÷ Presupuesto máximo (ambos netos o ambos con IVA) |
| **Valor en el ejemplo** | — (requiere presupuesto) |
| **Qué mide** | Qué tan cerca está la oferta del presupuesto disponible del mandante. |
| **Cómo aporta a la evaluación** | Sobre 100 % la oferta excede el presupuesto y puede quedar fuera de bases. Muy por debajo (< 80 %) conviene revisar si se está dejando utilidad sobre la mesa. |
| **Semáforo** | Verde < umbral de ajuste · Amarillo entre el umbral y 100 % · Rojo > 100 %. |


### Cómo leerlos en conjunto

1. **¿Conviene?** Margen sobre venta y utilidad por día-hombre. El margen compara proyectos de distinto tamaño. La utilidad por DH compara proyectos que compiten por las mismas cuadrillas.
2. **¿Es riesgoso?** Holgura de MO, incidencia de MO y sensibilidad. Con holgura baja e incidencia alta, un atraso pequeño se come la utilidad.
3. **¿Podemos ganar?** Competitividad frente al presupuesto del mandante. Sobre 100 % hay que revisar el alcance o la utilidad. Muy por debajo, quizás se puede subir el precio.
4. **¿Los números son confiables?** Revisar las alertas de validación antes de enviar la oferta.

---

## 6. Puntos de mejora en la estructura de costos del Excel

Ordenados por impacto. Todos están resueltos en la herramienta web.

### Alto impacto: pueden dejar mal el precio sin ningún aviso

1. **Los identificadores dependen del número de fila.**
   - Qué pasa: los ID se calculan como `"P"&ROW()-5` (también M, E, H y O). Las columnas *Partida asoc.* guardan el texto ("P3"). Al insertar, eliminar u ordenar filas, los ID se renumeran pero las asociaciones no cambian.
   - Consecuencia: los costos pasan a otra partida sin que nadie lo note.
   - En la herramienta: cada partida tiene un identificador interno fijo. Reordenar o eliminar partidas no altera las asociaciones.
2. **Los costos sin partida desaparecen en silencio.**
   - Qué pasa: los subtotales usan `IFERROR(VLOOKUP(...),"")`. Si un ítem no tiene partida o apunta a una que no existe, su costo queda en blanco y no se suma.
   - Caso real en el archivo: la fila 9 de Otros, «Desgaste de vehículo Citroen por km», no tiene partida, cantidad ni costo.
   - En la herramienta: alerta en rojo, contador en la pestaña y listado de alertas con enlace a la fila.
3. **Las utilidades dependen de la posición.**
   - Qué pasa: la utilidad se escribe en `Resumen!I` según la fila del resumen, no en la partida. Si en Costos se inserta o reordena una partida, la utilidad escrita queda asignada a otra.
   - En la herramienta: la utilidad es un atributo de cada partida.
4. **Una fila vacía entre partidas saca partidas del resumen.**
   - Qué pasa: `ListaPartidas` usa `OFFSET` con un conteo de celdas no vacías. Si hay una fila en blanco entre partidas, el resumen incluye la fila vacía y **excluye la última partida**, cuyos costos no se suman.
   - En la herramienta: no aplica, porque las partidas son una lista sin posiciones vacías.

### Impacto medio

5. **Rango inconsistente en Otros.** El subtotal de Otros busca en `$A$6:$D$197`, mientras el resto usa `$A$6:$D$205`. Las partidas en las filas 198 a 205 pierden sus costos de Otros.
6. **La utilidad escrita como texto es frágil.** La fórmula con `LET` borra los puntos: "12.5%" se interpreta como **125 %**. Un número sin símbolo se toma como monto en pesos. En la herramienta se elige explícitamente % o $, y la importación de Excel antiguos interpreta bien el decimal.
7. **Cinco listas independientes en una misma tabla (`Tabla1`).**
   - Partidas, materiales, equipos, MO y otros comparten filas sin relación entre sí.
   - Ordenar o filtrar la tabla mezcla los datos.
   - Hay un límite práctico de 200 filas.
8. **Días-Hombre escritos a mano** en AA6:AA8, mientras las demás filas usan fórmula.
9. **Sin gastos generales ni imprevistos.** El precio se forma solo sobre el costo directo. La herramienta los agrega como % opcional.
10. **Costos de "Otros" escritos a mano.** El almuerzo ($10.000) se escribe en cada fila aunque exista en Referencias. Si se actualiza la referencia, no se propaga. La herramienta tiene un catálogo que completa descripción, unidad y costo.

### Bajo impacto: orden y mantenimiento

11. **Macro sin uso.** El módulo `Calcular` ejecuta Solver sobre B12 y B36, celdas que no corresponden al modelo actual. Obliga a usar .xlsm y a pasar por las alertas de seguridad de macros.
12. **Validaciones rotas.** Hay listas desplegables que apuntan a un nombre inexistente (`ListaPartidasID`) y validaciones en las filas 206 a 252, fuera de la tabla.
13. **Identificación del proyecto insuficiente.** Solo hay título y responsable, sin código, cliente, ubicación, fecha, versión ni estado. Eso dificulta llevar una cartera de ofertas. La herramienta asigna un código correlativo (QPN-AAAA-NNN) y permite versiones y la exportación de la cartera completa.
14. **Equipos sin columna de unidad**, a diferencia de materiales.

---

## 7. Próximos pasos recomendados (fuera del alcance actual)

- **Carta Gantt → flujo de caja.** Con el programa y los hitos de pago (anticipo, estados de pago, retenciones) se pueden calcular el capital de trabajo máximo, los días de financiamiento y el costo de boletas de garantía. Para proyectos cortos, estos indicadores aportan más que VAN o TIR.
- **Control real vs. presupuestado.** Registrar los costos y DH reales de los proyectos adjudicados para calibrar rendimientos (DH por unidad de partida) y las metas de margen.
- **Metas calibradas.** Las metas por defecto son un punto de partida: margen objetivo 30 %, mínimo 20 % y oferta ajustada desde 95 %. Conviene fijarlas con el histórico de QUEMPIN y guardarlas como predeterminadas.
- **Base de datos compartida.** Hoy cada navegador guarda sus proyectos, y se comparten exportando Excel o JSON. El siguiente paso es un almacenamiento común (SharePoint u OneDrive, un repositorio con los JSON o un backend liviano) para que todo el equipo vea la misma cartera.
