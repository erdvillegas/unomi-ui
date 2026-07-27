#!/usr/bin/env python3
"""Crea segmentos, scoring, goals, campañas y listas orgánicos para "Taller de
Mike" (tienda de instrumentos + reparación, García N.L., online + físico).

Complementa scripts/seed_tallermike.py (perfiles + eventos). Sólo stdlib.
Uso:  python3 scripts/seed_definitions.py
Formas verificadas contra Unomi 3.0 — pastEventCondition usa numberOfDays +
minimumEventCount + eventCondition (sin `operator`). Ver memoria unomi-event-ingestion.
"""
import json, base64
from urllib import request, error

BASE = "http://localhost:8181/cxs"
AUTH = base64.b64encode(b"karaf:karaf").decode()

def api(method, path, body):
    req = request.Request(BASE + path, data=json.dumps(body).encode(), method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Basic " + AUTH)
    try:
        with request.urlopen(req, timeout=30) as r:
            return r.status
    except error.HTTPError as e:
        print(f"  ! {method} {path} -> {e.code} {e.read().decode()[:140]}")
        return e.code

# --- constructores de condición ----------------------------------------------
def cond(t, **pv): return {"type": t, "parameterValues": pv}
def meta(i, name, desc=""): return {"id": i, "name": name, "description": desc, "scope": "systemscope", "enabled": True}
def prof(name, op, val): return cond("profilePropertyCondition", propertyName=f"properties.{name}", comparisonOperator=op, propertyValue=val)
def etype(eid): return cond("eventTypeCondition", eventTypeId=eid)
def eprop(name, op, val): return cond("eventPropertyCondition", propertyName=name, comparisonOperator=op, propertyValue=val)
def AND(*subs): return cond("booleanCondition", operator="and", subConditions=list(subs))
def past(event_cond, days=120, min_count=1): return cond("pastEventCondition", numberOfDays=days, minimumEventCount=min_count, eventCondition=event_cond)

# --- Segmentos ---------------------------------------------------------------
SEGMENTS = [
    ("clientes-garcia", "Clientes de García, N.L.", prof("city", "equals", "García")),
    ("musicos-profesionales", "Músicos profesionales", prof("customerType", "equals", "musico_pro")),
    ("escuelas-musica", "Escuelas de música", prof("customerType", "equals", "escuela_musica")),
    ("compradores-online", "Compradores en línea", past(AND(etype("purchase"), eprop("scope", "equals", "onlinestore")))),
    ("clientes-tienda-fisica", "Clientes del local físico", past(eprop("scope", "equals", "tiendafisica"))),
    ("clientes-reparacion", "Clientes de reparación", past(etype("repair"))),
    ("compradores-guitarras", "Compradores de guitarras", past(AND(etype("purchase"), eprop("target.properties.category", "equals", "guitarras")))),
    ("clientes-frecuentes", "Clientes frecuentes (3+ compras)", past(etype("purchase"), min_count=3)),
]

# --- Scoring: engagement del cliente -----------------------------------------
SCORING = ("engagement-cliente", "Engagement del cliente", [
    (prof("customerType", "equals", "musico_pro"), 15),
    (prof("city", "equals", "García"), 5),
    (past(etype("purchase")), 20),
    (past(etype("purchase"), min_count=3), 25),
    (past(etype("repair")), 10),
    (past(etype("addToCart")), 5),
])

# --- Goals -------------------------------------------------------------------
GOALS = [
    ("conversion-compra", "Conversión: vista de producto → compra", etype("productView"), etype("purchase")),
    ("carrito-a-compra", "Carrito abandonado → compra", etype("addToCart"), etype("purchase")),
    ("explora-a-repara", "De explorar a solicitar reparación", etype("productView"), etype("repair")),
]

# --- Campañas ----------------------------------------------------------------
CAMPAIGNS = [
    ("regreso-a-clases", "Promo regreso a clases", "Campaña dirigida a clientes de García para el regreso a clases.",
     "2026-08-01T00:00:00Z", "2026-09-30T23:59:59Z", prof("city", "equals", "García")),
    ("temporada-navidena", "Temporada navideña", "Ofertas de fin de año para clientes recurrentes.",
     "2026-11-15T00:00:00Z", "2026-12-31T23:59:59Z", prof("customerType", "equals", "recurrente")),
]

# --- Listas ------------------------------------------------------------------
LISTS = [
    ("newsletter-musical", "Newsletter musical"),
    ("interesados-clases", "Interesados en clases de música"),
    ("clientes-vip", "Clientes VIP"),
]

def run():
    print("Segmentos…")
    for i, name, c in SEGMENTS:
        api("POST", "/segments", {"metadata": meta(i, name), "condition": c})
    print("Scoring…")
    sid, sname, elems = SCORING
    api("POST", "/scoring", {"metadata": meta(sid, sname),
        "elements": [{"condition": c, "value": v} for c, v in elems]})
    print("Goals…")
    for i, name, start, target in GOALS:
        api("POST", "/goals", {"metadata": meta(i, name), "startEvent": start, "targetEvent": target})
    print("Campañas…")
    for i, name, desc, s, e, c in CAMPAIGNS:
        api("POST", "/campaigns", {"metadata": meta(i, name, desc), "startDate": s, "endDate": e, "entryCondition": c})
    print("Listas…")
    for i, name in LISTS:
        api("POST", "/lists", {"itemId": i, "itemType": "userList", "metadata": meta(i, name)})
    print(f"Listo: {len(SEGMENTS)} segmentos, 1 scoring ({len(elems)} reglas), "
          f"{len(GOALS)} goals, {len(CAMPAIGNS)} campañas, {len(LISTS)} listas.")

if __name__ == "__main__":
    run()
