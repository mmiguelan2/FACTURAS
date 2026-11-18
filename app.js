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
    
    // Tab Sin Retención
    filtradas: [],
    orden: { campo: "dias_vencida", asc: false },
    pagina: 0,
    seleccionadas: new Set(),

    // Tab Pendiente por Procesar
    filtradasProc: [],
    ordenProc: { campo: "dias_vencida", asc: false },
    paginaProc: 0,
    seleccionadasProc: new Set(),

    tabActiva: "facturas",
    wsEnviados: cargarWsEnviados(),
    tema: "light", // Siempre abre en Modo Claro por defecto
    vistaCartera: "completa",
    filtroSemaforo: "todos",
  };

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ent = (n) => (Number(n) || 0).toLocaleString("es-VE");
  const fecha = (d) => {
    if (!d) return "";
    const partes = String(d).trim().split("-");
    if (partes.length === 3 && partes[0].length === 4) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return String(d).replace(/-/g, "/");
  };
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
  // Por requerimiento expreso, la aplicación siempre debe inicializar en Modo Claro
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

  // Forzar siempre modo claro al abrir la página
  aplicarTema("light");

  // Definición de Columnas para Sin Retención
  const COLUMNAS = [
    { campo: "sel", titulo: "", ancho: "34px", noSort: true },
    { campo: "factura", titulo: "Factura", ancho: "85px" },
    { campo: "fecha_emision", titulo: "Emisión", ancho: "94px", fmt: fecha },
    { campo: "fecha_vence", titulo: "Vence", ancho: "94px", fmt: fecha },
    { campo: "dias_vencida", titulo: "Días V.", ancho: "62px", num: true, fmt: (v) => (v > 0 ? `<span class="vencida">${ent(v)}</span>` : ent(v)), html: true },
    { campo: "cliente_consolidado", titulo: "Cliente / Razón Social", ancho: "auto", noSort: true, html: true },
    { campo: "analista", titulo: "Analista", ancho: "125px" },
    { campo: "vendedor", titulo: "Vend.", ancho: "115px" },
    { campo: "zona", titulo: "Zona", ancho: "50px" },
    { campo: "monto_dolar", titulo: "Monto USD", ancho: "86px", num: true, fmt: usd },
    { campo: "saldo_usd", titulo: "Saldo USD", ancho: "86px", num: true, fmt: usd },
    { campo: "monto_estimado", titulo: "Estimado USD", ancho: "92px", num: true, fmt: usd },
  ];

  // Definición de Columnas para Pendiente por Procesar
  const COLUMNAS_POR_PROCESAR = [
    { campo: "sel", titulo: "", ancho: "34px", noSort: true },
    { campo: "factura", titulo: "Factura", ancho: "85px" },
    { campo: "fecha_emision", titulo: "Emisión", ancho: "94px", fmt: fecha },
    { campo: "fecha_vence", titulo: "Vence", ancho: "94px", fmt: fecha },
    { campo: "dias_vencida", titulo: "Días V.", ancho: "62px", num: true, fmt: (v) => (v > 0 ? `<span class="vencida">${ent(v)}</span>` : ent(v)), html: true },
    { campo: "cliente_consolidado", titulo: "Cliente / Razón Social", ancho: "auto", noSort: true, html: true },
    { campo: "retencion", titulo: "Comprobante Retención", ancho: "155px", html: true },
    { campo: "monto_retencion", titulo: "Monto Ret. USD", ancho: "95px", num: true, fmt: usd },
    { campo: "saldo_usd", titulo: "Saldo USD", ancho: "85px", num: true, fmt: usd },
    { campo: "analista", titulo: "Analista", ancho: "125px" },
    { campo: "vendedor", titulo: "Vendedor", ancho: "120px" },
    { campo: "zona", titulo: "Zona", ancho: "50px" },
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

  $("form-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btn-entrar");
    if (btn) btn.disabled = true;
    $("login-error").hidden = true;
    let usuario = $("login-correo").value.trim().toLowerCase();
    if (!usuario.includes("@")) usuario = `v${usuario}@${C.DOMINIO_VENDEDORES}`; // código -> correo interno
    const { error } = await sb.auth.signInWithPassword({ email: usuario, password: $("login-clave").value });
    if (btn) btn.disabled = false;
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

  $("btn-salir")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });

  // ---------- BOTÓN REFRESCAR / SINCRONIZAR CON GOOGLE SHEETS ----------
  $("btn-refrescar")?.addEventListener("click", async () => {
    const btn = $("btn-refrescar");
    const icono = btn?.querySelector(".icono-refrescar");
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    if (icono) icono.classList.add("girando");
    aviso("⏳ Leyendo datos en vivo desde Google Sheets...");
    const inicioTiempo = Date.now();
    try {
      await cargarDatos();
      const demora = Math.max(0, 600 - (Date.now() - inicioTiempo));
      setTimeout(() => {
        if (icono) icono.classList.remove("girando");
        if (btn) btn.disabled = false;
        aviso("✅ Datos sincronizados con Google Sheets");
      }, demora);
    } catch (err) {
      console.error("Error al refrescar datos:", err);
      if (icono) icono.classList.remove("girando");
      if (btn) btn.disabled = false;
      aviso("❌ Error al leer Google Sheets: " + (err.message || "Verifique la conexión"));
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

  // ---------- CSV PARSER RFC 4180 ----------
  function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let insideQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        currentRow.push(currentField);
        currentField = "";
      } else if ((char === "\r" || char === "\n") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") i++;
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }
    return rows;
  }

  const parseNum = (v) => {
    if (!v) return 0;
    const limpio = String(v).replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(limpio);
    return isNaN(n) ? 0 : n;
  };

  const parseFechaIso = (d) => {
    if (!d) return "";
    const s = String(d).trim();
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
      return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const m2 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m2) {
      return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
    }
    return s;
  };

  function calcularDiasVencida(fechaVenceIso) {
    if (!fechaVenceIso) return 0;
    const partes = fechaVenceIso.split("-");
    if (partes.length !== 3) return 0;
    const vence = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diffMs = hoy.getTime() - vence.getTime();
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDias > 0 ? diffDias : 0;
  }

  function procesarCsvGoogleSheet(text) {
    const rows = parseCSV(text);
    if (!rows || rows.length < 2) return [];
    const facturas = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 3 || !r[2]) continue;

      const codCliente = (r[0] || "").trim();
      const razonSocial = (r[1] || "").trim();
      const numFactura = (r[2] || "").trim();
      const fEmision = parseFechaIso(r[3]);
      const fVence = parseFechaIso(r[4]);
      const montoDolar = parseNum(r[5]);
      const saldoUsd = parseNum(r[6]);
      const retencion = (r[7] || "").trim();
      const montoRetencion = parseNum(r[8]);
      const zona = (r[9] || "").trim();
      const vendedor = (r[10] || "").trim();
      const analista = (r[11] || "").trim();
      const estadoFila = (r[12] || "").trim().toUpperCase() || "SIN RETENCION";
      const correoCliente = (r[13] || "").trim();
      const correoVendedor = (r[14] || "").trim();
      const ultimaAct = (r[15] || "").trim();

      const diasV = calcularDiasVencida(fVence);
      const estimado = montoRetencion > 0
        ? montoRetencion
        : (montoDolar > 0 ? Math.round(montoDolar * (12.0 / 116.0) * 100) / 100 : 0);

      facturas.push({
        codigo_cliente: codCliente,
        razon_social: razonSocial,
        rif: codCliente,
        factura: numFactura,
        fecha_emision: fEmision,
        fecha_vence: fVence,
        dias_vencida: diasV,
        monto_dolar: montoDolar,
        saldo_usd: saldoUsd,
        retencion: retencion,
        monto_retencion: montoRetencion,
        monto_estimado: estimado,
        zona: zona,
        vendedor: vendedor,
        vendedor_nombre: vendedor,
        analista: analista,
        estado: estadoFila,
        correo_cliente: correoCliente,
        correo_vendedor: correoVendedor,
        ultima_actualizacion: ultimaAct,
      });
    }
    return facturas;
  }

  // ---------- DATOS (SIEMPRE LEYENDO GOOGLE SHEETS) ----------
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
    let facturasCargadas = [];
    let textoCarga = "";

    // 1. Siempre intentar leer directamente de Google Sheets
    try {
      const urlCsv = (C.GOOGLE_SHEET_CSV_URL || "") + ((C.GOOGLE_SHEET_CSV_URL || "").includes("?") ? "&" : "?") + "t=" + Date.now();
      const resp = await fetch(urlCsv, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const csvTexto = await resp.text();
      facturasCargadas = procesarCsvGoogleSheet(csvTexto);
      const horaStr = new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      textoCarga = `Google Sheets en vivo · Sincronizado a las ${horaStr}`;
    } catch (errSheets) {
      console.warn("No se pudo conectar directamente a Google Sheets, usando base de datos Supabase:", errSheets);
      // Respaldo secundario en Supabase
      const [facturasSb, cargaSb] = await Promise.all([
        todo("facturas"),
        sb.from("cargas").select("fecha,facturas").order("fecha", { ascending: false }).limit(1),
      ]);
      facturasCargadas = facturasSb.map((f) => {
        const montoDolar = Number(f.monto_dolar) || 0;
        const montoEst = Number(f.monto_estimado);
        const montoRet = Number(f.monto_retencion) || 0;
        const estimado = montoRet > 0 ? montoRet : (montoEst && !isNaN(montoEst) && montoEst > 0 ? montoEst : (montoDolar > 0 ? Math.round(montoDolar * (12.0 / 116.0) * 100) / 100 : 0));
        return {
          ...f,
          analista: f.analista || "Lolimar Oropeza",
          estado: f.estado || (f.retencion ? "RETENCION CARGADA NO APLICADA" : "SIN RETENCION"),
          monto_estimado: estimado,
          dias_vencida: calcularDiasVencida(f.fecha_vence)
        };
      });
      const c = cargaSb.data?.[0];
      const fechaUltima = c ? new Date(c.fecha).toLocaleString("es-VE") : new Date().toLocaleString("es-VE");
      textoCarga = `Caché BD · Actualizado ${fechaUltima}`;
    }

    estado.facturas = facturasCargadas;
    $("ultima-carga").textContent = textoCarga;

    // 2. Cargar tabla de vendedores (teléfonos y códigos) para WhatsApp
    let vendedoresSb = [];
    try {
      vendedoresSb = await todo("vendedores");
    } catch (e) {
      console.warn("No se pudo cargar tabla vendedores de Supabase:", e);
    }

    estado.vendedores = new Map();
    vendedoresSb.forEach((v) => {
      if (v.codigo) estado.vendedores.set(v.codigo, v);
      if (v.nombre) estado.vendedores.set(v.nombre.trim().toUpperCase(), v);
    });

    // Mapear vendedores que estén en el Excel pero falten en Supabase
    estado.facturas.forEach((f) => {
      const nom = (f.vendedor || "").trim().toUpperCase();
      if (nom && !estado.vendedores.has(nom)) {
        const cod = f.zona ? f.zona.replace(/^Z0*/, "") : nom;
        const objVend = {
          codigo: cod,
          nombre: f.vendedor,
          telefono: "",
          correo: f.correo_vendedor || ""
        };
        estado.vendedores.set(nom, objVend);
        if (!estado.vendedores.has(cod)) estado.vendedores.set(cod, objVend);
      }
    });

    // 3. Poblar selectores de filtros dinámicos
    const listaAnalistas = [...new Set(estado.facturas.map((f) => f.analista))].filter(Boolean);
    llenarSelect("f-analista", listaAnalistas);

    const listaVendedores = [...new Set(estado.facturas.map((f) => f.vendedor))].filter(Boolean);
    llenarSelect("f-vendedor", listaVendedores, (v) => {
      const obj = estado.vendedores.get(v.toUpperCase());
      return obj?.codigo ? `${obj.codigo} · ${v}` : v;
    });

    const listaZonas = [...new Set(estado.facturas.map((f) => f.zona))].filter(Boolean);
    llenarSelect("f-zona", listaZonas);

    aplicarFiltros();
  }

  function llenarSelect(id, valores, etiqueta = (v) => v) {
    const sel = $(id);
    if (!sel) return;
    const valorActual = sel.value;
    const primero = sel.options[0]?.outerHTML || '<option value="">Todos</option>';
    valores = valores.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    sel.innerHTML = primero + valores.map((v) => `<option value="${esc(v)}">${esc(etiqueta(v))}</option>`).join("");
    if (valorActual && valores.includes(valorActual)) {
      sel.value = valorActual;
    }
  }

  // ---------- FILTROS COMUNES ----------
  function filtrar(lista) {
    const v = $("f-vendedor")?.value || "";
    const analista = $("f-analista")?.value || "";
    const z = $("f-zona")?.value || "";
    const e = $("f-estado")?.value || "";
    const q = ($("f-buscar")?.value || "").trim().toLowerCase();
    const desde = parseFloat($("f-desde")?.value);
    const hasta = parseFloat($("f-hasta")?.value);

    // Si el usuario logueado es asesor (no admin), solo ve sus facturas
    const vendedorFijo = !esAdmin() ? estado.perfil?.codigo_vendedor : null;

    return lista.filter((f) => {
      if (vendedorFijo) {
        const nomVend = (f.vendedor || "").trim().toUpperCase();
        const objVend = estado.vendedores.get(nomVend);
        const codZona = (f.zona || "").replace(/^Z0*/, "");
        if (f.vendedor !== vendedorFijo && objVend?.codigo !== vendedorFijo && codZona !== vendedorFijo) {
          return false;
        }
      }
      if (v) {
        const nomVend = (f.vendedor || "").trim().toUpperCase();
        const objVend = estado.vendedores.get(nomVend);
        if (f.vendedor !== v && objVend?.codigo !== v && nomVend !== v.toUpperCase()) return false;
      }
      if (analista && f.analista !== analista) return false;
      if (z && f.zona !== z) return false;
      if (e === "vencidas" && !(f.dias_vencida > 0)) return false;
      if (e === "sinvencer" && !(f.dias_vencida <= 0)) return false;
      if (!isNaN(desde) && f.monto_dolar < desde) return false;
      if (!isNaN(hasta) && f.monto_dolar > hasta) return false;
      if (q) {
        const buscarCampos = [
          f.razon_social,
          f.codigo_cliente,
          f.rif,
          f.factura,
          f.retencion,
          f.analista,
          f.vendedor,
          f.zona
        ];
        if (!buscarCampos.some((x) => (x || "").toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });
  }

  function aplicarFiltros() {
    // 1. Separar universos de datos según estado
    const listaSinRetencion = estado.facturas.filter((f) => f.estado === "SIN RETENCION");
    const listaPorProcesar = estado.facturas.filter((f) => f.estado === "RETENCION CARGADA NO APLICADA");

    // 2. Aplicar filtros a ambas listas
    const filtradasSin = filtrar(listaSinRetencion);
    const filtradasProc = filtrar(listaPorProcesar);

    // 3. Ordenar Sin Retención
    const { campo: c1, asc: a1 } = estado.orden;
    estado.filtradas = filtradasSin.sort((a, b) => {
      const x = a[c1], y = b[c1];
      const r = typeof x === "number" || typeof y === "number" ? (x ?? 0) - (y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true });
      return a1 ? r : -r;
    });

    // 4. Ordenar Pendiente por Procesar
    const { campo: c2, asc: a2 } = estado.ordenProc;
    estado.filtradasProc = filtradasProc.sort((a, b) => {
      const x = a[c2], y = b[c2];
      const r = typeof x === "number" || typeof y === "number" ? (x ?? 0) - (y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true });
      return a2 ? r : -r;
    });

    estado.pagina = 0;
    estado.paginaProc = 0;

    // 5. Actualizar badges en pestañas de navegación
    const bSin = $("badge-sin-retencion");
    if (bSin) bSin.textContent = ent(estado.filtradas.length);
    const bProc = $("badge-por-procesar");
    if (bProc) bProc.textContent = ent(estado.filtradasProc.length);

    // 6. Actualizar métricas KPI globales
    pintarKpis(estado.filtradas, estado.filtradasProc);
    pintarHeroCard();
    pintarFacturas();
    pintarPorProcesar();
    pintarVendedores();
  }

  ["f-vendedor", "f-analista", "f-zona", "f-estado"].forEach((id) => $(id)?.addEventListener("change", aplicarFiltros));
  ["f-buscar", "f-desde", "f-hasta"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(aplicarFiltros.t);
    aplicarFiltros.t = setTimeout(aplicarFiltros, 200);
  }));

  $("btn-limpiar")?.addEventListener("click", () => {
    document.querySelectorAll(".filtros input, .filtros select").forEach((el) => (el.value = ""));
    aplicarFiltros();
  });

  // ---------- SEMÁFORO DE COBRANZA ----------
  function calcularSemaforo(facturado, cobrado, saldoVencido, saldoTotal) {
    const avance = facturado > 0 ? (cobrado / facturado) * 100 : 0;
    const ratioMora = saldoTotal > 0 ? (saldoVencido / saldoTotal) * 100 : 0;

    if (saldoVencido <= 0 || ratioMora === 0) {
      if (avance >= 40) return { nivel: "estable", label: "🟢 Estable", clase: "estable" };
      return { nivel: "precaucion", label: "🟡 En precaución", clase: "precaucion" };
    }

    if (ratioMora > 45 || (avance < 25 && ratioMora > 20)) {
      return { nivel: "riesgo", label: "🔴 En riesgo", clase: "riesgo" };
    }

    if (avance >= 50 && ratioMora <= 25) {
      return { nivel: "estable", label: "🟢 Estable", clase: "estable" };
    }

    return { nivel: "precaucion", label: "🟡 En precaución", clase: "precaucion" };
  }

  // ---------- TARJETA EJECUTIVA HERO CARD ----------
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
        const objVend = estado.vendedores.get(selVend.toUpperCase());
        nombreVendedor = objVend?.nombre || selVend;
      } else {
        esGlobal = true;
        nombreVendedor = "Centro de Mando Comercial · Global Beval";
      }
    }

    hero.hidden = false;

    // Facturas del universo del asesor o global (solo Sin Retención)
    const facturasHeroTotal = codVendedor
      ? estado.facturas.filter((f) => {
          const nomVend = (f.vendedor || "").trim().toUpperCase();
          const obj = estado.vendedores.get(nomVend);
          return f.vendedor === codVendedor || obj?.codigo === codVendedor || nomVend === codVendedor.toUpperCase();
        })
      : estado.filtradas;

    const totalFacturadoGlobal = facturasHeroTotal.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const saldoTotalGlobal = facturasHeroTotal.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
    const cobradoGlobal = Math.max(0, totalFacturadoGlobal - saldoTotalGlobal);

    const facturasVencidas = facturasHeroTotal.filter((f) => f.dias_vencida > 0);
    const facturasAlDia = facturasHeroTotal.filter((f) => f.dias_vencida <= 0);

    const saldoVencidoGlobal = facturasVencidas.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
    const saldoAlDiaGlobal = facturasAlDia.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);

    const sem = calcularSemaforo(totalFacturadoGlobal, cobradoGlobal, saldoVencidoGlobal, saldoTotalGlobal);
    const semEl = $("vh-semaforo");
    if (semEl) {
      semEl.className = `badge-semaforo ${sem.clase}`;
      semEl.textContent = esGlobal ? `Cartera ${sem.label}` : `Asesor ${sem.label}`;
    }

    let pctCobrado = totalFacturadoGlobal > 0 ? Math.round((cobradoGlobal / totalFacturadoGlobal) * 100) : 0;
    let pctAlDia = totalFacturadoGlobal > 0 ? Math.round((saldoAlDiaGlobal / totalFacturadoGlobal) * 100) : 0;
    let pctVencido = Math.max(0, 100 - pctCobrado - pctAlDia);
    if (totalFacturadoGlobal === 0) {
      pctCobrado = 0; pctAlDia = 0; pctVencido = 0;
    }

    const bCob = $("vh-bar-cobrado"), bDia = $("vh-bar-aldia"), bVen = $("vh-bar-vencido");
    if (bCob) bCob.style.width = `${pctCobrado}%`;
    if (bDia) bDia.style.width = `${pctAlDia}%`;
    if (bVen) bVen.style.width = `${pctVencido}%`;

    const txtCob = $("vh-pct-cobrado"), txtDia = $("vh-pct-aldia"), txtVen = $("vh-pct-vencido");
    if (txtCob) txtCob.textContent = `${pctCobrado}%`;
    if (txtDia) txtDia.textContent = `${pctAlDia}%`;
    if (txtVen) txtVen.textContent = `${pctVencido}%`;

    const vista = estado.vistaCartera || "completa";
    let facturasVista = facturasHeroTotal;
    let tituloAvance = "Avance & Proyección Cierre";

    if (vista === "vencida") {
      facturasVista = facturasVencidas;
      tituloAvance = "Recuperación de Cartera Vencida (Mora)";
    } else if (vista === "aldia") {
      facturasVista = facturasAlDia;
      tituloAvance = "Avance de Cartera al Día (Por Vencer)";
    }

    const totalFacturado = facturasVista.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const saldoPendiente = facturasVista.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
    const cobrado = Math.max(0, totalFacturado - saldoPendiente);
    const retencionEstimada = facturasVista.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
    const sinVencer = facturasVista.filter((f) => f.dias_vencida <= 0).reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);

    const avancePct = totalFacturado > 0 ? Math.min(100, Math.round((cobrado / totalFacturado) * 100)) : 0;
    const proyPct = totalFacturado > 0 ? Math.min(130, Math.round(((cobrado + (sinVencer * 0.75)) / totalFacturado) * 100)) : 0;

    $("vh-tag").textContent = esGlobal ? "Consolidado Ejecutivo Beval" : `Asesor Comercial Softland · ${codVendedor}`;
    $("vh-nombre").textContent = nombreVendedor;
    $("vh-sub").textContent = esGlobal
      ? `${ent(facturasHeroTotal.length)} facturas totales en seguimiento activo`
      : `Zona ${facturasHeroTotal[0]?.zona || "N/A"} · ${ent(facturasHeroTotal.length)} facturas asignadas`;

    $("vh-facturado").textContent = `$${usd(totalFacturado)}`;
    $("vh-cobrado").textContent = `$${usd(cobrado)}`;
    $("vh-saldo").textContent = `$${usd(saldoPendiente)}`;
    $("vh-retencion").textContent = `$${usd(retencionEstimada)}`;

    const titAvEl = $("vh-avance-titulo");
    if (titAvEl) titAvEl.textContent = tituloAvance;

    $("vh-avance-txt").textContent = vista === "vencida"
      ? `${avancePct}% recuperado`
      : `${avancePct}% (Proy. Cierre ${proyPct}%)`;

    const fillBar = $("vh-gauge-fill");
    if (fillBar) {
      fillBar.style.width = `${Math.min(100, Math.max(0, avancePct))}%`;
      fillBar.style.background = avancePct >= 65
        ? "linear-gradient(90deg, #f59e0b, #22c55e)"
        : avancePct >= 35
          ? "linear-gradient(90deg, #ea580c, #f59e0b)"
          : "linear-gradient(90deg, #b91c1c, #ef4444)";
    }

    document.querySelectorAll("#vh-switch-cartera .vh-pill-btn").forEach((btn) => {
      btn.classList.toggle("activa", btn.dataset.vista === vista);
    });
  }

  $("vh-switch-cartera")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".vh-pill-btn");
    if (!btn) return;
    estado.vistaCartera = btn.dataset.vista;
    pintarHeroCard();
    aviso(`Vista: ${btn.textContent}`);
  });

  // ---------- RENDER KPIS ----------
  function pintarKpis(listaSinRet, listaProc) {
    const facturasCount = listaSinRet.length;
    const procCount = listaProc.length;
    const estimado = listaSinRet.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
    const vencidas = listaSinRet.filter((f) => f.dias_vencida > 0).length;
    const clientes = new Set(listaSinRet.map((f) => f.codigo_cliente)).size;

    if ($("k-facturas")) $("k-facturas").textContent = ent(facturasCount);
    if ($("k-por-procesar")) $("k-por-procesar").textContent = ent(procCount);
    if ($("k-estimado")) $("k-estimado").textContent = usd(estimado);
    if ($("k-vencidas")) $("k-vencidas").textContent = ent(vencidas);
    if ($("k-clientes")) $("k-clientes").textContent = ent(clientes);
  }

  // ---------- TABLA 1: SIN RETENCIÓN ----------
  function filaHtml(f) {
    const isChecked = estado.seleccionadas.has(f.factura);
    const diasV = Number(f.dias_vencida) || 0;
    const badgeDias = diasV > 0
      ? `<span class="badge-dias vencido">${diasV >= 45 ? "45+ días" : `${diasV}d`}</span>`
      : `<span class="badge-dias al-dia">Al día</span>`;

    const clienteHtml = `
      <div class="cliente-consolidado" title="${esc(f.razon_social)} · ${esc(f.codigo_cliente)}">
        <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
        <button type="button" class="cliente-codigo-btn" data-copiar-codigo="${esc(f.codigo_cliente)}" title="Toca para copiar código ${esc(f.codigo_cliente)}">
          <span class="cod-icono">📋</span>
          <span class="cod-txt">${esc(f.codigo_cliente || "")}</span>
        </button>
        ${badgeDias}
      </div>`;

    return `<tr data-fac="${esc(f.factura)}">
      <td style="width: 34px; text-align: center;">
        <input type="checkbox" class="chk-factura" data-factura="${esc(f.factura)}" ${isChecked ? "checked" : ""}>
      </td>
      <td style="width: 85px; font-weight: 700;">${esc(f.factura)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_emision)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_vence)}</td>
      <td class="num" style="width: 62px;">${diasV > 0 ? `<span class="vencida">${ent(diasV)}</span>` : ent(diasV)}</td>
      <td style="width: auto;">${clienteHtml}</td>
      <td style="width: 125px; font-size: 11.5px;">${esc(f.analista)}</td>
      <td style="width: 115px; font-size: 11.5px;" title="${esc(f.vendedor)}">${esc(f.vendedor)}</td>
      <td style="width: 50px; text-align: center;">${esc(f.zona)}</td>
      <td class="num" style="width: 86px;">${usd(f.monto_dolar)}</td>
      <td class="num" style="width: 86px;">${usd(f.saldo_usd)}</td>
      <td class="num" style="width: 92px; font-weight: 700; color: var(--beval-lime);">${usd(f.monto_estimado)}</td>
    </tr>`;
  }

  function encabezado(tablaId, columnas, ordenActual, checkId) {
    const thead = $(tablaId)?.querySelector("thead");
    if (!thead) return;

    thead.innerHTML = "<tr>" + columnas.map((c) => {
      if (c.campo === "sel") {
        return `<th style="width: ${c.ancho}; text-align: center;">
          <input type="checkbox" id="${checkId}" title="Seleccionar todas las visibles">
        </th>`;
      }
      const flecha = c.campo === ordenActual.campo ? (ordenActual.asc ? " ▲" : " ▼") : "";
      return `<th data-campo="${c.campo}" class="${c.num ? "num" : ""}" style="width: ${c.ancho};">${c.titulo}${flecha}</th>`;
    }).join("") + "</tr>";
  }

  function pintarFacturas() {
    const total = estado.filtradas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const ini = estado.pagina * POR_PAGINA;
    encabezado("tabla-facturas", COLUMNAS, estado.orden, "th-check-todos");

    // Manejador del checkbox maestro
    const thCheck = $("th-check-todos");
    if (thCheck) {
      thCheck.onclick = (e) => {
        const marcar = e.target.checked;
        const paginaFacturas = estado.filtradas.slice(ini, ini + POR_PAGINA);
        paginaFacturas.forEach((f) => {
          if (marcar) estado.seleccionadas.add(f.factura);
          else estado.seleccionadas.delete(f.factura);
        });
        pintarFacturas();
        actualizarContadorSeleccionados();
      };
    }

    const paginaFacturas = estado.filtradas.slice(ini, ini + POR_PAGINA);
    const tbody = $("tabla-facturas")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = paginaFacturas.map(filaHtml).join("") ||
      `<tr><td colspan="${COLUMNAS.length}" style="text-align: center; padding: 24px;">No hay facturas sin retención con estos filtros.</td></tr>`;

    if (thCheck && paginaFacturas.length > 0) {
      thCheck.checked = paginaFacturas.every((f) => estado.seleccionadas.has(f.factura));
    }

    $("conteo").textContent = `${ent(total)} facturas sin retención`;
    $("pag-info").textContent = `Página ${estado.pagina + 1} de ${paginas}`;
    $("pag-ant").disabled = estado.pagina === 0;
    $("pag-sig").disabled = estado.pagina >= paginas - 1;
    actualizarContadorSeleccionados();
  }

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

  // ---------- TABLA 2: PENDIENTE POR PROCESAR (RETENCIÓN ERP) ----------
  function filaPorProcesarHtml(f) {
    const isChecked = estado.seleccionadasProc.has(f.factura);
    const diasV = Number(f.dias_vencida) || 0;
    const badgeDias = diasV > 0
      ? `<span class="badge-dias vencido">${diasV >= 45 ? "45+ días" : `${diasV}d`}</span>`
      : `<span class="badge-dias al-dia">Al día</span>`;

    const clienteHtml = `
      <div class="cliente-consolidado" title="${esc(f.razon_social)} · ${esc(f.codigo_cliente)}">
        <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
        <button type="button" class="cliente-codigo-btn" data-copiar-codigo="${esc(f.codigo_cliente)}" title="Toca para copiar código ${esc(f.codigo_cliente)}">
          <span class="cod-icono">📋</span>
          <span class="cod-txt">${esc(f.codigo_cliente || "")}</span>
        </button>
        ${badgeDias}
      </div>`;

    const comprobanteHtml = f.retencion
      ? `<button type="button" class="btn-copiar-comprobante" data-copiar-codigo="${esc(f.retencion)}" title="Toca para copiar comprobante ${esc(f.retencion)}">
          <span class="cod-icono">📑</span>
          <span class="cod-txt" style="font-family: monospace; font-weight: 700;">${esc(f.retencion)}</span>
        </button>`
      : `<span style="color: var(--suave);">—</span>`;

    return `<tr data-fac="${esc(f.factura)}">
      <td style="width: 34px; text-align: center;">
        <input type="checkbox" class="chk-factura-proc" data-factura="${esc(f.factura)}" ${isChecked ? "checked" : ""}>
      </td>
      <td style="width: 85px; font-weight: 700;">${esc(f.factura)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_emision)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_vence)}</td>
      <td class="num" style="width: 62px;">${diasV > 0 ? `<span class="vencida">${ent(diasV)}</span>` : ent(diasV)}</td>
      <td style="width: auto;">${clienteHtml}</td>
      <td style="width: 155px;">${comprobanteHtml}</td>
      <td class="num" style="width: 95px; font-weight: 700; color: #0284c7;">$${usd(f.monto_retencion || f.monto_estimado)}</td>
      <td class="num" style="width: 85px;">${usd(f.saldo_usd)}</td>
      <td style="width: 125px; font-size: 11.5px;">${esc(f.analista)}</td>
      <td style="width: 120px; font-size: 11.5px;" title="${esc(f.vendedor)}">${esc(f.vendedor)}</td>
      <td style="width: 50px; text-align: center;">${esc(f.zona)}</td>
    </tr>`;
  }

  function pintarPorProcesar() {
    const total = estado.filtradasProc.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const ini = estado.paginaProc * POR_PAGINA;
    encabezado("tabla-por-procesar", COLUMNAS_POR_PROCESAR, estado.ordenProc, "th-check-proc");

    const thCheck = $("th-check-proc");
    if (thCheck) {
      thCheck.onclick = (e) => {
        const marcar = e.target.checked;
        const paginaFacturas = estado.filtradasProc.slice(ini, ini + POR_PAGINA);
        paginaFacturas.forEach((f) => {
          if (marcar) estado.seleccionadasProc.add(f.factura);
          else estado.seleccionadasProc.delete(f.factura);
        });
        pintarPorProcesar();
      };
    }

    const paginaFacturas = estado.filtradasProc.slice(ini, ini + POR_PAGINA);
    const tbody = $("tabla-por-procesar")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = paginaFacturas.map(filaPorProcesarHtml).join("") ||
      `<tr><td colspan="${COLUMNAS_POR_PROCESAR.length}" style="text-align: center; padding: 24px;">No hay facturas por procesar con estos filtros.</td></tr>`;

    if (thCheck && paginaFacturas.length > 0) {
      thCheck.checked = paginaFacturas.every((f) => estado.seleccionadasProc.has(f.factura));
    }

    if ($("conteo-por-procesar")) $("conteo-por-procesar").textContent = `${ent(total)} facturas pendientes por procesar`;
    if ($("pag-info-proc")) $("pag-info-proc").textContent = `Página ${estado.paginaProc + 1} de ${paginas}`;
    if ($("pag-ant-proc")) $("pag-ant-proc").disabled = estado.paginaProc === 0;
    if ($("pag-sig-proc")) $("pag-sig-proc").disabled = estado.paginaProc >= paginas - 1;
  }

  $("tabla-por-procesar")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("chk-factura-proc")) {
      const fac = e.target.dataset.factura;
      if (e.target.checked) estado.seleccionadasProc.add(fac);
      else estado.seleccionadasProc.delete(fac);
    }
  });

  $("pag-ant-proc")?.addEventListener("click", () => { estado.paginaProc--; pintarPorProcesar(); });
  $("pag-sig-proc")?.addEventListener("click", () => { estado.paginaProc++; pintarPorProcesar(); });

  document.addEventListener("click", (e) => {
    const th = e.target.closest("#tabla-por-procesar th[data-campo]");
    if (!th) return;
    const campo = th.dataset.campo;
    const colDef = COLUMNAS_POR_PROCESAR.find((c) => c.campo === campo);
    if (colDef?.noSort) return;
    estado.ordenProc = { campo, asc: estado.ordenProc.campo === campo ? !estado.ordenProc.asc : true };
    aplicarFiltros();
  });

  // Copiar lista o seleccionados de "Por Procesar"
  $("btn-copiar-procesar")?.addEventListener("click", async () => {
    const lista = estado.seleccionadasProc.size > 0
      ? estado.filtradasProc.filter((f) => estado.seleccionadasProc.has(f.factura))
      : estado.filtradasProc;
    if (lista.length === 0) {
      aviso("⚠️ No hay facturas por procesar para copiar");
      return;
    }
    const totalRet = lista.reduce((s, f) => s + (Number(f.monto_retencion) || Number(f.monto_estimado) || 0), 0);
    const lineas = lista.map((f) =>
      `• Fact. ${f.factura} | ${f.razon_social} | Comprobante: ${f.retencion || "S/C"} | Monto Ret: $${usd(f.monto_retencion || f.monto_estimado)} USD | Analista: ${f.analista || "N/A"}`
    );
    const texto = `*FACTURAS CON RETENCIÓN CARGADA EN ERP (PENDIENTES POR PROCESAR)*\n` +
      `Total: ${ent(lista.length)} facturas | Retenciones: $${usd(totalRet)} USD\n\n` +
      lineas.slice(0, 100).join("\n") +
      (lineas.length > 100 ? `\n\n... y ${lineas.length - 100} facturas más.` : "");
    await navigator.clipboard.writeText(texto);
    aviso(`📋 Copiada lista de ${ent(lista.length)} facturas por procesar`);
  });

  // Exportar CSV de "Por Procesar"
  $("btn-csv-procesar")?.addEventListener("click", () => {
    const cab = ["Factura", "Emisión", "Vence", "Días Vencida", "Código Cliente", "Cliente", "Comprobante Retención", "Monto Retención USD", "Saldo USD", "Analista", "Vendedor", "Zona", "Estado"];
    const filas = estado.filtradasProc.map((f) => [
      f.factura,
      fecha(f.fecha_emision),
      fecha(f.fecha_vence),
      f.dias_vencida,
      f.codigo_cliente,
      f.razon_social,
      f.retencion,
      usd(f.monto_retencion || f.monto_estimado),
      usd(f.saldo_usd),
      f.analista,
      f.vendedor,
      f.zona,
      f.estado
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));

    const blob = new Blob(["\uFEFF" + [cab.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `facturas_por_procesar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  // Copiado inmediato de código de cliente o comprobante con un toque
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copiar-codigo]");
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const cod = btn.dataset.copiarCodigo;
    if (!cod) return;

    let copiado = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cod);
        copiado = true;
      }
    } catch {
      copiado = false;
    }

    if (!copiado) {
      try {
        const ta = document.createElement("textarea");
        ta.value = cod;
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "0";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copiado = true;
      } catch (err) {
        console.warn("Error al copiar:", err);
      }
    }

    btn.classList.add("copiado");
    const icono = btn.querySelector(".cod-icono");
    const txtOrig = icono ? icono.textContent : "";
    if (icono) icono.textContent = "✓";
    setTimeout(() => {
      btn.classList.remove("copiado");
      if (icono) icono.textContent = txtOrig || "📋";
    }, 1200);
    aviso(`📋 Copiado al portapapeles: ${cod}`);
  });

  // ---------- TABLA 3: VENDEDORES ----------
  function grupos(lista) {
    const m = new Map();
    lista.forEach((f) => {
      const vKey = f.vendedor || "Sin registrar";
      if (!m.has(vKey)) m.set(vKey, []);
      m.get(vKey).push(f);
    });
    return [...m.entries()].map(([vendNom, fs]) => {
      const totalFact = fs.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
      const saldoPend = fs.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
      const cobrado = Math.max(0, totalFact - saldoPend);
      const avancePct = totalFact > 0 ? Math.min(100, Math.round((cobrado / totalFact) * 100)) : 0;
      const r = {
        facturas: fs.length,
        estimado: fs.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0),
        vencidas: fs.filter((f) => f.dias_vencida > 0).length,
        clientes: new Set(fs.map((f) => f.codigo_cliente)).size,
      };
      return { cod: vendNom, vendNom, fs, r, avancePct, zona: fs[0]?.zona || "" };
    }).sort((a, b) => b.r.estimado - a.r.estimado);
  }

  function pintarVendedores() {
    if (!esAdmin()) return;
    const listaGrupos = grupos(estado.filtradas);

    let cntRiesgo = 0, cntPrecaucion = 0, cntEstable = 0;

    const listaConSemaforo = listaGrupos.map((g) => {
      const saldoVencido = g.fs.filter((f) => f.dias_vencida > 0).reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
      const saldoTotal = g.fs.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
      const totalFact = g.fs.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
      const cobrado = Math.max(0, totalFact - saldoTotal);
      const sem = calcularSemaforo(totalFact, cobrado, saldoVencido, saldoTotal);

      if (sem.nivel === "riesgo") cntRiesgo++;
      else if (sem.nivel === "precaucion") cntPrecaucion++;
      else cntEstable++;

      return { ...g, sem };
    });

    const elR = $("count-sem-riesgo"), elP = $("count-sem-precaucion"), elE = $("count-sem-estable");
    if (elR) elR.textContent = cntRiesgo;
    if (elP) elP.textContent = cntPrecaucion;
    if (elE) elE.textContent = cntEstable;

    const semFiltro = estado.filtroSemaforo || "todos";
    const listaMostrada = semFiltro === "todos"
      ? listaConSemaforo
      : listaConSemaforo.filter((g) => g.sem.nivel === semFiltro);

    const tbody = $("tabla-vendedores")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = listaMostrada.map(({ cod, fs, r, avancePct, zona, sem }) => {
      const v = estado.vendedores.get(cod.toUpperCase()) || {};
      const codIdent = v.codigo || zona.replace(/^Z0*/, "") || cod;
      const yaEnviado = estado.wsEnviados.has(codIdent) || estado.wsEnviados.has(cod);
      const statusBadge = yaEnviado
        ? `<span class="badge-ws enviado">✅ Enviado</span>`
        : `<span class="badge-ws espera">⏳ En espera</span>`;

      const colorAvance = avancePct >= 65 ? "#22c55e" : avancePct >= 35 ? "#f59e0b" : "#ef4444";

      const avanceHtml = `
        <div class="avance-cell">
          <div class="avance-mini-gauge">
            <div class="avance-mini-fill" style="width: ${avancePct}%; background: ${colorAvance};"></div>
            <div class="avance-mini-target"></div>
          </div>
          <span class="avance-mini-txt" style="color: ${colorAvance};">${avancePct}%</span>
        </div>`;

      const nombreLimpio = v.nombre || cod;
      const celdaVendedor = `
        <div style="display: flex; flex-direction: column;">
          <strong style="color: var(--texto);">${esc(nombreLimpio)}</strong>
          <small style="color: var(--suave); font-size: 11px;">Código: ${esc(codIdent)} ${v.telefono ? `· 📱 ${esc(v.telefono)}` : ""}</small>
        </div>`;

      return `<tr>
        <td style="text-align: center;">
          <span class="dot-semaforo ${sem.clase}" title="Asesor ${sem.label}"></span>
        </td>
        <td style="font-weight: 700; color: var(--suave);">${esc(zona || codIdent)}</td>
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
    }).join("") || `<tr><td colspan="9" style="text-align: center; padding: 24px;">No hay asesores en esta categoría del semáforo.</td></tr>`;

    $("vendedores-conteo").textContent = `${ent(listaMostrada.length)} asesores comerciales`;
    actualizarModalMasivo();
  }

  $("filtro-semaforo")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-sem-filtro");
    if (!btn) return;
    estado.filtroSemaforo = btn.dataset.sem;
    document.querySelectorAll("#filtro-semaforo .btn-sem-filtro").forEach((b) => {
      b.classList.toggle("activa", b === btn);
    });
    pintarVendedores();
    aviso(`Filtro semáforo: ${btn.textContent.trim()}`);
  });

  $("btn-reset-ws")?.addEventListener("click", () => {
    estado.wsEnviados.clear();
    guardarWsEnviados(estado.wsEnviados);
    pintarVendedores();
    aviso("🔄 Estados de WhatsApp reiniciados para hoy");
  });

  // ---------- MENSAJES & WHATSAPP ----------
  function mensaje(cod, lista) {
    const v = estado.vendedores.get(String(cod).toUpperCase()) || {};
    const r = {
      facturas: lista.length,
      estimado: lista.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0)
    };
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

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wa]");
    if (!b) return;
    const cod = b.dataset.wa;
    const v = estado.vendedores.get(cod.toUpperCase()) || {};
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (!tel) {
      aviso("⚠️ El asesor no tiene teléfono registrado");
      return;
    }
    if (tel.startsWith("0")) tel = "58" + tel.slice(1);
    const lista = estado.facturas.filter((f) => f.vendedor === cod && f.estado === "SIN RETENCION");
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(cod, lista))}`;
    window.open(url, "_blank", "noopener");
    marcarWsEnviado(cod);
    aviso(`✅ WhatsApp preparado para ${v.nombre || cod}`);
  });

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
    const sinRet = estado.facturas.filter((f) => f.estado === "SIN RETENCION");
    const listaGrupos = grupos(sinRet);
    const total = listaGrupos.length;
    const enviados = listaGrupos.filter((g) => estado.wsEnviados.has(g.cod)).length;
    const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;

    const progTxt = $("masivo-progreso-txt");
    const progBar = $("masivo-progreso-bar");
    if (progTxt) progTxt.textContent = `${enviados} de ${total} asesores (${pct}%)`;
    if (progBar) progBar.style.width = `${pct}%`;

    const proximo = listaGrupos.find((g) => !estado.wsEnviados.has(g.cod));
    const btnSiguiente = $("btn-enviar-siguiente");

    if (proximo) {
      const v = estado.vendedores.get(proximo.cod.toUpperCase()) || {};
      $("masivo-proximo-nombre").textContent = v.nombre || proximo.cod;
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

  $("btn-enviar-siguiente")?.addEventListener("click", () => {
    const cod = $("btn-enviar-siguiente")?.dataset.codProximo;
    if (!cod) return;
    const v = estado.vendedores.get(cod.toUpperCase()) || {};
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (!tel) {
      aviso("⚠️ El asesor no tiene teléfono registrado");
      return;
    }
    if (tel.startsWith("0")) tel = "58" + tel.slice(1);
    const lista = estado.facturas.filter((f) => f.vendedor === cod && f.estado === "SIN RETENCION");
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(cod, lista))}`;
    window.open(url, "_blank", "noopener");
    marcarWsEnviado(cod);
    aviso(`✅ WhatsApp abierto para ${v.nombre || cod}`);
    actualizarModalMasivo();
  });

  $("btn-copiar-todos-ws")?.addEventListener("click", async () => {
    const sinRet = estado.facturas.filter((f) => f.estado === "SIN RETENCION");
    const listaGrupos = grupos(sinRet);
    const separador = "\n" + "=".repeat(45) + "\n\n";
    const textoCompleto = listaGrupos.map(({ cod, fs }) => mensaje(cod, fs)).join(separador);
    await navigator.clipboard.writeText(textoCompleto);
    aviso("📋 Se han copiado todos los mensajes al portapapeles");
  });

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

  // ---------- CSV EXPORT (SIN RETENCIÓN) ----------
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

  // ---------- NAVEGACIÓN ENTRE PESTAÑAS ----------
  $("pestanas")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    const tab = b.dataset.tab;
    estado.tabActiva = tab;
    document.querySelectorAll("#pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + tab));
  });

  iniciar().catch((err) => {
    console.error("Error al iniciar aplicación:", err);
    $("cargando").textContent = "Error: " + err.message;
  });
})();