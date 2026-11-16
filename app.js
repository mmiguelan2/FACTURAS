(() => {
  const C = window.APP_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const POR_PAGINA = 50;

  const estado = {
    perfil: null, facturas: [], vendedores: new Map(), noEspeciales: new Set(),
    filtradas: [], orden: { campo: "dias_vencida", asc: false }, pagina: 0,
  };

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ent = (n) => (Number(n) || 0).toLocaleString("es-VE");
  const fecha = (d) => (d ? d.split("-").reverse().join("/") : "");
  const esAdmin = () => estado.perfil?.rol === "admin";
  function aviso(txt) { const a = $("aviso"); a.textContent = txt; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 2500); }

  const COLUMNAS = [
    { campo: "factura", titulo: "Factura" },
    { campo: "fecha_emision", titulo: "Emisión", fmt: fecha },
    { campo: "fecha_vence", titulo: "Vence", fmt: fecha },
    { campo: "dias_vencida", titulo: "Días venc.", num: true, fmt: (v) => (v > 0 ? `<span class="vencida">${ent(v)}</span>` : ent(v)), html: true },
    { campo: "codigo_cliente", titulo: "Cliente" },
    { campo: "razon_social", titulo: "Razón social" },
    { campo: "rif", titulo: "RIF" },
    { campo: "vendedor", titulo: "Vend." },
    { campo: "zona", titulo: "Zona" },
    { campo: "monto_dolar", titulo: "Monto USD", num: true, fmt: usd },
    { campo: "saldo_usd", titulo: "Saldo USD", num: true, fmt: usd },
    { campo: "monto_estimado", titulo: "Estimado USD", num: true, fmt: usd },
  ];

  // ---------- sesión ----------
  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (data.session) await entrar(); else mostrarLogin();
    $("cargando").hidden = true;
  }

  function mostrarLogin() { $("vista-app").hidden = true; $("vista-login").hidden = false; }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btn-entrar"); btn.disabled = true; $("login-error").hidden = true;
    let usuario = $("login-correo").value.trim().toLowerCase();
    if (!usuario.includes("@")) usuario = `v${usuario}@${C.DOMINIO_VENDEDORES}`; // código -> correo interno
    const { error } = await sb.auth.signInWithPassword({ email: usuario, password: $("login-clave").value });
    btn.disabled = false;
    if (error) { $("login-error").textContent = "Usuario o contraseña incorrectos."; $("login-error").hidden = false; return; }
    $("login-clave").value = "";
    $("cargando").hidden = false; await entrar(); $("cargando").hidden = true;
  });

  $("btn-salir").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });

  async function entrar() {
    const { data: u } = await sb.auth.getUser();
    const { data: perfil } = await sb.from("perfiles").select("*").eq("user_id", u.user.id).maybeSingle();
    if (!perfil) {
      await sb.auth.signOut(); mostrarLogin();
      $("login-error").textContent = "Tu usuario no tiene acceso asignado. Contacta al administrador.";
      $("login-error").hidden = false; return;
    }
    estado.perfil = perfil;
    $("usuario-nombre").textContent = perfil.nombre || u.user.email;
    $("usuario-rol").textContent = perfil.rol;
    document.querySelectorAll(".solo-admin").forEach((el) => (el.hidden = !esAdmin()));
    await cargarDatos();
    $("vista-login").hidden = true; $("vista-app").hidden = false;
  }

  // ---------- datos ----------
  async function todo(tabla, select = "*") {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from(tabla).select(select).range(desde, desde + 999);
      if (error) throw error;
      filas.push(...data);
      if (data.length < 1000) return filas;
    }
  }

  async function cargarDatos() {
    const [facturas, vendedores, carga] = await Promise.all([
      todo("facturas"), todo("vendedores"),
      sb.from("cargas").select("fecha,facturas").order("fecha", { ascending: false }).limit(1),
    ]);
    estado.facturas = facturas;
    estado.vendedores = new Map(vendedores.map((v) => [v.codigo, v]));
    if (esAdmin()) estado.noEspeciales = new Set((await todo("clientes_no_especiales", "codigo_cliente")).map((c) => c.codigo_cliente));

    const c = carga.data?.[0];
    $("ultima-carga").textContent = c ? `Actualizado ${new Date(c.fecha).toLocaleString("es-VE")}` : "Sin cargas todavía";

    llenarSelect("f-vendedor", [...new Set(facturas.map((f) => f.vendedor))], (cod) => `${cod} · ${estado.vendedores.get(cod)?.nombre ?? "Sin registrar"}`);
    llenarSelect("f-zona", [...new Set(facturas.map((f) => f.zona))]);
    aplicarFiltros();
  }

  function llenarSelect(id, valores, etiqueta = (v) => v) {
    const sel = $(id); const primero = sel.options[0].outerHTML;
    valores = valores.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    sel.innerHTML = primero + valores.map((v) => `<option value="${esc(v)}">${esc(etiqueta(v))}</option>`).join("");
  }

  // ---------- filtros ----------
  function filtrar(lista) {
    const v = $("f-vendedor").value, z = $("f-zona").value, e = $("f-estado").value;
    const q = $("f-buscar").value.trim().toLowerCase();
    const desde = parseFloat($("f-desde").value), hasta = parseFloat($("f-hasta").value);
    return lista.filter((f) =>
      (!v || f.vendedor === v) && (!z || f.zona === z) &&
      (!e || (e === "vencidas" ? f.dias_vencida > 0 : f.dias_vencida <= 0)) &&
      (isNaN(desde) || f.monto_dolar >= desde) && (isNaN(hasta) || f.monto_dolar <= hasta) &&
      (!q || [f.razon_social, f.rif, f.codigo_cliente, f.factura].some((x) => (x || "").toLowerCase().includes(q))));
  }

  function aplicarFiltros() {
    const { campo, asc } = estado.orden;
    estado.filtradas = filtrar(estado.facturas).sort((a, b) => {
      const x = a[campo], y = b[campo];
      const r = typeof x === "number" || typeof y === "number" ? (x ?? 0) - (y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true });
      return asc ? r : -r;
    });
    estado.pagina = 0;
    pintarKpis(estado.filtradas); pintarFacturas(); pintarVendedores(); pintarNoRetienen();
  }

  ["f-vendedor", "f-zona", "f-estado"].forEach((id) => $(id).addEventListener("change", aplicarFiltros));
  ["f-buscar", "f-desde", "f-hasta"].forEach((id) => $(id).addEventListener("input", () => { clearTimeout(aplicarFiltros.t); aplicarFiltros.t = setTimeout(aplicarFiltros, 200); }));
  $("btn-limpiar").addEventListener("click", () => { document.querySelectorAll(".filtros input, .filtros select").forEach((el) => (el.value = "")); aplicarFiltros(); });

  // ---------- render ----------
  function resumen(lista) {
    return {
      facturas: lista.length,
      estimado: lista.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0),
      vencidas: lista.filter((f) => f.dias_vencida > 0).length,
      clientes: new Set(lista.map((f) => f.codigo_cliente)).size,
    };
  }

  function pintarKpis(lista) {
    const r = resumen(lista);
    $("k-facturas").textContent = ent(r.facturas); $("k-estimado").textContent = usd(r.estimado);
    $("k-vencidas").textContent = ent(r.vencidas); $("k-clientes").textContent = ent(r.clientes);
  }

  function filaHtml(f) {
    return "<tr>" + COLUMNAS.map((c) => {
      const v = f[c.campo]; const t = c.fmt ? c.fmt(v) : v;
      return `<td class="${c.num ? "num" : ""}">${c.html ? t : esc(t)}</td>`;
    }).join("") + "</tr>";
  }

  function encabezado(tabla) {
    const { campo, asc } = estado.orden;
    $(tabla).querySelector("thead").innerHTML = "<tr>" + COLUMNAS.map((c) =>
      `<th data-campo="${c.campo}" class="${c.num ? "num" : ""}">${c.titulo}${c.campo === campo ? (asc ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";
  }

  function pintarFacturas() {
    const total = estado.filtradas.length, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const ini = estado.pagina * POR_PAGINA;
    encabezado("tabla-facturas");
    $("tabla-facturas").querySelector("tbody").innerHTML =
      estado.filtradas.slice(ini, ini + POR_PAGINA).map(filaHtml).join("") ||
      `<tr><td colspan="${COLUMNAS.length}">No hay facturas con estos filtros.</td></tr>`;
    $("conteo").textContent = `${ent(total)} facturas`;
    $("pag-info").textContent = `Página ${estado.pagina + 1} de ${paginas}`;
    $("pag-ant").disabled = estado.pagina === 0; $("pag-sig").disabled = estado.pagina >= paginas - 1;
  }

  $("pag-ant").addEventListener("click", () => { estado.pagina--; pintarFacturas(); });
  $("pag-sig").addEventListener("click", () => { estado.pagina++; pintarFacturas(); });
  document.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-campo]"); if (!th) return;
    const campo = th.dataset.campo;
    estado.orden = { campo, asc: estado.orden.campo === campo ? !estado.orden.asc : true };
    aplicarFiltros();
  });

  function grupos(lista) {
    const m = new Map();
    lista.forEach((f) => { if (!m.has(f.vendedor)) m.set(f.vendedor, []); m.get(f.vendedor).push(f); });
    return [...m.entries()].map(([cod, fs]) => ({ cod, fs, r: resumen(fs) })).sort((a, b) => b.r.estimado - a.r.estimado);
  }

  function pintarVendedores() {
    if (!esAdmin()) return;
    $("tabla-vendedores").querySelector("tbody").innerHTML = grupos(estado.filtradas).map(({ cod, r }) => {
      const v = estado.vendedores.get(cod) || {};
      return `<tr><td>${esc(cod)}</td><td>${esc(v.nombre || "Sin registrar")}</td><td>${esc(v.telefono || "")}</td>
        <td class="num">${ent(r.facturas)}</td><td class="num">${ent(r.vencidas)}</td><td class="num">${usd(r.estimado)}</td>
        <td><button class="btn" data-wa="${esc(cod)}" ${v.telefono ? "" : "disabled"}>WhatsApp</button></td></tr>`;
    }).join("");
  }

  function pintarNoRetienen() {
    if (!esAdmin()) return;
    const lista = estado.filtradas.filter((f) => estado.noEspeciales.has(f.codigo_cliente));
    encabezado("tabla-noretienen");
    $("tabla-noretienen").querySelector("tbody").innerHTML = lista.map(filaHtml).join("") ||
      `<tr><td colspan="${COLUMNAS.length}">No hay facturas de clientes reclasificados.</td></tr>`;
  }

  // ---------- mensaje / WhatsApp ----------
  function mensaje(cod, lista) {
    const v = estado.vendedores.get(cod);
    const r = resumen(lista);
    const detalle = lista.map((f) => `• ${f.factura} · ${f.razon_social} · ${usd(f.monto_estimado)} USD${f.dias_vencida > 0 ? ` (${f.dias_vencida} días vencida)` : ""}`).join("\n");
    return C.MENSAJE.replace("{VENDEDOR}", v?.nombre || cod || "equipo")
      .replace("{FACTURAS}", r.facturas).replace("{ESTIMADO}", usd(r.estimado)).replace("{DETALLE}", detalle);
  }

  $("btn-mensaje").addEventListener("click", async () => {
    const cod = $("f-vendedor").value || (esAdmin() ? "" : estado.perfil.codigo_vendedor);
    await navigator.clipboard.writeText(mensaje(cod, estado.filtradas));
    aviso("Mensaje copiado");
  });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wa]"); if (!b) return;
    const cod = b.dataset.wa, v = estado.vendedores.get(cod);
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (tel.startsWith("0")) tel = "58" + tel.slice(1);
    const lista = estado.filtradas.filter((f) => f.vendedor === cod);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje(cod, lista))}`, "_blank", "noopener");
  });

  // ---------- CSV ----------
  $("btn-csv").addEventListener("click", () => {
    const cab = COLUMNAS.map((c) => c.titulo);
    const filas = estado.filtradas.map((f) => COLUMNAS.map((c) => `"${String(f[c.campo] ?? "").replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["﻿" + [cab.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `facturas_sin_retencion_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  });

  // ---------- pestañas ----------
  $("pestanas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]"); if (!b) return;
    document.querySelectorAll("#pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + b.dataset.tab));
  });

  iniciar().catch((err) => { $("cargando").textContent = "Error: " + err.message; });
})();
