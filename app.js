(() => {
  const C = window.APP_CONFIG;
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const POR_PAGINA = 50;
  const STORAGE_KEY_WS = "beval_ws_enviados_v1";
  const STORAGE_KEY_TEMA = "beval_tema";
  const STORAGE_KEY_TELS = "beval_telefonos_vendedores_custom";
  const STORAGE_KEY_COMPROBANTES = "beval_comprobantes_asociados_v1";
  const STORAGE_KEY_SESION = "beval_sesion_local_v1";

  // Cargar y guardar sesión local rápida (sin contraseña compleja)
  const guardarSesionLocal = (p) => {
    try { localStorage.setItem(STORAGE_KEY_SESION, JSON.stringify(p)); } catch (e) {}
  };
  const cargarSesionLocal = () => {
    try {
      const g = localStorage.getItem(STORAGE_KEY_SESION);
      return g ? JSON.parse(g) : null;
    } catch { return null; }
  };
  const limpiarSesionLocal = () => {
    try { localStorage.removeItem(STORAGE_KEY_SESION); } catch (e) {}
  };

  // Cargar comprobantes guardados asociados
  const cargarComprobantesGuardados = () => {
    try {
      const g = localStorage.getItem(STORAGE_KEY_COMPROBANTES);
      return g ? JSON.parse(g) : {};
    } catch {
      return {};
    }
  };

  const guardarComprobanteEnStorage = (comp) => {
    try {
      const g = cargarComprobantesGuardados();
      g[comp.numero] = comp;
      localStorage.setItem(STORAGE_KEY_COMPROBANTES, JSON.stringify(g));
    } catch (e) {
      console.warn("No se pudo guardar comprobante en localStorage", e);
    }
  };

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

  // Cargar teléfonos personalizados guardados por el usuario
  const cargarTelefonosCustom = () => {
    try {
      const g = localStorage.getItem(STORAGE_KEY_TELS);
      return g ? JSON.parse(g) : {};
    } catch {
      return {};
    }
  };

  const guardarTelefonoCustom = (nom, tel) => {
    try {
      const g = cargarTelefonosCustom();
      if (tel) g[nom.toUpperCase()] = tel;
      else delete g[nom.toUpperCase()];
      localStorage.setItem(STORAGE_KEY_TELS, JSON.stringify(g));
    } catch (e) {
      console.warn("No se pudo guardar teléfono en localStorage", e);
    }
  };

  const estado = {
    perfil: null,
    facturas: [],
    vendedores: new Map(),
    clavesExcel: new Map(),
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

    // Comprobantes Digitales y OCR Asistido
    comprobantesAsociados: cargarComprobantesGuardados(),
    filtroComprobante: null,
    comprobanteActivo: {
      numero: "",
      fecha: "",
      cliente: "",
      facturas: new Map(),
    },

    // Modalidad de cobro masivo (vencidas o todas)
    modoMasivo: "vencidas",
  };

  // Pre-poblar estado.vendedores desde el inicio con el directorio base de C.VENDEDORES_DEFAULT
  (C.VENDEDORES_DEFAULT || []).forEach((v) => {
    if (v.codigo) estado.vendedores.set(String(v.codigo), v);
    if (v.nombre) estado.vendedores.set(v.nombre.trim().toUpperCase(), v);
  });

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
  const esAdmin = () => !estado.perfil || estado.perfil?.rol === "admin";

  function aviso(txt) {
    const a = $("aviso");
    if (!a) return;
    a.textContent = txt;
    a.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { a.hidden = true; }, 3200);
  }

  // Normalización de texto para coincidencia inteligente de nombres
  function normalizarTexto(txt) {
    if (!txt) return "";
    return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\-_()]/g, " ").toUpperCase().replace(/\s+/g, " ").trim();
  }

  // Buscador inteligente de asesor (por nombre completo, parcial, zona, código o primer nombre)
  function buscarVendedor(nomOcodigo, dbList, zonaOpcional) {
    if (!nomOcodigo && !zonaOpcional) return { codigo: "", nombre: "", telefono: "" };
    const k = String(nomOcodigo || "").trim().toUpperCase();
    
    // 0. Si tiene teléfono guardado manualmente en localStorage
    const telsCustom = cargarTelefonosCustom();
    const telCustom = telsCustom[k];

    const list = dbList || (estado.vendedores && estado.vendedores.size > 0 ? [...estado.vendedores.values()] : (C.VENDEDORES_DEFAULT || []));

    // 1. Si ya está en Map por clave exacta y TIENE TELÉFONO
    if (estado.vendedores && estado.vendedores.has(k)) {
      const v = estado.vendedores.get(k);
      if (v.telefono || telCustom) {
        return { ...v, telefono: telCustom || v.telefono || "" };
      }
    }

    // 2. Coincidencia por zona opcional (ej. Z054 -> Sócrates Aguilera)
    if (zonaOpcional) {
      const zNorm = String(zonaOpcional).replace(/^Z0*/, "").toUpperCase();
      for (const v of list) {
        const vZona = String(v.zona || "").replace(/^Z0*/, "").toUpperCase();
        const vCod = String(v.codigo || "").replace(/^Z0*/, "").toUpperCase();
        if ((vZona === zNorm || vCod === zNorm) && (v.telefono || telCustom)) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
    }

    const sClean = normalizarTexto(k);
    const sWords = sClean.split(" ").filter((w) => w.length >= 2);

    // 3. Coincidencia exacta limpia
    for (const v of list) {
      if (normalizarTexto(v.nombre) === sClean) {
        return { ...v, telefono: telCustom || v.telefono || "" };
      }
    }

    // 4. Coincidencia por código numérico de zona o vendedor (ej. Z075 -> 75, o 103)
    const numZona = k.replace(/^Z0*/, "").trim();
    if (numZona && /^\d+$/.test(numZona)) {
      for (const v of list) {
        const codLimpio = String(v.codigo || "").replace(/^Z0*/, "").trim();
        const zonaLimpia = String(v.zona || "").replace(/^Z0*/, "").trim();
        if (codLimpio === numZona || zonaLimpia === numZona) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
    }

    // 5. Coincidencia por PRIMER NOMBRE (ej. 'SOCRATES', 'ANGEL', 'RONNY', 'LISETH', 'MIGUEL')
    if (sWords.length === 1 && sWords[0].length >= 3) {
      const pNom = sWords[0];
      for (const v of list) {
        const vParts = normalizarTexto(v.nombre).split(" ");
        if (vParts[0] === pNom && (v.telefono || telCustom)) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
      for (const v of list) {
        const vParts = normalizarTexto(v.nombre).split(" ");
        if (vParts[0] === pNom) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
    }

    // 6. Subconjuntos de palabras (ej. 'SOCRATES AGUILERA' con 'SOCRATES AGUILERAS')
    for (const v of list) {
      const vWords = normalizarTexto(v.nombre).split(" ").filter((w) => w.length >= 2);
      if (vWords.length >= 2 && sWords.length >= 2) {
        const matchAll = sWords.every((w) => vWords.some((vw) => vw.includes(w) || w.includes(vw)));
        if (matchAll) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
    }

    // 7. Primer nombre y algún apellido
    for (const v of list) {
      const vParts = normalizarTexto(v.nombre).split(" ");
      const sParts = sClean.split(" ");
      if (vParts.length >= 2 && sParts.length >= 2) {
        if (vParts[0] === sParts[0] && (vParts[1] === sParts[1] || vParts[vParts.length - 1] === sParts[sParts.length - 1])) {
          return { ...v, telefono: telCustom || v.telefono || "" };
        }
      }
    }

    // 8. Fallback si estaba en Map (aunque no tuviera teléfono)
    if (estado.vendedores && estado.vendedores.has(k)) {
      const v = estado.vendedores.get(k);
      return { ...v, telefono: telCustom || v.telefono || "" };
    }

    return { codigo: numZona || k, nombre: nomOcodigo, telefono: telCustom || "" };
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

  // ---------- sesión y autenticación simplificada ----------
  async function entrarConPerfil(perfil) {
    estado.perfil = perfil;
    guardarSesionLocal(perfil);
    $("usuario-nombre").textContent = perfil.nombre || "Usuario";
    $("usuario-rol").textContent = perfil.rol === "admin" ? "Administrador" : `Asesor (${perfil.codigo_vendedor || ""})`;
    document.querySelectorAll(".solo-admin").forEach((el) => (el.hidden = !esAdmin()));
    await cargarDatos();
    $("vista-login").hidden = true;
    $("vista-app").hidden = false;
  }

  async function iniciar() {
    // 1. Revisar si hay sesión local activa recordada
    const sesionLocal = cargarSesionLocal();
    if (sesionLocal) {
      await entrarConPerfil(sesionLocal);
      $("cargando").hidden = true;
      return;
    }

    // 2. Revisar si hay sesión en Supabase Auth
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session) {
        await entrar();
        $("cargando").hidden = true;
        return;
      }
    } catch {}

    // Precargar datos en segundo plano para tener el catálogo y las claves de Excel al instante
    cargarDatos().catch((e) => console.warn("Precarga inicial:", e));

    mostrarLogin();
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

    const userInput = ($("login-correo")?.value || "").trim();
    const passInput = ($("login-clave")?.value || "").trim();
    const userLower = userInput.toLowerCase();
    const passLower = passInput.toLowerCase();

    const passAceptadas = (C.CLAVES_ACEPTADAS || ["beval2026", "beval", "123456", "admin"]).map((x) => x.toLowerCase());

    // 1. Acceso Administrador (admin, lolimar, carolina, gerencia, cobranzas, sistemas o @beval.biz)
    const admins = ["admin", "lolimar", "carolina", "gerencia", "sistemas", "cobranzas"];
    if (admins.includes(userLower) || userInput.endsWith("@beval.biz")) {
      if (passAceptadas.includes(passLower) || passInput === "admin" || passInput === "beval2026" || passInput === "beval") {
        if (btn) btn.disabled = false;
        await entrarConPerfil({
          rol: "admin",
          nombre: userInput.includes("@") ? userInput.split("@")[0].toUpperCase() : userInput.toUpperCase(),
          codigo_vendedor: null,
        });
        return;
      }
    }

    // 2. Acceso Asesor Comercial por Primer Nombre, Código, Zona o Correo
    const v = buscarVendedor(userInput);
    const primerNombreV = v?.nombre ? normalizarTexto(v.nombre).split(" ")[0].toLowerCase() : "";
    const codV = String(v?.codigo || "").replace(/^Z0*/, "").toLowerCase();

    // 2.1 Clave personalizada editada en Excel / Google Sheets (columna 17 / Q)
    const claveDeExcel = estado.clavesExcel?.get(v?.nombre?.toUpperCase()) ||
                         estado.clavesExcel?.get(primerNombreV.toUpperCase()) ||
                         estado.clavesExcel?.get(userLower.toUpperCase()) ||
                         (codV && estado.clavesExcel?.get(codV));

    // 2.2 Clave configurada en config.js (CLAVES_VENDEDORES)
    const claveConfig = C.CLAVES_VENDEDORES && (
      C.CLAVES_VENDEDORES[userLower] ||
      C.CLAVES_VENDEDORES[primerNombreV] ||
      C.CLAVES_VENDEDORES[codV] ||
      C.CLAVES_VENDEDORES[v?.codigo]
    );

    // 2.3 Validación de contraseña ultra flexible y sencilla:
    // - Si el usuario definió clave en Excel: la valida directamente
    // - Si la configuró en config.js: la valida directamente
    // - Si no la configuró: admite su PRIMER NOMBRE, su CÓDIGO, 'beval', 'beval2026', o '123456'
    let claveValida = false;
    if (claveDeExcel) {
      claveValida = (passInput === claveDeExcel || passAceptadas.includes(passLower));
    } else if (claveConfig) {
      claveValida = (passInput === claveConfig || passAceptadas.includes(passLower));
    } else {
      claveValida =
        passAceptadas.includes(passLower) ||
        (primerNombreV && passLower === primerNombreV) ||
        (userLower && passLower === userLower) ||
        (codV && passLower === codV) ||
        passLower === "beval" ||
        passLower === "beval2026" ||
        passLower === "123456";
    }

    if (v && v.nombre && claveValida) {
      if (btn) btn.disabled = false;
      await entrarConPerfil({
        rol: "vendedor",
        nombre: v.nombre,
        codigo_vendedor: v.nombre,
        codigo_num: v.codigo || codV,
        zona: v.zona || null,
      });
      return;
    }

    // 3. Fallback a Supabase Auth estándar si existiese cuenta registrada
    let usuarioSupa = userLower;
    if (!usuarioSupa.includes("@")) usuarioSupa = `v${usuarioSupa}@${C.DOMINIO_VENDEDORES}`;
    try {
      const { error } = await sb.auth.signInWithPassword({ email: usuarioSupa, password: passInput });
      if (!error) {
        if (btn) btn.disabled = false;
        await entrar();
        return;
      }
    } catch {}

    if (btn) btn.disabled = false;
    $("login-error").textContent = "Acceso incorrecto. Asesor: escribe tu primer nombre (ej. angel, ronny) y tu contraseña (tu primer nombre o beval).";
    $("login-error").hidden = false;
  });

  $("btn-salir")?.addEventListener("click", async () => {
    limpiarSesionLocal();
    try { await sb.auth.signOut(); } catch {}
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

    // 1. Análisis de Zonas para determinar el VENDEDOR ACTIVO actual de cada zona
    // (el que tenga facturas más recientes de noviembre 2026 y mayor volumen en esa zona)
    const zonaStats = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 3 || !r[2]) continue;
      const zona = (r[9] || "").trim();
      const vend = (r[10] || "").trim();
      const fEmision = parseFechaIso(r[3]);
      if (!zona || !vend) continue;
      if (!zonaStats.has(zona)) zonaStats.set(zona, new Map());
      const zMap = zonaStats.get(zona);
      const stat = zMap.get(vend) || { maxFecha: "", count: 0 };
      stat.count++;
      if (fEmision > stat.maxFecha) stat.maxFecha = fEmision;
      zMap.set(vend, stat);
    }

    const mapaZonaActivo = new Map();
    for (const [z, zMap] of zonaStats.entries()) {
      // Filtrar cuentas internas que no son asesores como TRANSPORTE o PROVEEDORES
      const cand = [...zMap.entries()].filter(([v]) => v !== "TRANSPORTE" && v !== "PROVEEDORES");
      const listaCand = cand.length > 0 ? cand : [...zMap.entries()];
      listaCand.sort((a, b) => {
        const dComp = (b[1].maxFecha || "").localeCompare(a[1].maxFecha || "");
        if (dComp !== 0) return dComp;
        return b[1].count - a[1].count;
      });
      if (listaCand.length > 0) {
        mapaZonaActivo.set(z, listaCand[0][0]);
      }
    }

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
      const vendedorOriginal = (r[10] || "").trim();
      const analista = (r[11] || "").trim();
      const estadoFila = (r[12] || "").trim().toUpperCase() || "SIN RETENCION";
      const correoCliente = (r[13] || "").trim();
      const correoVendedor = (r[14] || "").trim();
      const ultimaAct = (r[15] || "").trim();

      const diasV = calcularDiasVencida(fVence);
      const estimado = montoRetencion > 0
        ? montoRetencion
        : (montoDolar > 0 ? Math.round(montoDolar * (12.0 / 116.0) * 100) / 100 : 0);

      // Reasignación a vendedor activo de la zona
      const activoDeZona = mapaZonaActivo.get(zona) || vendedorOriginal;
      const esInterno = (vendedorOriginal === "TRANSPORTE" || vendedorOriginal === "PROVEEDORES");
      const vendedorFinal = esInterno ? vendedorOriginal : activoDeZona;
      const esReasignado = (vendedorFinal !== vendedorOriginal);

      // Columna 17 (índice 16 en base 0): si el usuario coloca una columna CLAVE en Excel o Google Sheets
      const claveDesdeExcel = (r[16] || "").trim();
      if (claveDesdeExcel && claveDesdeExcel.toUpperCase() !== "CLAVE" && claveDesdeExcel.toUpperCase() !== "PASSWORD") {
        estado.clavesExcel.set(vendedorFinal.toUpperCase(), claveDesdeExcel);
        estado.clavesExcel.set(vendedorOriginal.toUpperCase(), claveDesdeExcel);
        const pNom = normalizarTexto(vendedorFinal).split(" ")[0].toLowerCase();
        if (pNom) estado.clavesExcel.set(pNom, claveDesdeExcel);
        if (zona) estado.clavesExcel.set(zona.replace(/^Z0*/, "").toLowerCase(), claveDesdeExcel);
      }

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
        vendedor: vendedorFinal,
        vendedor_original: vendedorOriginal,
        es_reasignado: esReasignado,
        es_interno: esInterno,
        vendedor_nombre: vendedorFinal,
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

      // Determinar mapa de vendedor activo por zona también en el respaldo de Supabase
      const zonaStatsSb = new Map();
      facturasSb.forEach((f) => {
        const zona = (f.zona || "").trim();
        const vend = (f.vendedor || "").trim();
        const fEmision = f.fecha_emision || "";
        if (!zona || !vend) return;
        if (!zonaStatsSb.has(zona)) zonaStatsSb.set(zona, new Map());
        const zMap = zonaStatsSb.get(zona);
        const stat = zMap.get(vend) || { maxFecha: "", count: 0 };
        stat.count++;
        if (fEmision > stat.maxFecha) stat.maxFecha = fEmision;
        zMap.set(vend, stat);
      });

      const mapaZonaActivoSb = new Map();
      for (const [z, zMap] of zonaStatsSb.entries()) {
        const cand = [...zMap.entries()].filter(([v]) => v !== "TRANSPORTE" && v !== "PROVEEDORES");
        const listaCand = cand.length > 0 ? cand : [...zMap.entries()];
        listaCand.sort((a, b) => {
          const dComp = (b[1].maxFecha || "").localeCompare(a[1].maxFecha || "");
          if (dComp !== 0) return dComp;
          return b[1].count - a[1].count;
        });
        if (listaCand.length > 0) {
          mapaZonaActivoSb.set(z, listaCand[0][0]);
        }
      }

      facturasCargadas = facturasSb.map((f) => {
        const montoDolar = Number(f.monto_dolar) || 0;
        const montoEst = Number(f.monto_estimado);
        const montoRet = Number(f.monto_retencion) || 0;
        const estimado = montoRet > 0 ? montoRet : (montoEst && !isNaN(montoEst) && montoEst > 0 ? montoEst : (montoDolar > 0 ? Math.round(montoDolar * (12.0 / 116.0) * 100) / 100 : 0));
        const vendedorOrig = (f.vendedor || "").trim();
        const activoZona = mapaZonaActivoSb.get(f.zona) || vendedorOrig;
        const esInterno = (vendedorOrig === "TRANSPORTE" || vendedorOrig === "PROVEEDORES");
        const vendedorFinal = esInterno ? vendedorOrig : activoZona;

        return {
          ...f,
          vendedor: vendedorFinal,
          vendedor_original: vendedorOrig,
          es_reasignado: vendedorFinal !== vendedorOrig,
          es_interno: esInterno,
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
    let vendedoresSb = [...(C.VENDEDORES_DEFAULT || [])];
    try {
      const dbVends = await todo("vendedores");
      if (dbVends && dbVends.length > 0) {
        vendedoresSb = dbVends;
      }
    } catch (e) {
      console.warn("No se pudo cargar tabla vendedores de Supabase (usando directorio base):", e);
    }

    estado.vendedores = new Map();
    vendedoresSb.forEach((v) => {
      if (v.codigo) estado.vendedores.set(v.codigo, v);
      if (v.nombre) estado.vendedores.set(v.nombre.trim().toUpperCase(), v);
    });

    // Mapear inteligentemente todos los vendedores presentes en las facturas
    estado.facturas.forEach((f) => {
      const nom = (f.vendedor || "").trim();
      const nomKey = nom.toUpperCase();
      if (nom) {
        const match = buscarVendedor(nom, vendedoresSb, f.zona);
        const yaExistente = estado.vendedores.get(nomKey);
        const objVend = {
          codigo: match.codigo || yaExistente?.codigo || (f.zona ? f.zona.replace(/^Z0*/, "") : nomKey),
          nombre: nom,
          telefono: yaExistente?.telefono || match.telefono || "",
          zona: f.zona || match.zona || yaExistente?.zona || "",
          correo: f.correo_vendedor || match.correo || yaExistente?.correo || ""
        };
        estado.vendedores.set(nomKey, objVend);
        if (objVend.codigo && !estado.vendedores.has(objVend.codigo)) {
          estado.vendedores.set(objVend.codigo, objVend);
        }
      }
    });

    // 3. Poblar selectores de filtros dinámicos
    const listaAnalistas = [...new Set(estado.facturas.map((f) => f.analista))].filter(Boolean);
    llenarSelect("f-analista", listaAnalistas);

    const listaVendedores = [...new Set(estado.facturas.map((f) => f.vendedor))].filter(Boolean);
    llenarSelect("f-vendedor", listaVendedores, (v) => {
      const obj = buscarVendedor(v);
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
    const vendedorFijo = estado.perfil && !esAdmin() ? estado.perfil.codigo_vendedor : null;

    return lista.filter((f) => {
      // Filtro especial activo por comprobante digital cargado
      if (estado.filtroComprobante && estado.filtroComprobante.facturas?.length > 0) {
        const setComp = new Set(estado.filtroComprobante.facturas.map((x) => String(x).trim()));
        if (!setComp.has(String(f.factura).trim())) {
          return false;
        }
      }
      if (vendedorFijo) {
        const nomVend = (f.vendedor || "").trim().toUpperCase();
        const objVend = buscarVendedor(nomVend);
        const codZona = (f.zona || "").replace(/^Z0*/, "");
        const fijLimpio = normalizarTexto(vendedorFijo);
        const nomLimpio = normalizarTexto(nomVend);
        const matchNombre = nomLimpio === fijLimpio || nomLimpio.includes(fijLimpio) || fijLimpio.includes(nomLimpio);
        if (
          f.vendedor !== vendedorFijo &&
          nomVend !== vendedorFijo.toUpperCase() &&
          !matchNombre &&
          objVend?.codigo !== vendedorFijo &&
          codZona !== vendedorFijo
        ) {
          return false;
        }
      }
      if (v) {
        const nomVend = (f.vendedor || "").trim().toUpperCase();
        const objVend = buscarVendedor(nomVend);
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
          f.vendedor_original,
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
        const objVend = buscarVendedor(selVend);
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
          const obj = buscarVendedor(nomVend);
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

    let compAsociado = "";
    for (const [cNum, cData] of Object.entries(estado.comprobantesAsociados || {})) {
      if (cData.facturas && cData.facturas.includes(String(f.factura).trim())) {
        compAsociado = cNum;
        break;
      }
    }
    const badgeComprobante = compAsociado
      ? `<span class="badge-comprobante-cargado" title="Comprobante digital cargado: ${esc(compAsociado)}">📄 ${esc(compAsociado)}</span>`
      : "";

    const clienteHtml = `
      <div class="cliente-consolidado" title="${esc(f.razon_social)} · ${esc(f.codigo_cliente)}">
        <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
        <button type="button" class="cliente-codigo-btn" data-copiar-codigo="${esc(f.codigo_cliente)}" title="Toca para copiar código ${esc(f.codigo_cliente)}">
          <span class="cod-icono">📋</span>
          <span class="cod-txt">${esc(f.codigo_cliente || "")}</span>
        </button>
        ${badgeDias}
        ${badgeComprobante}
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

  // Listener para editar / guardar teléfono de asesor comercial
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-editar-tel]");
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const cod = btn.dataset.editarTel;
    const v = buscarVendedor(cod);
    const actual = v.telefono || "";
    const nuevo = prompt(`Ingresa o edita el número de WhatsApp para el asesor:\n\n${v.nombre || cod}\n\nEjemplo: 04141234567 o 584141234567\n(Deja en blanco para borrar):`, actual);
    if (nuevo === null) return;
    const limpio = nuevo.trim();
    guardarTelefonoCustom(cod, limpio);
    if (estado.vendedores.has(cod.toUpperCase())) {
      estado.vendedores.get(cod.toUpperCase()).telefono = limpio;
    }
    pintarVendedores();
    actualizarModalMasivo();
    aviso(limpio ? `📱 Teléfono guardado para ${v.nombre || cod}: ${limpio}` : `Teléfono eliminado para ${v.nombre || cod}`);
  });

  // ---------- TABLA 3: VENDEDORES ----------
  function grupos(lista) {
    const m = new Map();
    lista.forEach((f) => {
      // Excluir cuentas no comerciales o internas de la lista de cobranza a asesores
      if (f.es_interno || f.vendedor === "TRANSPORTE" || f.vendedor === "PROVEEDORES") return;
      const vKey = f.vendedor || "Sin registrar";
      if (!m.has(vKey)) m.set(vKey, []);
      m.get(vKey).push(f);
    });
    return [...m.entries()].map(([vendNom, fs]) => {
      const totalFact = fs.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
      const saldoPend = fs.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
      const cobrado = Math.max(0, totalFact - saldoPend);
      const avancePct = totalFact > 0 ? Math.min(100, Math.round((cobrado / totalFact) * 100)) : 0;
      const fsVencidas = fs.filter((f) => f.dias_vencida > 0);
      const r = {
        facturas: fs.length,
        estimado: fs.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0),
        vencidas: fsVencidas.length,
        estimadoVencidas: fsVencidas.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0),
        saldoVencido: fsVencidas.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0),
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
      const v = buscarVendedor(cod, null, zona);
      const codIdent = v.codigo || (zona ? zona.replace(/^Z0*/, "") : cod);
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
      const tieneTel = !!v.telefono;
      const telBtnHtml = tieneTel
        ? `<button type="button" class="btn-editar-tel" data-editar-tel="${esc(cod)}" title="Clic para editar número de WhatsApp">📱 ${esc(v.telefono)} ✏️</button>`
        : `<button type="button" class="btn-editar-tel sin-tel" data-editar-tel="${esc(cod)}" title="Clic para registrar número de WhatsApp">⚠️ Sin tel. ✏️ [+ Tel]</button>`;

      const celdaVendedor = `
        <div style="display: flex; flex-direction: column;">
          <strong style="color: var(--texto);">${esc(nombreLimpio)}</strong>
          <small style="color: var(--suave); font-size: 11px;">Código: ${esc(codIdent)}</small>
          ${telBtnHtml}
        </div>`;

      const waButtonsHtml = `
        <div class="acciones-wa-grupo">
          <button type="button" class="btn btn-wa-pill btn-wa-vencidas" data-wa="${esc(cod)}" data-modo="vencidas" title="Enviar WhatsApp solo de facturas vencidas (${r.vencidas}) y generar imagen">
            🔴 Vencidas (${r.vencidas})
          </button>
          <button type="button" class="btn btn-wa-pill btn-wa-todas" data-wa="${esc(cod)}" data-modo="todas" title="Enviar WhatsApp de cartera completa (${r.facturas}) y generar imagen">
            📋 Todas (${r.facturas})
          </button>
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
          ${waButtonsHtml}
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

  // ---------- GENERADOR DE IMAGEN / TARJETA VISUAL DE COBRANZA (CANVAS PNG) ----------
  async function generarImagenReporteCobranza(vendedorNom, listaFacturas, esSoloVencidas) {
    const width = 840;
    const padding = 28;
    const rowHeight = 28;
    const headerHeight = 150;
    const totalRows = listaFacturas.length;
    const height = Math.max(380, headerHeight + (totalRows * rowHeight) + 90);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Fondo general blanco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Cabecera superior Beval Blue (#0b2341)
    ctx.fillStyle = "#0b2341";
    ctx.fillRect(0, 0, width, 125);

    // Línea de acento verde Beval (#84cc16)
    ctx.fillStyle = "#84cc16";
    ctx.fillRect(0, 125, width, 5);

    // Título Principal
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'Inter', sans-serif, Arial";
    ctx.fillText("DISTRIBUIDORA BEVAL, C.A.", padding, 38);

    // Subtítulo según modo
    ctx.fillStyle = esSoloVencidas ? "#f87171" : "#38bdf8";
    ctx.font = "bold 13px 'Inter', sans-serif, Arial";
    const subTit = esSoloVencidas
      ? "🔴 REPORTE DE RETENCIONES DE IVA · SOLO FACTURAS VENCIDAS"
      : "📋 ESTADO DE CUENTA DE RETENCIONES · CARTERA COMPLETA";
    ctx.fillText(subTit, padding, 62);

    // Datos del Asesor y Fecha
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "13px 'Inter', sans-serif, Arial";
    const hoyStr = new Date().toLocaleDateString("es-VE", { year: "numeric", month: "short", day: "numeric" });
    const zonaTxt = listaFacturas[0]?.zona ? `Zona: ${listaFacturas[0].zona}   |   ` : "";
    ctx.fillText(`Asesor Comercial: ${vendedorNom}   |   ${zonaTxt}Fecha de Corte: ${hoyStr}`, padding, 88);
    ctx.fillText(`Total Facturas: ${totalRows} documento(s) en seguimiento`, padding, 108);

    // Cabecera de la tabla
    const tableY = 145;
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(padding, tableY, width - (padding * 2), 30);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 11px 'Inter', sans-serif, Arial";
    ctx.fillText("FACTURA", padding + 10, tableY + 19);
    ctx.fillText("CLIENTE / RAZÓN SOCIAL", padding + 95, tableY + 19);
    ctx.fillText("VENCE", padding + 460, tableY + 19);
    ctx.fillText("DÍAS", padding + 550, tableY + 19);
    ctx.fillText("ESTIMADO RET.", width - padding - 115, tableY + 19);

    // Filas de facturas
    let curY = tableY + 30;
    ctx.font = "11px 'Inter', sans-serif, Arial";

    for (let i = 0; i < totalRows; i++) {
      const f = listaFacturas[i];
      if (i % 2 === 1) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(padding, curY, width - (padding * 2), rowHeight);
      }

      // Línea divisoria
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(padding, curY + rowHeight - 1, width - (padding * 2), 1);

      // Factura
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11px 'Inter', sans-serif, Arial";
      ctx.fillText(String(f.factura || ""), padding + 10, curY + 18);

      // Cliente (truncado suave si es muy largo)
      ctx.font = "11px 'Inter', sans-serif, Arial";
      ctx.fillStyle = "#334155";
      const nomCliente = (f.razon_social || f.codigo_cliente || "").substring(0, 48);
      ctx.fillText(nomCliente, padding + 95, curY + 18);

      // Vence
      ctx.fillStyle = "#64748b";
      ctx.fillText(fecha(f.fecha_vence) || "—", padding + 460, curY + 18);

      // Días Vencida
      const dias = Number(f.dias_vencida) || 0;
      if (dias > 0) {
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 11px 'Inter', sans-serif, Arial";
        ctx.fillText(`${dias}d`, padding + 550, curY + 18);
      } else {
        ctx.fillStyle = "#16a34a";
        ctx.font = "11px 'Inter', sans-serif, Arial";
        ctx.fillText("Al día", padding + 550, curY + 18);
      }

      // Estimado
      ctx.fillStyle = "#15803d";
      ctx.font = "bold 11px 'Inter', sans-serif, Arial";
      const estTxt = `$${usd(f.monto_estimado)}`;
      ctx.fillText(estTxt, width - padding - 115, curY + 18);

      curY += rowHeight;
    }

    // Pie con totales y marca Beval
    curY += 12;
    ctx.fillStyle = "#0b2341";
    ctx.fillRect(padding, curY, width - (padding * 2), 44);

    const totalEstimado = listaFacturas.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px 'Inter', sans-serif, Arial";
    ctx.fillText(`TOTAL: ${totalRows} FACTURAS`, padding + 16, curY + 27);

    ctx.fillStyle = "#84cc16";
    ctx.font = "bold 15px 'Inter', sans-serif, Arial";
    ctx.fillText(`ESTIMADO TOTAL: $${usd(totalEstimado)} USD`, width - padding - 310, curY + 27);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  // ---------- MENSAJES & WHATSAPP ----------
  function mensaje(cod, listaTotal, soloVencidas = false) {
    const zonaAsesor = listaTotal[0]?.zona || "";
    const v = buscarVendedor(cod, null, zonaAsesor);
    const nombreAsesor = v?.nombre || cod || "Asesor Comercial";

    if (soloVencidas) {
      // Filtrar estricto: ÚNICAMENTE facturas vencidas (dias_vencida > 0)
      const facturasVencidas = listaTotal.filter((f) => f.dias_vencida > 0);
      const cantVencidas = facturasVencidas.length;
      const totalEstimado = facturasVencidas.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);

      // Detalle exclusivo de vencidas: sin facturas al día ni texto de al día
      const lineasDetalle = facturasVencidas.map((f) => {
        const diasV = Number(f.dias_vencida) || 0;
        return `• Fact. ${f.factura} | ${f.razon_social} | Estimado Ret: $${usd(f.monto_estimado)} USD (${diasV} días vencida)`;
      });

      return `*DISTRIBUIDORA BEVAL, C.A.*\n` +
        `*RECORDATORIO DE RETENCIÓN DE IVA - FACTURAS VENCIDAS*\n\n` +
        `Estimado(a) *${nombreAsesor}*${zonaAsesor ? ` (Zona ${zonaAsesor})` : ""}:\n\n` +
        `Presentas un total de *${cantVencidas} FACTURA(S) VENCIDA(S)* pendientes de entrega de comprobante de retención de IVA, por un monto estimado a recuperar de *${usd(totalEstimado)} USD*.\n\n` +
        `*DETALLE DE FACTURAS VENCIDAS:*\n` +
        `${lineasDetalle.join("\n")}\n\n` +
        `📌 _Te adjunto la imagen gráfica oficial con el estado de cuenta de las facturas vencidas._\n` +
        `Por favor gestionar los comprobantes con tus clientes a la brevedad posible.\n` +
        `¡Muchas gracias por tu apoyo!`;
    } else {
      const cantFacturas = listaTotal.length;
      const totalEstimado = listaTotal.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
      const cantVencidasTotal = listaTotal.filter((f) => f.dias_vencida > 0).length;

      const lineasDetalle = listaTotal.map((f) => {
        const diasV = Number(f.dias_vencida) || 0;
        const estadoV = diasV > 0 ? ` ⚠️ (${diasV}d vencida)` : ` ⏳ (Al día)`;
        return `• Fact. ${f.factura} | ${f.razon_social} | Estimado Ret: $${usd(f.monto_estimado)} USD${estadoV}`;
      });

      return `*DISTRIBUIDORA BEVAL, C.A.*\n` +
        `*ESTADO DE CUENTA DE RETENCIONES DE IVA - CARTERA COMPLETA*\n\n` +
        `Estimado(a) *${nombreAsesor}*${zonaAsesor ? ` (Zona ${zonaAsesor})` : ""}:\n\n` +
        `Compartimos el resumen de tu cartera de retenciones de IVA pendientes:\n` +
        `• Facturas pendientes: *${cantFacturas}*\n` +
        `• De las cuales vencidas: *${cantVencidasTotal}*\n` +
        `• Monto estimado retención: *${usd(totalEstimado)} USD*\n\n` +
        `*DETALLE COMPLETO DE FACTURAS:*\n` +
        `${lineasDetalle.join("\n")}\n\n` +
        `📌 _Te adjunto la imagen gráfica con el estado de cuenta oficial._\n` +
        `Agradecemos tu oportuna gestión con cada cliente.\n` +
        `¡Éxito en la cobranza!`;
    }
  }

  function marcarWsEnviado(cod) {
    const v = buscarVendedor(cod);
    const codIdent = v.codigo || cod;
    estado.wsEnviados.add(codIdent);
    estado.wsEnviados.add(cod);
    guardarWsEnviados(estado.wsEnviados);
    pintarVendedores();
  }

  // Envío individual de WhatsApp con mensaje completo y descarga/copiado de imagen Canvas
  async function enviarWhatsAppVendedor(cod, soloVencidas = false) {
    const todasDelVendedor = estado.facturas.filter((f) => {
      const nomVend = (f.vendedor || "").trim().toUpperCase();
      return (f.vendedor === cod || nomVend === cod.toUpperCase()) && f.estado === "SIN RETENCION";
    });
    const zonaV = todasDelVendedor[0]?.zona || "";
    const v = buscarVendedor(cod, null, zonaV);
    const lista = soloVencidas
      ? todasDelVendedor.filter((f) => f.dias_vencida > 0)
      : todasDelVendedor;

    if (lista.length === 0) {
      aviso(soloVencidas ? `ℹ️ ${v.nombre || cod} no tiene facturas vencidas` : `ℹ️ ${v.nombre || cod} no tiene facturas pendientes`);
      return;
    }

    const textoMsg = mensaje(cod, lista, soloVencidas);

    // 1. Copiar texto al portapapeles garantizado
    try {
      await navigator.clipboard.writeText(textoMsg);
    } catch (err) {}

    // 2. Generar imagen canvas y preparar descarga / copiado
    try {
      const blob = await generarImagenReporteCobranza(v.nombre || cod, lista, soloVencidas);
      if (blob) {
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          } catch (eClip) {}
        }
        const nombreLimpio = (v.nombre || cod).replace(/[^a-zA-Z0-9_-]/g, "_");
        const urlImg = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = urlImg;
        a.download = `Reporte_${nombreLimpio}_${soloVencidas ? "Vencidas" : "Todas"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(urlImg), 25000);
      }
    } catch (errImg) {
      console.warn("Error al generar imagen de cobranza:", errImg);
    }

    // 3. Abrir WhatsApp Web
    let tel = (v?.telefono || "").replace(/\D/g, "");
    if (!tel && zonaV) {
      const fallbackV = buscarVendedor(zonaV, null, zonaV);
      tel = (fallbackV?.telefono || "").replace(/\D/g, "");
    }
    if (tel) {
      if (tel.startsWith("0")) tel = "58" + tel.slice(1);
      else if (!tel.startsWith("58")) tel = "58" + tel;
      const url = `https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(textoMsg)}`;
      window.open(url, "_blank", "noopener");
      marcarWsEnviado(cod);
      aviso(`✅ WhatsApp abierto para ${v.nombre || cod} con ${lista.length} facturas ${soloVencidas ? "vencidas" : "totales"}. ¡Imagen descargada lista para adjuntar!`);
    } else {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textoMsg)}`;
      window.open(url, "_blank", "noopener");
      marcarWsEnviado(cod);
      aviso(`📋 Mensaje copiado e imagen descargada. Elige a ${v.nombre || cod} en WhatsApp`);
    }
  }

  // Delegación de clic para botones WhatsApp de cada fila
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-wa]");
    if (!b) return;
    const cod = b.dataset.wa;
    const modo = b.dataset.modo || "vencidas";
    const soloVencidas = modo === "vencidas";
    await enviarWhatsAppVendedor(cod, soloVencidas);
  });

  $("btn-mensaje")?.addEventListener("click", async () => {
    const cod = $("f-vendedor")?.value || (esAdmin() ? "" : estado.perfil?.codigo_vendedor);
    const soloVencidas = $("f-estado")?.value === "vencidas";
    await navigator.clipboard.writeText(mensaje(cod, estado.filtradas, soloVencidas));
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

  // Selector de Modalidad en el Modal Masivo (Solo Vencidas vs Cartera Completa)
  $("btn-modo-vencidas")?.addEventListener("click", () => {
    estado.modoMasivo = "vencidas";
    $("btn-modo-vencidas")?.classList.add("activa");
    $("btn-modo-todas")?.classList.remove("activa");
    actualizarModalMasivo();
    aviso("Modo de envío masivo: Solo Facturas Vencidas");
  });

  $("btn-modo-todas")?.addEventListener("click", () => {
    estado.modoMasivo = "todas";
    $("btn-modo-todas")?.classList.add("activa");
    $("btn-modo-vencidas")?.classList.remove("activa");
    actualizarModalMasivo();
    aviso("Modo de envío masivo: Cartera Completa");
  });

  function actualizarModalMasivo() {
    const sinRet = estado.facturas.filter((f) => f.estado === "SIN RETENCION");
    const esModoVencidas = estado.modoMasivo !== "todas";
    const listaGrupos = grupos(sinRet);
    const total = listaGrupos.length;
    const enviados = listaGrupos.filter((g) => {
      const v = buscarVendedor(g.cod, null, g.zona);
      return estado.wsEnviados.has(g.cod) || (v?.codigo && estado.wsEnviados.has(v.codigo));
    }).length;
    const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;

    const progTxt = $("masivo-progreso-txt");
    const progBar = $("masivo-progreso-bar");
    if (progTxt) progTxt.textContent = `${enviados} de ${total} asesores (${pct}%)`;
    if (progBar) progBar.style.width = `${pct}%`;

    const proximo = listaGrupos.find((g) => {
      const v = buscarVendedor(g.cod, null, g.zona);
      return !estado.wsEnviados.has(g.cod) && (!v?.codigo || !estado.wsEnviados.has(v.codigo));
    });
    const btnSiguiente = $("btn-enviar-siguiente");

    if (proximo) {
      const v = buscarVendedor(proximo.cod, null, proximo.zona);
      const tel = v.telefono;
      const cantFact = esModoVencidas ? proximo.r.vencidas : proximo.r.facturas;
      const montoEst = esModoVencidas ? proximo.r.estimadoVencidas : proximo.r.estimado;
      const modoLabel = esModoVencidas ? "vencidas" : "totales";

      $("masivo-proximo-nombre").textContent = v.nombre || proximo.cod;
      $("masivo-proximo-detalles").textContent = `Zona ${proximo.zona || "—"} · ${ent(cantFact)} facturas ${modoLabel} · $${usd(montoEst)} USD ${tel ? `· 📱 ${tel}` : "· ℹ️ Se abrirá WhatsApp para seleccionar contacto"}`;
      if (btnSiguiente) {
        btnSiguiente.disabled = false;
        btnSiguiente.dataset.codProximo = proximo.cod;
        btnSiguiente.innerHTML = tel
          ? `<span>▶ Enviar a WhatsApp de ${esc(v.nombre || proximo.cod)} (${cantFact} ${modoLabel})</span>`
          : `<span>▶ Abrir WhatsApp para ${esc(v.nombre || proximo.cod)} (${cantFact} ${modoLabel})</span>`;
      }
    } else {
      $("masivo-proximo-nombre").textContent = "🎉 ¡Todos los asesores han sido contactados hoy!";
      $("masivo-proximo-detalles").textContent = "Puedes reiniciar los estados en cualquier momento si deseas enviar nuevamente.";
      if (btnSiguiente) {
        btnSiguiente.disabled = true;
        btnSiguiente.innerHTML = "<span>🎉 Todo enviado por hoy</span>";
        delete btnSiguiente.dataset.codProximo;
      }
    }
    actualizarContadorSeleccionados();
  }

  $("btn-enviar-siguiente")?.addEventListener("click", async () => {
    const cod = $("btn-enviar-siguiente")?.dataset.codProximo;
    if (!cod) return;
    const esModoVencidas = estado.modoMasivo !== "todas";
    await enviarWhatsAppVendedor(cod, esModoVencidas);
    actualizarModalMasivo();
  });

  $("btn-copiar-todos-ws")?.addEventListener("click", async () => {
    const sinRet = estado.facturas.filter((f) => f.estado === "SIN RETENCION");
    const esModoVencidas = estado.modoMasivo !== "todas";
    const listaGrupos = grupos(sinRet);
    const separador = "\n" + "=".repeat(45) + "\n\n";
    const textoCompleto = listaGrupos.map(({ cod, fs }) => mensaje(cod, fs, esModoVencidas)).join(separador);
    await navigator.clipboard.writeText(textoCompleto);
    aviso(`📋 Se han copiado todos los mensajes (${esModoVencidas ? "Solo Vencidas" : "Cartera Completa"}) al portapapeles`);
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

  // ========================================================
  // CARGA DE COMPROBANTE Y ASOCIACIÓN INTELIGENTE (OCR / IA)
  // ========================================================
  const modalComp = $("modal-comprobante");
  const dropzoneComp = $("dropzone-comprobante");
  const fileInputComp = $("input-file-comprobante");
  const procesandoComp = $("comprobante-procesando");
  const resultadosComp = $("comprobante-resultados");

  function abrirModalComprobante() {
    if (!modalComp) return;
    modalComp.hidden = false;
    if (estado.comprobanteActivo.facturas.size === 0) {
      limpiarModalComprobante();
    }
  }

  function cerrarModalComprobante() {
    if (modalComp) modalComp.hidden = true;
  }

  function limpiarModalComprobante() {
    estado.comprobanteActivo = {
      numero: "",
      fecha: "",
      cliente: "",
      facturas: new Map(),
    };
    if (fileInputComp) fileInputComp.value = "";
    if (dropzoneComp) dropzoneComp.hidden = false;
    if (procesandoComp) procesandoComp.hidden = true;
    if (resultadosComp) resultadosComp.hidden = true;
    if ($("comp-input-numero")) $("comp-input-numero").value = "";
    if ($("comp-input-fecha")) $("comp-input-fecha").value = "";
    if ($("comp-input-cliente")) $("comp-input-cliente").value = "";
    if ($("comp-buscador-asistente")) $("comp-buscador-asistente").value = "";
    if ($("comp-sugerencias-dropdown")) $("comp-sugerencias-dropdown").hidden = true;
    if ($("comp-otras-facturas-cliente")) $("comp-otras-facturas-cliente").hidden = true;
    if ($("comp-lista-facturas")) $("comp-lista-facturas").innerHTML = "";
    actualizarTotalesComprobante();
  }

  $("btn-abrir-comprobante-nav")?.addEventListener("click", abrirModalComprobante);
  $("btn-comprobante-accion")?.addEventListener("click", abrirModalComprobante);
  $("btn-comprobante-accion-proc")?.addEventListener("click", abrirModalComprobante);
  $("btn-cerrar-modal-comp")?.addEventListener("click", cerrarModalComprobante);
  $("btn-comp-limpiar")?.addEventListener("click", limpiarModalComprobante);

  modalComp?.addEventListener("click", (e) => {
    if (e.target === modalComp) cerrarModalComprobante();
  });

  // Drag and Drop
  $("btn-seleccionar-archivo")?.addEventListener("click", () => fileInputComp?.click());
  dropzoneComp?.addEventListener("click", (e) => {
    if (e.target !== $("btn-seleccionar-archivo")) fileInputComp?.click();
  });

  dropzoneComp?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzoneComp.classList.add("dragover");
  });

  dropzoneComp?.addEventListener("dragleave", () => {
    dropzoneComp.classList.remove("dragover");
  });

  dropzoneComp?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzoneComp.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      procesarArchivoComprobante(e.dataTransfer.files[0]);
    }
  });

  fileInputComp?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      procesarArchivoComprobante(e.target.files[0]);
    }
  });

  async function procesarArchivoComprobante(file) {
    if (!file) return;
    if (dropzoneComp) dropzoneComp.hidden = true;
    if (procesandoComp) procesandoComp.hidden = false;
    if (resultadosComp) resultadosComp.hidden = true;

    let textoExtraido = "";

    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        if (window.pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            textoExtraido += content.items.map((it) => it.str).join(" ") + "\n";
          }
        }
      }
    } catch (err) {
      console.warn("No se pudo extraer texto directo del PDF:", err);
    }

    analizarTextoComprobante(textoExtraido, file.name);
  }

  function analizarTextoComprobante(texto, fileName) {
    if (procesandoComp) procesandoComp.hidden = true;
    if (resultadosComp) resultadosComp.hidden = false;

    // 1. Extraer número de comprobante (14 dígitos SENIAT o similar)
    let numComp = "";
    const mSeniat = texto.match(/\b(202[0-9]{11})\b/);
    if (mSeniat) {
      numComp = mSeniat[1];
    } else {
      const mRet = texto.match(/(?:COMPROBANTE|RETENCI[OÓ]N|N[°º.]*)[\s:]*([A-Z0-9\-_]{6,25})/i);
      if (mRet) numComp = mRet[1];
    }
    if (!numComp && fileName) {
      const mFile = fileName.match(/(202\d{11}|\d{6,14})/);
      if (mFile) numComp = mFile[1];
    }

    // 2. Extraer fecha
    let fechaComp = "";
    const mFecha = texto.match(/\b([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-]202[0-9])\b/);
    if (mFecha) fechaComp = mFecha[1].replace(/-/g, "/");
    else fechaComp = new Date().toLocaleDateString("es-VE");

    // 3. Extraer RIF
    let rifComp = "";
    const mRif = texto.match(/\b([JVEGP][\- ]?[0-9]{8,9}[\- ]?[0-9])\b/i);
    if (mRif) rifComp = mRif[1].replace(/\s+/g, "-").toUpperCase();

    // 4. Buscar facturas coincidentes en la base de datos de Beval
    const facturasDetectadas = new Map();
    const mapaFacturas = new Map();

    estado.facturas.forEach((f) => {
      const facLimpia = String(f.factura).trim();
      mapaFacturas.set(facLimpia, f);
      mapaFacturas.set(facLimpia.padStart(8, "0"), f);
    });

    if (texto) {
      const numeros = texto.match(/\b\d{6,9}\b/g) || [];
      const unicos = [...new Set(numeros)];
      for (const num of unicos) {
        const sinCeros = num.replace(/^0+/, "");
        if (mapaFacturas.has(num)) {
          const f = mapaFacturas.get(num);
          facturasDetectadas.set(String(f.factura).trim(), f);
        } else if (mapaFacturas.has(sinCeros)) {
          const f = mapaFacturas.get(sinCeros);
          facturasDetectadas.set(String(f.factura).trim(), f);
        }
      }
    }

    let clienteNombre = "";
    if (facturasDetectadas.size > 0) {
      const primera = [...facturasDetectadas.values()][0];
      clienteNombre = primera.razon_social || primera.codigo_cliente;
    } else if (rifComp) {
      const matchRif = estado.facturas.find((f) => (f.rif || "").replace(/\D/g, "") === rifComp.replace(/\D/g, ""));
      if (matchRif) clienteNombre = matchRif.razon_social || matchRif.codigo_cliente;
    }

    estado.comprobanteActivo = {
      numero: numComp,
      fecha: fechaComp,
      cliente: clienteNombre || rifComp,
      facturas: facturasDetectadas,
    };

    if ($("comp-input-numero")) $("comp-input-numero").value = numComp;
    if ($("comp-input-fecha")) $("comp-input-fecha").value = fechaComp;
    if ($("comp-input-cliente")) $("comp-input-cliente").value = clienteNombre || rifComp;

    pintarListaFacturasComprobante();
    actualizarOtrasFacturasCliente();

    if (facturasDetectadas.size > 0) {
      aviso(`✅ ¡Lectura exitosa! Se detectaron ${facturasDetectadas.size} facturas automáticamente.`);
    } else {
      aviso("ℹ️ Documento cargado. Usa el asistente abajo para asociar las facturas.");
    }
  }

  function pintarListaFacturasComprobante() {
    const contenedor = $("comp-lista-facturas");
    if (!contenedor) return;
    const lista = [...estado.comprobanteActivo.facturas.values()];

    if (lista.length === 0) {
      contenedor.innerHTML = `<div style="text-align: center; padding: 18px; color: var(--suave); font-size: 13px;">
        Aún no hay facturas asociadas a este comprobante.<br>
        Usa el buscador del asistente abajo para agregar las facturas correspondientes.
      </div>`;
    } else {
      contenedor.innerHTML = lista.map((f) => `
        <div class="comp-fac-item" data-fac="${esc(f.factura)}">
          <div class="comp-fac-left">
            <span class="badge-fac-num">#${esc(f.factura)}</span>
            <div>
              <div class="comp-fac-cliente">${esc(f.razon_social || "Sin cliente")}</div>
              <small style="color: var(--suave);">Zona: ${esc(f.zona || "—")} · Asesor: ${esc(f.vendedor || "—")}</small>
            </div>
          </div>
          <div class="comp-fac-right">
            <div class="comp-fac-montos">
              <strong>$${usd(f.monto_dolar)} USD</strong>
              <small>Ret. Est.: $${usd(f.monto_estimado)}</small>
            </div>
            <button type="button" class="btn-quitar-fac" data-quitar-fac="${esc(f.factura)}" title="Quitar de este comprobante">✕</button>
          </div>
        </div>
      `).join("");
    }

    actualizarTotalesComprobante();
  }

  function actualizarTotalesComprobante() {
    const lista = [...estado.comprobanteActivo.facturas.values()];
    const totalFacturado = lista.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const totalRetenido = lista.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);

    const txtCont = $("comp-conteo-facturas");
    const txtTot = $("comp-totales-txt");
    if (txtCont) txtCont.textContent = lista.length;
    if (txtTot) txtTot.textContent = `Total: $${usd(totalFacturado)} USD · Retención Est.: $${usd(totalRetenido)} USD`;
  }

  // Quitar factura del comprobante
  $("comp-lista-facturas")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-quitar-fac]");
    if (!btn) return;
    const facNum = btn.dataset.quitarFac;
    estado.comprobanteActivo.facturas.delete(facNum);
    pintarListaFacturasComprobante();
    actualizarOtrasFacturasCliente();
  });

  // Asistente Inteligente: Buscador y sugerencias interactivas
  const inputAsistente = $("comp-buscador-asistente");
  const dropdownSugerencias = $("comp-sugerencias-dropdown");

  inputAsistente?.addEventListener("input", () => {
    const query = inputAsistente.value.trim().toLowerCase();
    if (!query || query.length < 2) {
      if (dropdownSugerencias) dropdownSugerencias.hidden = true;
      return;
    }

    const coincidencias = estado.facturas.filter((f) => {
      if (estado.comprobanteActivo.facturas.has(String(f.factura).trim())) return false;
      const numFac = String(f.factura || "").toLowerCase();
      const cliNom = String(f.razon_social || "").toLowerCase();
      const cliCod = String(f.codigo_cliente || "").toLowerCase();
      return numFac.includes(query) || cliNom.includes(query) || cliCod.includes(query);
    }).slice(0, 8);

    if (coincidencias.length === 0) {
      dropdownSugerencias.innerHTML = `<div style="padding: 10px 14px; color: var(--suave); font-size: 12px;">No se encontraron facturas pendientes con "${esc(query)}"</div>`;
      dropdownSugerencias.hidden = false;
      return;
    }

    dropdownSugerencias.innerHTML = coincidencias.map((f) => `
      <div class="sugerencia-item" data-agregar-fac="${esc(f.factura)}">
        <div>
          <strong>#${esc(f.factura)}</strong> · ${esc(f.razon_social)}
          <div style="font-size: 11px; color: var(--suave);">Zona: ${esc(f.zona)} · Vence: ${fecha(f.fecha_vence)}</div>
        </div>
        <div style="text-align: right;">
          <strong style="color: var(--beval-blue);">$${usd(f.monto_dolar)}</strong>
          <button type="button" class="btn" style="padding: 2px 8px; font-size: 11px; margin-left: 8px;">+ Asociar</button>
        </div>
      </div>
    `).join("");
    dropdownSugerencias.hidden = false;
  });

  dropdownSugerencias?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-agregar-fac]");
    if (!item) return;
    const facNum = item.dataset.agregarFac;
    const f = estado.facturas.find((x) => String(x.factura).trim() === facNum);
    if (f) {
      estado.comprobanteActivo.facturas.set(facNum, f);
      if (!$("comp-input-cliente")?.value) {
        $("comp-input-cliente").value = f.razon_social || f.codigo_cliente;
        estado.comprobanteActivo.cliente = f.razon_social || f.codigo_cliente;
      }
      pintarListaFacturasComprobante();
      actualizarOtrasFacturasCliente();
    }
    inputAsistente.value = "";
    dropdownSugerencias.hidden = true;
  });

  function actualizarOtrasFacturasCliente() {
    const contenedorOtras = $("comp-otras-facturas-cliente");
    const listaOtras = $("comp-otras-cliente-lista");
    if (!contenedorOtras || !listaOtras) return;

    let clienteRef = "";
    if (estado.comprobanteActivo.facturas.size > 0) {
      const primera = [...estado.comprobanteActivo.facturas.values()][0];
      clienteRef = primera.codigo_cliente || primera.razon_social;
    } else {
      clienteRef = $("comp-input-cliente")?.value.trim();
    }

    if (!clienteRef) {
      contenedorOtras.hidden = true;
      return;
    }

    const otras = estado.facturas.filter((f) => {
      if (estado.comprobanteActivo.facturas.has(String(f.factura).trim())) return false;
      const matchCod = f.codigo_cliente && clienteRef.includes(f.codigo_cliente);
      const matchNom = f.razon_social && clienteRef.toUpperCase().includes(normalizarTexto(f.razon_social));
      const matchInv = f.razon_social && normalizarTexto(f.razon_social).includes(normalizarTexto(clienteRef));
      return matchCod || matchNom || matchInv;
    }).slice(0, 10);

    if (otras.length === 0) {
      contenedorOtras.hidden = true;
      return;
    }

    contenedorOtras.hidden = false;
    listaOtras.innerHTML = otras.map((f) => `
      <button type="button" class="btn-asociar-chip" data-chip-fac="${esc(f.factura)}" title="Monto: $${usd(f.monto_dolar)} USD · Ret: $${usd(f.monto_estimado)}">
        + #${esc(f.factura)} ($${usd(f.monto_dolar)})
      </button>
    `).join("");
  }

  $("comp-otras-cliente-lista")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-chip-fac]");
    if (!btn) return;
    const facNum = btn.dataset.chipFac;
    const f = estado.facturas.find((x) => String(x.factura).trim() === facNum);
    if (f) {
      estado.comprobanteActivo.facturas.set(facNum, f);
      pintarListaFacturasComprobante();
      actualizarOtrasFacturasCliente();
      aviso(`Factura #${facNum} asociada al comprobante`);
    }
  });

  // Acciones finales:
  // 1. Filtrar en la tabla principal
  $("btn-comp-filtrar-tabla")?.addEventListener("click", () => {
    const numComp = $("comp-input-numero")?.value.trim() || "Comprobante Digital";
    const facs = [...estado.comprobanteActivo.facturas.keys()];
    if (facs.length === 0) {
      aviso("⚠️ Agrega al menos una factura para filtrar");
      return;
    }

    estado.filtroComprobante = {
      numero: numComp,
      facturas: facs,
    };

    const bNum = $("banner-comp-num"), bCant = $("banner-comp-cant");
    const bNumP = $("banner-comp-num-proc"), bCantP = $("banner-comp-cant-proc");
    if (bNum) bNum.textContent = numComp;
    if (bCant) bCant.textContent = `(${facs.length} facturas)`;
    if (bNumP) bNumP.textContent = numComp;
    if (bCantP) bCantP.textContent = `(${facs.length} facturas)`;

    const banFac = $("banner-filtro-comp-facturas");
    const banProc = $("banner-filtro-comp-proc");
    if (banFac) banFac.hidden = false;
    if (banProc) banProc.hidden = false;

    aplicarFiltros();
    cerrarModalComprobante();
    aviso(`🔍 Tabla filtrada con las ${facs.length} facturas del comprobante`);
  });

  function quitarFiltroComprobante() {
    estado.filtroComprobante = null;
    const banFac = $("banner-filtro-comp-facturas");
    const banProc = $("banner-filtro-comp-proc");
    if (banFac) banFac.hidden = true;
    if (banProc) banProc.hidden = true;
    aplicarFiltros();
    aviso("Se ha quitado el filtro de comprobante y se muestran todas las facturas");
  }

  $("btn-quitar-filtro-comp")?.addEventListener("click", quitarFiltroComprobante);
  $("btn-quitar-filtro-comp-proc")?.addEventListener("click", quitarFiltroComprobante);

  // 2. Copiar resumen para WhatsApp
  $("btn-comp-copiar-ws")?.addEventListener("click", async () => {
    const numComp = $("comp-input-numero")?.value.trim() || "Sin número";
    const fechaComp = $("comp-input-fecha")?.value.trim() || fecha(new Date().toISOString().slice(0, 10));
    const cliNom = $("comp-input-cliente")?.value.trim() || "Cliente Beval";
    const lista = [...estado.comprobanteActivo.facturas.values()];

    if (lista.length === 0) {
      aviso("⚠️ Asocia al menos una factura antes de copiar el resumen");
      return;
    }

    const totalFac = lista.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const totalRet = lista.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);

    const lineas = lista.map((f) => `• Factura *#${f.factura}* | Monto: $${usd(f.monto_dolar)} | Ret. Est.: $${usd(f.monto_estimado)}`);

    const texto = `*COMPROBANTE DE RETENCIÓN RECIBIDO*\n\n` +
      `📄 *N° Comprobante:* ${numComp}\n` +
      `📅 *Fecha:* ${fechaComp}\n` +
      `🏢 *Cliente:* ${cliNom}\n\n` +
      `*Facturas amparadas (${lista.length}):*\n` +
      lineas.join("\n") +
      `\n\n📊 *Total Facturado:* $${usd(totalFac)} USD\n` +
      `💵 *Total Retención:* $${usd(totalRet)} USD\n` +
      `Estatus: En verificación / Conciliación`;

    await navigator.clipboard.writeText(texto);
    aviso("📋 Resumen para WhatsApp copiado al portapapeles con éxito");
  });

  // 3. Guardar Comprobante Asociado
  $("btn-comp-guardar")?.addEventListener("click", () => {
    const numComp = $("comp-input-numero")?.value.trim();
    if (!numComp) {
      aviso("⚠️ Por favor ingresa el número del comprobante");
      $("comp-input-numero")?.focus();
      return;
    }

    const facs = [...estado.comprobanteActivo.facturas.keys()];
    if (facs.length === 0) {
      aviso("⚠️ Asocia al menos una factura al comprobante");
      return;
    }

    const fechaComp = $("comp-input-fecha")?.value.trim() || fecha(new Date().toISOString().slice(0, 10));
    const clienteComp = $("comp-input-cliente")?.value.trim() || "";

    const dataComp = {
      numero: numComp,
      fecha: fechaComp,
      cliente: clienteComp,
      facturas: facs,
      timestamp: new Date().toISOString(),
    };

    guardarComprobanteEnStorage(dataComp);
    estado.comprobantesAsociados[numComp] = dataComp;

    pintarFacturas();
    pintarPorProcesar();
    cerrarModalComprobante();
    aviso(`💾 Comprobante ${numComp} guardado y asociado a ${facs.length} facturas`);
  });

  iniciar().catch((err) => {
    console.error("Error al iniciar aplicación:", err);
    $("cargando").textContent = "Error: " + err.message;
  });
})();