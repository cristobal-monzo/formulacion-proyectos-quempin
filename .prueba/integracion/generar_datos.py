# -*- coding: utf-8 -*-
"""Datos FICTICIOS para la prueba de punta a punta de «Otras herramientas QUEMPIN»
(plan de integración, 2026-10-01). Arma la carpeta de intercambio como la dejaría el
procesador, con el catálogo de esquemas real y publicaciones que cumplen sus esquemas.
Uso: py -3.14 .prueba/integracion/generar_datos.py  ->  .prueba/integracion/datos.json"""
import json
import sys
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FINANZAS = AQUI.parents[3] / "Finanzas QUEMPIN"
sys.path.insert(0, str(FINANZAS / "Sistema Intercambio"))
sys.path.insert(0, str(FINANZAS / "Cotizador Historico" / "Sistema"))

import cotizador_historico as ch  # noqa: E402
import esquemas  # noqa: E402
import precios_referencia as pr  # noqa: E402

AHORA = datetime.now().astimezone().isoformat(timespec="seconds")


def sobre(herramienta, datos):
    return {"esquema": "quempin.intercambio/1", "herramienta": herramienta, "generado": AHORA, "datos": datos}


def compra(n_ref, nombre, desc, fecha, precio):
    c = {"n_ref": n_ref, "nombre_item": nombre, "descripcion": desc, "categoria_item": "Materiales",
         "proyecto": "Demo", "proveedor_tag": "Ferretería Ficticia", "fecha": fecha,
         "precio_original_sin_iva": precio, "precio_reajustado_hoy": precio,
         "precio_reajustado_hoy_con_iva": round(precio * 1.19), "excluido_motivo": None}
    return ch.agregar_taxonomia(c)


compras = [
    compra("DEMO-001", "Guante", "Guante de cuero para soldador", "2026-08-21", 5600),
    compra("DEMO-002", "Guante", "Guante de cuero para soldador talla L", "2026-07-02", 5200),
    compra("DEMO-003", "Válvula", 'Válvula de bola bronce 2"', "2026-06-10", 25000),
    compra("DEMO-004", "Codo", 'Codo cobre 3/4"', "2026-05-05", 1500),
]
ch.busqueda.indexar_para_snapshot(compras)
medidas = sorted({m for c in compras for m in c["_bm"]})
foto = {"generado": "01-10-2026 08:00", "uf_hoy": 39000.0, "uf_fecha": "01-10-2026 08:00", "uf_fuente": "prueba",
        "busqueda": ch.busqueda.config_para_snapshot(medidas), "items": compras}

CATS = ["Materiales", "Equipos", "Mano de Obra", "Otros"]
publicado = {
    "requerimientos": sobre("planilla-requerimientos", {
        "fuente": "Planilla de Ingreso de Requerimientos", "requerimientos": [
            {"numero": 280, "estado": "Ofertado", "titulo": "Conexión H2 laboratorio (ficticio)", "ubicacion": "Punta Arenas",
             "presupuesto": 3570000, "valorOfertado": None, "valorAdjudicado": None, "cierre": "2026-10-15"},
            {"numero": 12, "estado": "Descartado", "titulo": "Viejo (ficticio)"},
        ]}),
    "precios-referencia": sobre("cotizador-historico", pr.datos_desde_snapshot(foto)),
    "analisis-financiero": sobre("analisis-financiero", {
        "moneda": "CLP", "categorias": CATS, "mensajes": {},
        "proyectos": [{"tag": "DEMO", "nombre": "Proyecto demo", "cliente": "Cliente Demo", "categoria": None, "avance": 0,
                       "req": "280", "proyectados": {c: None for c in CATS}, "origen": {c: None for c in CATS},
                       "reales": {c: 0 for c in CATS}, "venta": {"cargada": False, "origen": None}}],
        "sesgo": {"proyectosTerminados": 7, "calculado": AHORA,
                  "porCategoria": {"Materiales": 0.166, "Equipos": -0.114, "Mano de Obra": 0.01, "Otros": -0.215}}}),
    "folios": sobre("sistema-quempin", {"tipos": {"81": {"nombre": "Evaluación de costos", "categoria": "Proyectos de ingeniería", "paises": {
        "Chile": {"ultimo": "812601", "fecha": "2026-01-12", "autor": "JB", "referencia": "Ficticio", "siguiente": "812602"},
        "Peru": {"ultimo": None, "fecha": None, "autor": None, "referencia": None, "siguiente": "812601"}}}}}),
    "contrapartes": sobre("sistema-quempin", {"clientes": [{"id": "761234567", "rut": "76.123.456-7", "razon_social": "Cliente Demo SpA"}],
                                              "proveedores": []}),
    "documentos-comerciales": sobre("sistema-quempin", {"documentos": [], "mensajes": {}}),
    "estado": sobre("procesador", {"procesador": {"ultimaCorrida": AHORA, "duracionSeg": 1.0, "equipo": "PRUEBA", "pasos": {}},
                                   "publicaciones": {}, "buzon": {}, "avisos": []}),
}
for nombre, s in publicado.items():
    errores = esquemas.validar_publicacion(nombre, s)
    assert not errores, (nombre, errores)

salida = {"esquemas.json": json.dumps(esquemas.paquete(), ensure_ascii=False)}
salida.update({f"publicado/{n}.json": json.dumps(s, ensure_ascii=False) for n, s in publicado.items()})
(AQUI / "datos.json").write_text(json.dumps(salida, ensure_ascii=False), encoding="utf-8")
print(f"ok: {len(salida)} archivos, {len(publicado['precios-referencia']['datos']['hojas'])} hojas de precios")
