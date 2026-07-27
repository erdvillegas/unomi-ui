#!/usr/bin/env python3
"""Puebla Apache Unomi con datos ficticios de "Taller de Mike" — tienda de
instrumentos musicales y servicios de reparación en García, Nuevo León.

Eventos desde ambos entornos: tienda en línea (scope=onlinestore) y local
físico (scope=tiendafisica). Sólo stdlib (urllib), sin dependencias.

Uso:  python3 scripts/seed_tallermike.py [num_clientes]   # default 40
Requiere Unomi en localhost:8181 (karaf/karaf) — ver CLAUDE.md.

Cómo funciona (verificado contra Unomi 3.0):
- Los eventos del endpoint público /context.json se validan contra JSON-Schema
  y el `scope` debe existir (validateScope). Por eso el script:
  1) registra los scopes onlinestore/tiendafisica,
  2) registra un esquema permisivo por cada tipo de evento de dominio,
  3) crea perfiles ricos vía admin POST /profiles,
  4) adjunta eventos a cada perfil vía /context.json con la cookie
     context-profile-id (así los eventos quedan ligados al perfil creado).
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

def seed(n):
    print(f"Setup: scopes + esquemas de evento…")
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

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    seed(n)
