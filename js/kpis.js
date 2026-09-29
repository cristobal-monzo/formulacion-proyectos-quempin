/*
 * kpis.js — Definición y descripción de cada indicador.
 * Se usa en el paso "Evaluación", en la "Guía de uso" y en la hoja "Ficha" del Excel exportado.
 *   origen: celda equivalente en el Excel original (o "Nuevo")
 *   formato: 'clp' | 'pct' | 'num'
 */
(function (root) {
  'use strict';

  const KPIS = [
    // ---- Resultado económico ---------------------------------------------
    {
      key: 'cd', grupo: 'economico', nombre: 'Costo directo', formato: 'clp',
      origen: 'Resumen!G1 «Costo total»',
      formula: 'Σ Materiales + Equipos + Mano de obra + Otros de todas las partidas',
      queMide: 'Lo que cuesta ejecutar físicamente el proyecto: insumos, equipos, días-hombre y gastos asociados a cada partida.',
      aporte: 'Es la base del precio: cualquier error aquí se propaga a la utilidad, al precio y a todos los indicadores. Un ítem sin partida asociada no suma, por eso la herramienta lo marca como alerta.'
    },
    {
      key: 'costoTotal', grupo: 'economico', nombre: 'Costo total', formato: 'clp',
      origen: 'Nuevo',
      formula: 'Costo directo + Gastos generales + Imprevistos',
      queMide: 'El costo completo del proyecto, incluyendo la estructura de la empresa (gastos generales) y una reserva para riesgos (imprevistos), ambos como % del costo directo.',
      aporte: 'Evita sobreestimar el margen: el Excel calculaba el margen solo contra costos directos. Con gastos generales e imprevistos en 0 % el resultado es idéntico al Excel.'
    },
    {
      key: 'utilidad', grupo: 'economico', nombre: 'Utilidad', formato: 'clp',
      origen: 'Resumen!G2 «Utilidades»',
      formula: 'Σ por partida: % sobre su costo directo, o monto fijo',
      queMide: 'La ganancia esperada si el proyecto se ejecuta tal como se presupuestó.',
      aporte: 'Es el resultado que se arriesga en la ejecución. Se complementa con la sensibilidad y las holguras para saber cuánto sobrecosto soporta.'
    },
    {
      key: 'precioNeto', grupo: 'economico', nombre: 'Precio de venta neto', formato: 'clp',
      origen: 'Resumen!G3',
      formula: 'Costo total + Utilidad',
      queMide: 'El monto a ofertar sin IVA.',
      aporte: 'Es la base para comparar con el presupuesto del cliente y para calcular margen e incidencias.'
    },
    {
      key: 'iva', grupo: 'economico', nombre: 'IVA', formato: 'clp',
      origen: 'Resumen!G4',
      formula: 'Precio neto × tasa de IVA (19 %)',
      queMide: 'El impuesto que se recarga al cliente.',
      aporte: 'No es ingreso de la empresa (se entera al SII), por eso ningún margen ni rentabilidad debe calcularse sobre el precio con IVA.'
    },
    {
      key: 'precioBruto', grupo: 'economico', nombre: 'Precio de venta bruto', formato: 'clp',
      origen: 'Resumen!G5',
      formula: 'Precio neto + IVA',
      queMide: 'El monto total que paga el cliente.',
      aporte: 'Es el valor a comparar cuando el presupuesto del mandante viene informado con IVA incluido.'
    },

    // ---- Indicadores de evaluación ----------------------------------------
    {
      key: 'margen', grupo: 'indicador', nombre: 'Margen sobre venta', formato: 'pct',
      origen: 'Resumen!K1 «Margen bruto»',
      formula: 'Utilidad ÷ Precio de venta neto',
      queMide: 'Qué parte de cada peso vendido queda como ganancia.',
      aporte: 'Es el indicador principal de conveniencia económica y permite comparar proyectos de distinto tamaño. Ojo: un recargo de 100 % sobre el costo equivale a un margen de 50 %.',
      lectura: 'Verde ≥ margen objetivo · Amarillo entre mínimo y objetivo · Rojo bajo el mínimo (metas editables en Parámetros).'
    },
    {
      key: 'markup', grupo: 'indicador', nombre: 'Recargo sobre el costo', formato: 'pct',
      origen: 'Nuevo',
      formula: 'Utilidad ÷ Costo total',
      queMide: 'Cuánto se agrega sobre el costo para llegar al precio.',
      aporte: 'Se lee también como holgura total: los costos pueden subir hasta este % antes de que el proyecto pierda dinero. Aclara la confusión entre "100 %" de utilidad (recargo) y 50 % de margen.'
    },
    {
      key: 'dh', grupo: 'indicador', nombre: 'Días-hombre de ejecución', formato: 'num',
      origen: 'Resumen!K5',
      formula: 'Σ Cant. partida × (personas × días) de los tres niveles',
      queMide: 'El esfuerzo total de mano de obra del proyecto.',
      aporte: 'Sirve para dimensionar cuadrillas y es la base de los indicadores por día-hombre. No es el plazo: 24 días-hombre pueden ejecutarse en 6 días con 4 personas.'
    },
    {
      key: 'rentDH', grupo: 'indicador', nombre: 'Utilidad por día-hombre', formato: 'clp',
      origen: 'Resumen!K2 «Rentabilidad por Día-Hombre»',
      formula: 'Utilidad ÷ Días-Hombre',
      queMide: 'Cuánto gana la empresa por cada día de trabajo de una persona.',
      aporte: 'Cuando la capacidad de las cuadrillas es el recurso escaso, conviene priorizar los proyectos con mayor utilidad por día-hombre aunque su margen sea menor. Define una meta en Parámetros para activar el semáforo.'
    },
    {
      key: 'incidenciaMO', grupo: 'indicador', nombre: 'Incidencia de la mano de obra', formato: 'pct',
      origen: 'Resumen!K3',
      formula: 'Costo de mano de obra ÷ Precio de venta neto',
      queMide: 'El peso de la mano de obra dentro del precio.',
      aporte: 'Una incidencia alta hace al proyecto sensible a rendimientos, atrasos y retrabajos; una baja lo hace sensible al precio de los materiales. Orienta dónde enfocar el control en la ejecución.'
    },
    {
      key: 'holguraMO', grupo: 'indicador', nombre: 'Holgura de mano de obra', formato: 'pct',
      origen: 'Nuevo',
      formula: 'Utilidad ÷ Costo de mano de obra',
      queMide: 'Cuánto puede crecer el costo de mano de obra (más días, más personal) antes de que la utilidad llegue a cero.',
      aporte: 'Traduce el riesgo de productividad a un número concreto: si la holgura es 30 %, basta que la cuadrilla demore 30 % más para trabajar gratis.'
    },
    {
      key: 'sensibilidad', grupo: 'indicador', nombre: 'Sensibilidad de la utilidad', formato: 'pct',
      origen: 'Resumen!K4 «Sensibilidad MO (+10%)»',
      formula: '−Σ (costo de la categoría × variación simulada) ÷ Utilidad',
      queMide: 'Cuánto cae la utilidad si los costos suben según el escenario simulado.',
      aporte: 'El Excel solo simulaba +10 % de mano de obra con un valor fijo en la fórmula. Aquí se simula cualquier variación por categoría y se muestra la utilidad y el margen resultantes.',
      lectura: 'Rojo si el escenario deja utilidad negativa · Amarillo si el margen cae bajo el mínimo.'
    },
    {
      key: 'competitividad', grupo: 'indicador', nombre: 'Competitividad de la oferta', formato: 'pct',
      origen: 'Resumen!I6 (estaba sin fórmula)',
      formula: 'Precio ofertado ÷ Presupuesto máximo (ambos netos o ambos con IVA)',
      queMide: 'Qué tan cerca está la oferta del presupuesto disponible del mandante.',
      aporte: 'Sobre 100 % la oferta excede el presupuesto y puede quedar fuera de bases. Muy por debajo (< 80 %) conviene revisar si se está dejando utilidad sobre la mesa.',
      lectura: 'Verde < umbral de ajuste · Amarillo entre el umbral y 100 % · Rojo > 100 %.'
    }
  ];

  const byKey = Object.fromEntries(KPIS.map((k) => [k.key, k]));
  const api = { KPIS, byKey };
  root.QKPIs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
