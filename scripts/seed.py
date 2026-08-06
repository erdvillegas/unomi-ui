#!/usr/bin/env python3
"""Puebla Apache Unomi con datos ficticios de "Taller de Mike" — tienda de
instrumentos musicales y servicios de reparación en García, Nuevo León.

En una sola corrida crea: perfiles + eventos (online + físico) y, encima de
ellos, segmentos, scoring, goals, campañas y listas orgánicos. Sólo stdlib.

Uso:  python3 scripts/seed.py [num_clientes]   # default 40
      python3 scripts/seed.py --no-defs        # sólo perfiles + eventos
Requiere Unomi en localhost:8181 (karaf/karaf) — ver CLAUDE.md.

Cómo funciona (verificado contra Unomi 3.0):
- Los eventos del endpoint público /context.json se validan contra JSON-Schema
  y el `scope` debe existir (validateScope). Por eso el script:
  1) registra los scopes onlinestore/tiendafisica,
  2) registra un esquema permisivo por cada tipo de evento de dominio,
  3) crea perfiles ricos vía admin POST /profiles,
  4) adjunta eventos a cada perfil vía /context.json con la cookie
     context-profile-id (así los eventos quedan ligados al perfil creado).
- Las definiciones usan formas verificadas: pastEventCondition = numberOfDays +
  minimumEventCount + eventCondition (sin `operator`). Ver memoria unomi-event-ingestion.
"""
import json, random, sys, time, uuid, base64
from urllib import request, error

BASE = "http://localhost:8181/cxs"
AUTH = base64.b64encode(b"karaf:karaf").decode()
random.seed(42)  # ponytail: determinista para reproducir/depurar; quita el seed si quieres variar

