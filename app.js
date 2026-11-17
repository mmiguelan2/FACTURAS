(() => {
  const C = window.APP_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const POR_PAGINA = 50;
  const STORAGE_KEY_WS = "beval_ws_enviados_v1";
  const STORAGE_KEY_TEMA = "beval_tema";

  // Cargar estado de envíos de WhatsApp del día
  const cargarWsEnviados = () => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY_WS);
      return guardado ? new Set(JSON.parse(guardado)) : new Set();
    } catch {
      return new Set();
    }
  };

  const guardarWsEnviados = (set) => {
    try {
      localStorage.setItem(STORAGE_KEY_WS, JSON.stringify([...set]));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage", e);
    }
  };

  const estado = {
    perfil: null,
    facturas: [],
    vendedores: new Map(),
    noEspeciales: new Set(),
    filtradas: [],
    orden: { campo: "dias_vencida", asc: false },
    pagina: 0,
    seleccionadas: new Set(),
    wsEnviados: cargarWsEnviados(),
    tema: localStorage.getItem(STORAGE_KEY_TEMA) || "dark",
  };

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ent = (n) => (Number(n) || 0).toLocaleString("es-VE");
  const fecha = (d) => (d ? d.split("-").reverse().join("/") : "");
  const esAdmin = () => estado.perfil?.rol === "admin";

  function aviso(txt) {
    const a = $("aviso");
    if (!a) return;
    a.textContent = txt;
    a.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { a.hidden = true; }, 2600);
  }

  // ---------- TEMA OSCURO / CLARO ----------
  function aplicarTema(t) {
    estado.tema = t;
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(STORAGE_KEY_TEMA, t);
    const lbl = $("tema-texto");
    if (lbl) lbl.textContent = t === "light" ? "Claro" : "Oscuro";
  }

  $("btn-tema")?.addEventListener("click", () => {
    const nuevoTema = estado.tema === "light" ? "dark" : "light";
    aplicarTema(nuevoTema);
    aviso(`Modo ${nuevoTema === "light" ? "Claro" : "Oscuro"} activado`);
  });

  // Inicializar tema guardado
  aplicarTema(estado.tema);

  // Definición de Columnas (SIN RIF, con cliente consolidado)
  const COLUMNAS = [
    { campo: "sel", titulo: "", ancho: "36px", noSort: true },
    { campo: "factura", titulo: "Factura", ancho: "85px" },
    { campo: "fecha_emision", titulo: "Emisión", ancho: "78px", fmt: fecha },
    { campo: "fecha_vence", titulo: "Vence", ancho: "78px", fmt: fecha },
    { campo: "dias_vencida", titulo: "Días V.", ancho: "68px", num: true, fmt: (v) => (v > 0 ? `<span class="vencida">${ent(v)}</span>` : ent(v)), html: true },
    { campo: "cliente_consolidado", titulo: "Cliente / Razón Social", ancho: "auto", noSort: true, html: true },
    { campo: "vendedor", titulo: "Vend.", ancho: "52px" },
    { campo: "zona", titulo: "Zona", ancho: "54px" },
    { campo: "monto_dolar", titulo: "Monto USD", ancho: "86px", num: true, fmt: usd },
    { campo: "saldo_usd", titulo: "Saldo USD", ancho: "86px", num: true, fmt: usd },
    { campo: "monto_estimado", titulo: "Estimado USD", ancho: "92px", num: true, fmt: usd },
  ];

  // ---------- sesión ----------
  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (data.session) await entrar(); else mostrarLogin();
    $("cargando").hidden = true;
  }

  function mostrarLogin() {
    $("vista-app").hidden = true;
    $("vista-login").hidden = false;
  }

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btn-entrar");
    btn.disabled = true;
    $("login-error").hidden = true;
    let usuario = $("login-correo").value.trim().toLowerCase();
    if (!usuario.includes("@")) usuario = `v${usuario}@${C.DOMINIO_VENDEDORES}`; // código -> correo interno
    const { error } = await sb.auth.signInWithPassword({ email: usuario, password: $("login-clave").value });
    btn.disabled = false;
    if (error) {
      $("login-error").textContent = "Usuario o contraseña incorrectos.";
      $("login-error").hidden = false;
      return;
    }
    $("login-clave").value = "";
    $("cargando").hidden = false;
    await entrar();
    $("cargando").hidden = true;
  });

  $("btn-salir").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });

  // ---------- BOTÓN REFRESCAR / SINCRONIZAR CON GIRO ----------
  $("btn-refrescar")?.addEventListener("click", async () => {
    const btn = $("btn-refrescar");
    const icono = btn?.querySelector(".icono-refrescar");
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    if (icono) icono.classList.add("girando");
    aviso("⏳ Sincronizando datos con la base de datos...");
    const inicioTiempo = Date.now();
    try {
      await cargarDatos();
      const demora = Math.max(0, 800 - (Date.now() - inicioTiempo));
      setTimeout(() => {
        if (icono) icono.classList.remove("girando");
        if (btn) btn.disabled = false;
        aviso("✅ Datos sincronizados correctamente");
      }, demora);
    } catch (err) {
      console.error("Error al refrescar datos:", err);
      if (icono) icono.classList.remove("girando");
      if (btn) btn.disabled = false;
      aviso("❌ Error al sincronizar: " + (err.message || "Verifique la conexión"));
    }
  });

  async function entrar() {
    const { data: u } = await sb.auth.getUser();
    const { data: perfil } = await sb.from("perfiles").select("*").eq("user_id", u.user.id).maybeSingle();
    if (!perfil) {
      await sb.auth.signOut();
      mostrarLogin();
      $("login-error").textContent = "Tu usuario no tiene acceso asignado. Contacta al administrador.";
      $("login-error").hidden = false;
      return;
    }
    estado.perfil = perfil;
    $("usuario-nombre").textContent = perfil.nombre || u.user.email;
    $("usuario-rol").textContent = perfil.rol;
    document.querySelectorAll(".solo-admin").forEach((el) => (el.hidden = !esAdmin()));
    await cargarDatos();
    $("vista-login").hidden = true;
    $("vista-app").hidden = false;
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
      todo("facturas"),
      todo("vendedores"),
      sb.from("cargas").select("fecha,facturas").order("fecha", { ascending: false }).limit(1),
    ]);

    estado.facturas = facturas.map((f) => {
      const montoDolar = Number(f.monto_dolar) || 0;
      const montoEst = Number(f.monto_estimado);
      // Cálculo preciso de retención del 75% sobre el 16% de IVA
      const estimado = (montoEst && !isNaN(montoEst) && montoEst > 0)
        ? montoEst
        : (montoDolar > 0 ? Math.round(montoDolar * (12.0 / 116.0) * 100) / 100 : 0);
      return { ...f, monto_estimado: estimado };
    });

    estado.vendedores = new Map(vendedores.map((v) => [v.codigo, v]));

    const c = carga.data?.[0];
    const fechaUltima = c ? new Date(c.fecha).toLocaleString("es-VE") : new Date().toLocaleString("es-VE");
    $("ultima-carga").textContent = `Actualizado ${fechaUltima}`;

    llenarSelect("f-vendedor", [...new Set(facturas.map((f) => f.vendedor))], (cod) => `${cod} · ${estado.vendedores.get(cod)?.nombre ?? "Sin registrar"}`);
    llenarSelect("f-zona", [...new Set(facturas.map((f) => f.zona))]);
    aplicarFiltros();
  }

  function llenarSelect(id, valores, etiqueta = (v) => v) {
    const sel = $(id);
    if (!sel) return;
    const primero = sel.options[0]?.outerHTML || '<option value="">Todos</option>';
    valores = valores.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    sel.innerHTML = primero + valores.map((v) => `<option value="${esc(v)}">${esc(etiqueta(v))}</option>`).join("");
  }

  // ---------- filtros ----------
  function filtrar(lista) {
    const v = $("f-vendedor").value, z = $("f-zona").value, e = $("f-estado").value;
    const q = $("f-buscar").value.trim().toLowerCase();
    const desde = parseFloat($("f-desde").value), hasta = parseFloat($("f-hasta").value);
    
    // Si el usuario logueado es asesor (no admin), solo ve sus facturas
    const vendedorFijo = !esAdmin() ? estado.perfil?.codigo_vendedor : null;

    return lista.filter((f) => {
      if (vendedorFijo && f.vendedor !== vendedorFijo) return false;
      if (v && f.vendedor !== v) return false;
      if (z && f.zona !== z) return false;
      if (e === "vencidas" && !(f.dias_vencida > 0)) return false;
      if (e === "sinvencer" && !(f.dias_vencida <= 0)) return false;
      if (!isNaN(desde) && f.monto_dolar < desde) return false;
      if (!isNaN(hasta) && f.monto_dolar > hasta) return false;
      if (q && ![f.razon_social, f.rif, f.codigo_cliente, f.factura].some((x) => (x || "").toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }

  function aplicarFiltros() {
    const { campo, asc } = estado.orden;
    estado.filtradas = filtrar(estado.facturas).sort((a, b) => {
      const x = a[campo], y = b[campo];
      const r = typeof x === "number" || typeof y === "number" ? (x ?? 0) - (y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true });
      return asc ? r : -r;
    });
    estado.pagina = 0;
    pintarHeroCard();
    pintarKpis(estado.filtradas);
    pintarFacturas();
    pintarVendedores();
  }

  ["f-vendedor", "f-zona", "f-estado"].forEach((id) => $(id)?.addEventListener("change", aplicarFiltros));
  ["f-buscar", "f-desde", "f-hasta"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(aplicarFiltros.t);
    aplicarFiltros.t = setTimeout(aplicarFiltros, 200);
  }));

  $("btn-limpiar")?.addEventListener("click", () => {
    document.querySelectorAll(".filtros input, .filtros select").forEach((el) => (el.value = ""));
    aplicarFiltros();
  });

  // ---------- TARJETA EJECUTIVA DEL VENDEDOR (VENDOR HERO) ----------
  function pintarHeroCard() {
    const hero = $("vendor-hero");
    if (!hero) return;

    let codVendedor = null;
    let nombreVendedor = "";
    let esGlobal = false;

    if (!esAdmin()) {
      codVendedor = estado.perfil?.codigo_vendedor;
      nombreVendedor = estado.perfil?.nombre || `Asesor ${codVendedor}`;
    } else {
      const selVend = $("f-vendedor")?.value;
      if (selVend) {
        codVendedor = selVend;
        nombreVendedor = estado.vendedores.get(selVend)?.nombre || `Asesor ${selVend}`;
      } else {
        esGlobal = true;
        nombreVendedor = "Centro de Mando Comercial · Global Beval";
      }
    }

    hero.hidden = false;

    const facturasHero = codVendedor
      ? estado.facturas.filter((f) => f.vendedor === codVendedor)
      : estado.filtradas;

    const totalFacturado = facturasHero.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const saldoPendiente = facturasHero.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
    const cobrado = Math.max(0, totalFacturado - saldoPendiente);
    const retencionEstimada = facturasHero.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
    const sinVencer = facturasHero.filter((f) => f.dias_vencida <= 0).reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);

    const avancePct = totalFacturado > 0 ? Math.min(100, Math.round((cobrado / totalFacturado) * 100)) : 0;
    const proyPct = totalFacturado > 0 ? Math.min(130, Math.round(((cobrado + (sinVencer * 0.75)) / totalFacturado) * 100)) : 0;

    $("vh-tag").textContent = esGlobal ? "Consolidado Ejecutivo Beval" : `Asesor Comercial Softland · Código ${codVendedor}`;
    $("vh-nombre").textContent = nombreVendedor;
    $("vh-sub").textContent = esGlobal
      ? `${ent(facturasHero.length)} facturas totales en seguimiento activo`
      : `Zona ${facturasHero[0]?.zona || "N/A"} · ${ent(facturasHero.length)} facturas asignadas`;

    $("vh-facturado").textContent = `$${usd(totalFacturado)}`;
    $("vh-cobrado").textContent = `$${usd(cobrado)}`;
    $("vh-saldo").textContent = `$${usd(saldoPendiente)}`;
    $("vh-retencion").textContent = `$${usd(retencionEstimada)}`;

    $("vh-avance-txt").textContent = `${avancePct}% (Proy. Cierre ${proyPct}%)`;
    const fillBar = $("vh-gauge-fill");
    if (fillBar) fillBar.style.width = `${Math.min(100, Math.max(0, avancePct))}%`;
  }

  // ---------- render kpis & facturas ----------
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
    $("k-facturas").textContent = ent(r.facturas);
    $("k-estimado").textContent = usd(r.estimado);
    $("k-vencidas").textContent = ent(r.vencidas);
    $("k-clientes").textContent = ent(r.clientes);
  }

  function filaHtml(f) {
    const isChecked = estado.seleccionadas.has(f.factura);
    const diasV = Number(f.dias_vencida) || 0;
    const badgeDias = diasV > 0
      ? `<span class="badge-dias vencido">${diasV >= 45 ? "45+ días" : `${diasV}d`}</span>`
      : `<span class="badge-dias al-dia">Al día</span>`;

    const clienteHtml = `
      <div class="cliente-consolidado" title="${esc(f.razon_social)} · ${esc(f.codigo_cliente)}">
        <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
        <span class="cliente-codigo">${esc(f.codigo_cliente || "")}</span>
        ${badgeDias}
      </div>`;

    return `<tr data-fac="${esc(f.factura)}">
      <td style="width: 36px; text-align: center;">
        <input type="checkbox" class="chk-factura" data-factura="${esc(f.factura)}" ${isChecked ? "checked" : ""}>
      </td>
      <td style="width: 85px; font-weight: 700;">${esc(f.factura)}</td>
      <td style="width: 78px;">${fecha(f.fecha_emision)}</td>
      <td style="width: 78px;">${fecha(f.fecha_vence)}</td>
      <td class="num" style="width: 68px;">${diasV > 0 ? `<span class="vencida">${ent(diasV)}</span>` : ent(diasV)}</td>
      <td style="width: auto;">${clienteHtml}</td>
      <td style="width: 52px; text-align: center;">${esc(f.vendedor)}</td>
      <td style="width: 54px; text-align: center;">${esc(f.zona)}</td>
      <td class="num" style="width: 86px;">${usd(f.monto_dolar)}</td>
      <td class="num" style="width: 86px;">${usd(f.saldo_usd)}</td>
      <td class="num" style="width: 92px; font-weight: 700; color: var(--beval-lime);">${usd(f.monto_estimado)}</td>
    </tr>`;
  }

  function encabezado(tabla) {
    const { campo, asc } = estado.orden;
    const thead = $(tabla)?.querySelector("thead");
    if (!thead) return;

    thead.innerHTML = "<tr>" + COLUMNAS.map((c) => {
      if (c.campo === "sel") {
        return `<th style="width: ${c.ancho}; text-align: center;">
          <input type="checkbox" id="th-check-todos" title="Seleccionar todas las visibles">
        </th>`;
      }
      const flecha = c.campo === campo ? (asc ? " ▲" : " ▼") : "";
      return `<th data-campo="${c.campo}" class="${c.num ? "num" : ""}" style="width: ${c.ancho};">${c.titulo}${flecha}</th>`;
    }).join("") + "</tr>";

    // Manejador del checkbox del header
    thead.querySelector("#th-check-todos")?.addEventListener("change", (e) => {
      const marcar = e.target.checked;
      const ini = estado.pagina * POR_PAGINA;
      const paginaFacturas = estado.filtradas.slice(ini, ini + POR_PAGINA);
      paginaFacturas.forEach((f) => {
        if (marcar) estado.seleccionadas.add(f.factura);
        else estado.seleccionadas.delete(f.factura);
      });
      pintarFacturas();
      actualizarContadorSeleccionados();
    });
  }

  function pintarFacturas() {
    const total = estado.filtradas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const ini = estado.pagina * POR_PAGINA;
    encabezado("tabla-facturas");

    const paginaFacturas = estado.filtradas.slice(ini, ini + POR_PAGINA);
    const tbody = $("tabla-facturas").querySelector("tbody");

    tbody.innerHTML = paginaFacturas.map(filaHtml).join("") ||
      `<tr><td colspan="${COLUMNAS.length}" style="text-align: center; padding: 24px;">No hay facturas con estos filtros.</td></tr>`;

    // Sincronizar checkbox maestro
    const thCheck = $("th-check-todos");
    if (thCheck && paginaFacturas.length > 0) {
      thCheck.checked = paginaFacturas.every((f) => estado.seleccionadas.has(f.factura));
    }

    $("conteo").textContent = `${ent(total)} facturas`;
    $("pag-info").textContent = `Página ${estado.pagina + 1} de ${paginas}`;
    $("pag-ant").disabled = estado.pagina === 0;
    $("pag-sig").disabled = estado.pagina >= paginas - 1;
    actualizarContadorSeleccionados();
  }

  // Delegación de clic en checkboxes individuales
  $("tabla-facturas")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("chk-factura")) {
      const fac = e.target.dataset.factura;
      if (e.target.checked) estado.seleccionadas.add(fac);
      else estado.seleccionadas.delete(fac);
      actualizarContadorSeleccionados();
    }
  });

  function actualizarContadorSeleccionados() {
    const n = estado.seleccionadas.size;
    const cEl = $("masivo-clientes-conteo");
    if (cEl) cEl.textContent = `${ent(n)} facturas seleccionadas`;
  }

  $("pag-ant")?.addEventListener("click", () => { estado.pagina--; pintarFacturas(); });
  $("pag-sig")?.addEventListener("click", () => { estado.pagina++; pintarFacturas(); });

  document.addEventListener("click", (e) => {
    const th = e.target.closest("#tabla-facturas th[data-campo]");
    if (!th) return;
    const campo = th.dataset.campo;
    const colDef = COLUMNAS.find((c) => c.campo === campo);
    if (colDef?.noSort) return;
    estado.orden = { campo, asc: estado.orden.campo === campo ? !estado.orden.asc : true };
    aplicarFiltros();
  });

  // ---------- TABLA VENDEDORES (CON STATUS WS & AVANCE BAR) ----------
  function grupos(lista) {
    const m = new Map();
    lista.forEach((f) => {
      if (!m.has(f.vendedor)) m.set(f.vendedor, []);
      m.get(f.vendedor).push(f);
    });
    return [...m.entries()].map(([cod, fs]) => {
      const totalFact = fs.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
      const saldoPend = fs.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
      const cobrado = Math.max(0, totalFact - saldoPend);
      const avancePct = totalFact > 0 ? Math.min(100, Math.round((cobrado / totalFact) * 100)) : 0;
      return { cod, fs, r: resumen(fs), avancePct, zona: fs[0]?.zona || "" };
    }).sort((a, b) => b.r.estimado - a.r.estimado);
  }

  function pintarVendedores() {
    if (!esAdmin()) return;
    const listaGrupos = grupos(estado.filtradas);
    const tbody = $("tabla-vendedores")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = listaGrupos.map(({ cod, fs, r, avancePct, zona }) => {
      const v = estado.vendedores.get(cod) || {};
      const yaEnviado = estado.wsEnviados.has(cod);
      const statusBadge = yaEnviado
        ? `<span class="badge-ws enviado">✅ Enviado</span>`
        : `<span class="badge-ws espera">⏳ En espera</span>`;

      // Color de barra de avance según porcentaje (rojo, ámbar, verde)
      const colorAvance = avancePct >= 50 ? "#22c55e" : avancePct >= 25 ? "#f59e0b" : "#ef4444";

      const avanceHtml = `
        <div class="avance-cell">
          <div class="avance-mini-gauge">
            <div class="avance-mini-fill" style="width: ${avancePct}%; background: ${colorAvance};"></div>
            <div class="avance-mini-target"></div>
          </div>
          <span class="avance-mini-txt" style="color: ${colorAvance};">${avancePct}%</span>
        </div>`;

      const nombreLimpio = v.nombre || `Asesor ${cod}`;
      const celdaVendedor = `
        <div style="display: flex; flex-direction: column;">
          <strong style="color: var(--texto);">${esc(nombreLimpio)}</strong>
          <small style="color: var(--suave); font-size: 11px;">Código: ${esc(cod)} ${v.telefono ? `· 📱 ${esc(v.telefono)}` : ""}</small>
        </div>`;

      return `<tr>
        <td style="font-weight: 700; color: var(--suave);">${esc(zona || cod)}</td>
        <td>${celdaVendedor}</td>
        <td class="num">${ent(r.facturas)}</td>
        <td class="num">${r.vencidas > 0 ? `<span class="vencida">${ent(r.vencidas)}</span>` : "0"}</td>
        <td class="num" style="color: var(--beval-lime); font-weight: 700;">$${usd(r.estimado)}</td>
        <td>${avanceHtml}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center;">
          <button class="btn btn-wa-individual" data-wa="${esc(cod)}" ${v.telefono ? "" : "disabled"} title="${v.telefono ? "Enviar listado por WhatsApp" : "Sin teléfono registrado"}">
            💬 WhatsApp
          </button>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" style="text-align: center; padding: 24px;">No hay asesores disponibles.</td></tr>`;

    $("vendedores-conteo").textContent = `${ent(listaGrupos.length)} asesores comerciales`;
    actualizarModalMasivo();
  }

  // Reiniciar estados WhatsApp
  $("btn-reset-ws")?.addEventListener("click", () => {
    estado.wsEnviados.clear();
    guardarWsEnviados(estado.wsEnviados);
    pintarVendedores();
    aviso("🔄 Estados de WhatsApp reiniciados para hoy");
  });

  // ---------- MENSAJES & WHATSAPP ----------
  function mensaje(cod, lista) {
    const v = estado.vendedores.get(cod);
    const r = resumen(lista);
    const detalle = lista.slice(0, 40).map((f) =>
      `• Fact. ${f.factura} | ${f.razon_social} | Estimado: $${usd(f.monto_estimado)} USD${f.dias_vencida > 0 ? ` (${f.dias_vencida} días vencida)` : ""}`
    ).join("\n");
    const masTexto = lista.length > 40 ? `\n... y ${lista.length - 40} facturas más.` : "";

    return (C.MENSAJE || "Estimado(a) {VENDEDOR}, recordatorio de retención de IVA:\nFacturas: {FACTURAS}\nEstimado USD: ${ESTIMADO}\n\nDetalle:\n{DETALLE}")
      .replace("{VENDEDOR}", v?.nombre || cod || "equipo")
      .replace("{FACTURAS}", r.facturas)
      .replace("{ESTIMADO}", usd(r.estimado))
      .replace("{DETALLE}", detalle + masTexto);
  }

  function marcarWsEnviado(cod) {
    estado.wsEnviados.add(cod);
    guardarWsEnviados(estado.wsEnviados);
    pintarVendedores();
  }

  // Clic en WhatsApp individual de la tabla vendedores
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wa]");
    if (!b) return;
    const cod = b.dataset.wa;
    const v = estado.vendedores.get(cod);
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (!tel) {
      aviso("⚠️ El asesor no tiene teléfono registrado");
      return;
    }
    if (tel.startsWith("0")) tel = "58" + tel.slice(1);
    const lista = estado.facturas.filter((f) => f.vendedor === cod);
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(cod, lista))}`;
    window.open(url, "_blank", "noopener");
    marcarWsEnviado(cod);
    aviso(`✅ WhatsApp preparado para ${v.nombre || cod}`);
  });

  // Copiar mensaje en barra de acciones
  $("btn-mensaje")?.addEventListener("click", async () => {
    const cod = $("f-vendedor")?.value || (esAdmin() ? "" : estado.perfil?.codigo_vendedor);
    await navigator.clipboard.writeText(mensaje(cod, estado.filtradas));
    aviso("📋 Mensaje copiado al portapapeles");
  });

  // ---------- MENSAJERÍA MASIVA ----------
  const modalMasivo = $("modal-masivo");

  function abrirModalMasivo(tabInicial = "vendedores") {
    if (!modalMasivo) return;
    modalMasivo.hidden = false;
    activarTabModal(tabInicial);
    actualizarModalMasivo();
  }

  function cerrarModalMasivo() {
    if (modalMasivo) modalMasivo.hidden = true;
  }

  $("btn-abrir-masivo")?.addEventListener("click", () => abrirModalMasivo("vendedores"));
  $("btn-masivo-vendedores")?.addEventListener("click", () => abrirModalMasivo("vendedores"));
  $("btn-cerrar-modal")?.addEventListener("click", cerrarModalMasivo);

  modalMasivo?.addEventListener("click", (e) => {
    if (e.target === modalMasivo) cerrarModalMasivo();
  });

  function activarTabModal(tab) {
    const btnV = $("mtab-vendedores"), btnC = $("mtab-clientes");
    const pnlV = $("mpanel-vendedores"), pnlC = $("mpanel-clientes");
    if (btnV) btnV.classList.toggle("activa", tab === "vendedores");
    if (btnC) btnC.classList.toggle("activa", tab === "clientes");
    if (pnlV) pnlV.hidden = tab !== "vendedores";
    if (pnlC) pnlC.hidden = tab !== "clientes";
  }

  $("mtab-vendedores")?.addEventListener("click", () => activarTabModal("vendedores"));
  $("mtab-clientes")?.addEventListener("click", () => activarTabModal("clientes"));

  function actualizarModalMasivo() {
    const listaGrupos = grupos(estado.facturas);
    const total = listaGrupos.length;
    const enviados = listaGrupos.filter((g) => estado.wsEnviados.has(g.cod)).length;
    const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;

    const progTxt = $("masivo-progreso-txt");
    const progBar = $("masivo-progreso-bar");
    if (progTxt) progTxt.textContent = `${enviados} de ${total} asesores (${pct}%)`;
    if (progBar) progBar.style.width = `${pct}%`;

    // Buscar el próximo asesor pendiente
    const proximo = listaGrupos.find((g) => !estado.wsEnviados.has(g.cod));
    const btnSiguiente = $("btn-enviar-siguiente");

    if (proximo) {
      const v = estado.vendedores.get(proximo.cod) || {};
      $("masivo-proximo-nombre").textContent = v.nombre || `Asesor ${proximo.cod}`;
      $("masivo-proximo-detalles").textContent = `Zona ${proximo.zona || "—"} · ${ent(proximo.r.facturas)} facturas · $${usd(proximo.r.estimado)} USD ${v.telefono ? `· 📱 ${v.telefono}` : "⚠️ Sin teléfono"}`;
      if (btnSiguiente) {
        btnSiguiente.disabled = !v.telefono;
        btnSiguiente.dataset.codProximo = proximo.cod;
      }
    } else {
      $("masivo-proximo-nombre").textContent = "🎉 ¡Todos los asesores han sido contactados hoy!";
      $("masivo-proximo-detalles").textContent = "Puedes reiniciar los estados en cualquier momento si deseas enviar nuevamente.";
      if (btnSiguiente) {
        btnSiguiente.disabled = true;
        delete btnSiguiente.dataset.codProximo;
      }
    }
    actualizarContadorSeleccionados();
  }

  // Acción Enviar Siguiente Asesor
  $("btn-enviar-siguiente")?.addEventListener("click", () => {
    const cod = $("btn-enviar-siguiente")?.dataset.codProximo;
    if (!cod) return;
    const v = estado.vendedores.get(cod);
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (!tel) {
      aviso("⚠️ El asesor no tiene teléfono registrado");
      return;
    }
    if (tel.startsWith("0")) tel = "58" + tel.slice(1);
    const lista = estado.facturas.filter((f) => f.vendedor === cod);
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(cod, lista))}`;
    window.open(url, "_blank", "noopener");
    marcarWsEnviado(cod);
    aviso(`✅ WhatsApp abierto para ${v.nombre || cod}`);
    actualizarModalMasivo();
  });

  // Copiar todos los mensajes de asesores
  $("btn-copiar-todos-ws")?.addEventListener("click", async () => {
    const listaGrupos = grupos(estado.facturas);
    const separador = "\n" + "=".repeat(45) + "\n\n";
    const textoCompleto = listaGrupos.map(({ cod, fs }) => mensaje(cod, fs)).join(separador);
    await navigator.clipboard.writeText(textoCompleto);
    aviso("📋 Se han copiado todos los mensajes al portapapeles");
  });

  // Copiar recordatorios de clientes seleccionados
  $("btn-copiar-clientes-sel")?.addEventListener("click", async () => {
    if (estado.seleccionadas.size === 0) {
      aviso("⚠️ Primero marca al menos una factura en la tabla");
      return;
    }
    const listaSel = estado.facturas.filter((f) => estado.seleccionadas.has(f.factura));
    const lineas = listaSel.map((f) => `• Factura: ${f.factura} | Cliente: ${f.razon_social} | Estimado Ret. 75%: $${usd(f.monto_estimado)} USD | Vence: ${fecha(f.fecha_vence)}`);
    const texto = `*RECORDATORIO DE FACTURAS PENDIENTES DE RETENCIÓN DE IVA*\n\n` + lineas.join("\n") + `\n\nTotal estimado: $${usd(listaSel.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0))} USD`;
    await navigator.clipboard.writeText(texto);
    aviso(`📋 Mensaje copiado con ${listaSel.length} facturas`);
  });

  // ---------- CSV EXPORT ----------
  $("btn-csv")?.addEventListener("click", () => {
    const cab = COLUMNAS.filter((c) => c.campo !== "sel").map((c) => c.titulo);
    const campos = COLUMNAS.filter((c) => c.campo !== "sel").map((c) => c.campo);
    const filas = estado.filtradas.map((f) => campos.map((campo) => {
      let val = f[campo];
      if (campo === "cliente_consolidado") val = `${f.razon_social || ""} (${f.codigo_cliente || ""})`;
      return `"${String(val ?? "").replace(/"/g, '""')}"`;
    }).join(";"));

    const blob = new Blob(["\uFEFF" + [cab.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `facturas_sin_retencion_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  // ---------- PESTAÑAS ----------
  $("pestanas")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    document.querySelectorAll("#pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + b.dataset.tab));
  });

  iniciar().catch((err) => {
    $("cargando").textContent = "Error: " + err.message;
  });
})();