# --- HTTP mínimo -------------------------------------------------------------
def api(method, path, body=None, auth=True, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    req = request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if auth:
        req.add_header("Authorization", "Basic " + AUTH)
    if cookie:
        req.add_header("Cookie", "context-profile-id=" + cookie)
    try:
        with request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else None
    except error.HTTPError as e:
        print(f"  ! {method} {path} -> {e.code} {e.read().decode()[:120]}")
        return None

# --- Catálogo de dominio -----------------------------------------------------
INSTRUMENTS = [  # (producto, categoria, precio_min, precio_max)
    ("Guitarra Fender Stratocaster", "guitarras", 12000, 28000),
    ("Guitarra acústica Yamaha F310", "guitarras", 3500, 6000),
    ("Bajo Ibanez SR300", "bajos", 8000, 14000),
    ("Violín Stentor 4/4", "cuerdas", 4500, 9000),
    ("Saxofón alto Selmer", "vientos", 18000, 42000),
    ("Trompeta Bach TR300", "vientos", 9000, 16000),
    ("Teclado Casio CT-S300", "teclados", 4000, 7500),
    ("Piano digital Roland FP-30", "teclados", 22000, 35000),
    ("Batería acústica Pearl Export", "percusiones", 15000, 26000),
    ("Ukelele Kala concierto", "cuerdas", 1500, 3500),
    ("Amplificador Marshall MG30", "amplificacion", 6000, 11000),
    ("Cuerdas D'Addario (set)", "accesorios", 180, 450),
]
REPAIRS = [  # (servicio, instrumento, costo_min, costo_max)
    ("Ajuste y calibración", "guitarra", 400, 900),
    ("Cambio de cuerdas y limpieza", "guitarra", 250, 600),
    ("Reparación de electrónica", "bajo", 800, 2200),
    ("Ajuste de puente y alma", "violín", 700, 1800),
    ("Mantenimiento de zapatillas", "saxofón", 1500, 4000),
    ("Afinación y regulación", "piano", 1200, 3000),
    ("Cambio de parches", "batería", 600, 1500),
]
FIRST = ["Mariana", "José", "Diego", "Fernanda", "Luis", "Alejandra", "Carlos", "Regina",
         "Miguel", "Paola", "Andrés", "Valeria", "Roberto", "Ximena", "Emiliano", "Daniela"]
LAST = ["Guerra", "Treviño", "González", "Rodríguez", "Cavazos", "Martínez", "Salazar",
        "De la Garza", "Elizondo", "Ramírez", "Villarreal", "Leal", "Garza", "Tamez"]
CUSTOMER_TYPES = ["nuevo", "recurrente", "musico_pro", "escuela_musica"]

# Entornos: la tienda vende online y en el local físico de García, N.L.
ENVIRONMENTS = {
    "online": {"scope": "onlinestore", "source": {"itemId": "tallermike-web", "itemType": "site", "scope": "onlinestore"}},
    "fisico": {"scope": "tiendafisica", "source": {"itemId": "tallermike-garcia", "itemType": "site", "scope": "tiendafisica"}},
}
EVENT_TYPES = ["productView", "productSearch", "addToCart", "purchase", "repair", "contact"]

# --- Setup: scopes + esquemas permisivos -------------------------------------
def ensure_scopes():
    for sc in ("onlinestore", "tiendafisica"):
        api("POST", "/scopes", {"itemId": sc, "itemType": "scope",
            "metadata": {"id": sc, "name": sc, "scope": sc}})

def register_schemas():
    # Esquema permisivo por tipo: hereda el evento base y no restringe source/target/properties.
    for name in EVENT_TYPES:
        api("POST", "/jsonSchema", {
            "$id": f"https://unomi.apache.org/schemas/json/events/{name}/1-0-0",
            "$schema": "https://json-schema.org/draft/2019-09/schema",
            "self": {"vendor": "local.tallermike", "name": name, "target": "events",
                     "format": "jsonschema", "version": "1-0-0"},
            "title": name, "type": "object",
            "allOf": [{"$ref": "https://unomi.apache.org/schemas/json/event/1-0-0"}],
            "properties": {"source": {"type": "object"}, "target": {"type": "object"},
                           "properties": {"type": "object"}, "flattenedProperties": {"type": "object"}},
        })

# --- Generación de perfiles y eventos ----------------------------------------
def make_profile(pid):
    fn, ln = random.choice(FIRST), random.choice(LAST)
    props = {
        "firstName": fn, "lastName": ln,
        "email": f"{fn}.{ln}".lower().replace(" ", "").replace("í", "i").replace("é", "e").replace("á", "a") + f"{random.randint(1,99)}@example.mx",
        "phoneNumber": f"81{random.randint(1000,9999)}{random.randint(1000,9999)}",
        "city": "García", "stateProvince": "Nuevo León", "postalCode": f"6{random.randint(6000,6099)}",
        "countryCode": "MX", "nationality": "MX",
        "favoriteInstrument": random.choice(INSTRUMENTS)[1],
        "customerType": random.choice(CUSTOMER_TYPES),
        "preferredChannel": random.choice(["online", "fisico", "online", "fisico", "ambos"]),
    }
    api("POST", "/profiles", {"itemId": pid, "itemType": "profile", "properties": props})
    return props

def evt(etype, env, target_id, target_type, tprops=None):
    e = {"eventType": etype, "scope": env["scope"], "source": env["source"],
         "target": {"itemId": target_id, "itemType": target_type, "scope": env["scope"]}}
    if tprops:
        e["target"]["properties"] = {k: v for k, v in tprops.items() if k in ("category",)}
        e["properties"] = {k: v for k, v in tprops.items() if k != "category"}
    return e

def session_events(env_name):
    """Un flujo de eventos verosímil para una visita en un entorno dado."""
    env = ENVIRONMENTS[env_name]
    out = []
    if env_name == "online" and random.random() < 0.6:
        term = random.choice(INSTRUMENTS)[1]
        out.append(evt("productSearch", env, f"q-{term}", "searchQuery", {"query": term, "results": random.randint(2, 20)}))
    viewed = random.sample(INSTRUMENTS, k=random.randint(1, 4))
    for prod, cat, pmin, pmax in viewed:
        price = random.randint(pmin, pmax)
        out.append(evt("productView", env, prod, "product", {"product": prod, "category": cat, "price": price}))
    # Compra (online pasa por carrito; físico es directa)
    if random.random() < 0.45:
        prod, cat, pmin, pmax = random.choice(viewed)
        price = random.randint(pmin, pmax)
        if env_name == "online":
            out.append(evt("addToCart", env, prod, "product", {"product": prod, "category": cat, "price": price, "qty": 1}))
        out.append(evt("purchase", env, f"ord-{uuid.uuid4().hex[:8]}", "order",
                       {"product": prod, "category": cat, "amount": price, "qty": 1,
                        "paymentMethod": random.choice(["tarjeta", "efectivo", "transferencia"])}))
    # Servicio de reparación
    if random.random() < 0.35:
        svc, inst, cmin, cmax = random.choice(REPAIRS)
        out.append(evt("repair", env, f"rep-{uuid.uuid4().hex[:8]}", "service",
                       {"service": svc, "instrument": inst, "cost": random.randint(cmin, cmax),
                        "status": random.choice(["recibido", "en_proceso", "entregado"])}))
    # Contacto / cotización
    if random.random() < 0.2:
        out.append(evt("contact", env, "form-contacto", "form",
                       {"topic": random.choice(["cotizacion", "reparacion", "clases", "disponibilidad"])}))
    return out

def seed_data(n):
    print("Setup: scopes + esquemas de evento…")
    ensure_scopes()
    register_schemas()
    time.sleep(3)  # ponytail: dar tiempo a indexar los esquemas antes de emitir eventos (race verificada)
    print(f"Creando {n} clientes con sesiones online + físico…")
    total_ev = 0
    for i in range(n):
        pid = f"cliente-{i+1:03d}"
        make_profile(pid)
        for _ in range(random.randint(1, 4)):  # varias visitas por cliente
            env_name = random.choices(["online", "fisico"], weights=[6, 4])[0]
            sid = f"sess-{uuid.uuid4().hex}"
            events = session_events(env_name)
            r = api("POST", f"/context.json?sessionId={sid}",
                    {"source": ENVIRONMENTS[env_name]["source"], "events": events}, auth=False, cookie=pid)
            if r:
                total_ev += r.get("processedEvents", 0)
        if (i + 1) % 10 == 0:
            print(f"  … {i+1}/{n} clientes, {total_ev} eventos hasta ahora")
    print(f"Listo: {n} perfiles, {total_ev} eventos procesados (online + físico).")

# --- Definiciones: constructores de condición --------------------------------
def cond(t, **pv): return {"type": t, "parameterValues": pv}
def meta(i, name, desc=""): return {"id": i, "name": name, "description": desc, "scope": "systemscope", "enabled": True}
def prof(name, op, val): return cond("profilePropertyCondition", propertyName=f"properties.{name}", comparisonOperator=op, propertyValue=val)
def etype_cond(eid): return cond("eventTypeCondition", eventTypeId=eid)
def eprop(name, op, val): return cond("eventPropertyCondition", propertyName=name, comparisonOperator=op, propertyValue=val)
def AND(*subs): return cond("booleanCondition", operator="and", subConditions=list(subs))
def past(event_cond, days=120, min_count=1): return cond("pastEventCondition", numberOfDays=days, minimumEventCount=min_count, eventCondition=event_cond)

SEGMENTS = [
    ("clientes-garcia", "Clientes de García, N.L.", prof("city", "equals", "García")),
    ("musicos-profesionales", "Músicos profesionales", prof("customerType", "equals", "musico_pro")),
    ("escuelas-musica", "Escuelas de música", prof("customerType", "equals", "escuela_musica")),
    ("compradores-online", "Compradores en línea", past(AND(etype_cond("purchase"), eprop("scope", "equals", "onlinestore")))),
    ("clientes-tienda-fisica", "Clientes del local físico", past(eprop("scope", "equals", "tiendafisica"))),
    ("clientes-reparacion", "Clientes de reparación", past(etype_cond("repair"))),
    ("compradores-guitarras", "Compradores de guitarras", past(AND(etype_cond("purchase"), eprop("target.properties.category", "equals", "guitarras")))),
    ("clientes-frecuentes", "Clientes frecuentes (3+ compras)", past(etype_cond("purchase"), min_count=3)),
]
SCORING = ("engagement-cliente", "Engagement del cliente", [
    (prof("customerType", "equals", "musico_pro"), 15),
    (prof("city", "equals", "García"), 5),
    (past(etype_cond("purchase")), 20),
    (past(etype_cond("purchase"), min_count=3), 25),
    (past(etype_cond("repair")), 10),
    (past(etype_cond("addToCart")), 5),
])
GOALS = [
    ("conversion-compra", "Conversión: vista de producto → compra", etype_cond("productView"), etype_cond("purchase")),
    ("carrito-a-compra", "Carrito abandonado → compra", etype_cond("addToCart"), etype_cond("purchase")),
    ("explora-a-repara", "De explorar a solicitar reparación", etype_cond("productView"), etype_cond("repair")),
]
CAMPAIGNS = [
    ("regreso-a-clases", "Promo regreso a clases", "Campaña dirigida a clientes de García para el regreso a clases.",
     "2026-08-01T00:00:00Z", "2026-09-30T23:59:59Z", prof("city", "equals", "García")),
    ("temporada-navidena", "Temporada navideña", "Ofertas de fin de año para clientes recurrentes.",
     "2026-11-15T00:00:00Z", "2026-12-31T23:59:59Z", prof("customerType", "equals", "recurrente")),
]
LISTS = [
    ("newsletter-musical", "Newsletter musical"),
    ("interesados-clases", "Interesados en clases de música"),
    ("clientes-vip", "Clientes VIP"),
]

def seed_definitions():
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
    args = [a for a in sys.argv[1:] if a != "--no-defs"]
    n = int(args[0]) if args else 40
    seed_data(n)
    if "--no-defs" not in sys.argv:
        seed_definitions()
