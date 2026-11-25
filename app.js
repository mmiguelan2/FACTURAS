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

  const eliminarComprobanteDeStorage = (num) => {
    try {
      const g = cargarComprobantesGuardados();
      delete g[num];
      localStorage.setItem(STORAGE_KEY_COMPROBANTES, JSON.stringify(g));
    } catch (e) {
      console.warn("No se pudo eliminar comprobante de localStorage", e);
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

  // ---------- GESTIÓN DE CREDENCIALES (USUARIOS Y CONTRASEÑAS) ----------
  const STORAGE_KEY_CREDENCIALES = "beval_credenciales_vendedores";

  const cargarCredencialesCustom = () => {
    try {
      const g = localStorage.getItem(STORAGE_KEY_CREDENCIALES);
      return g ? JSON.parse(g) : {};
    } catch {
      return {};
    }
  };

  const guardarCredencialCustom = (nomOcod, usuario, clave, asesorNom, zona) => {
    try {
      const g = cargarCredencialesCustom();
      const k = String(nomOcod || "").trim().toUpperCase();
      if (usuario && clave) {
        const item = {
          usuario: String(usuario).trim(),
          clave: String(clave).trim(),
          nombre: asesorNom || nomOcod,
          zona: zona || "",
          fecha: new Date().toISOString()
        };
        g[k] = item;
        if (asesorNom && asesorNom.trim().toUpperCase() !== k) {
          g[asesorNom.trim().toUpperCase()] = item;
        }
      } else {
        delete g[k];
        if (asesorNom) delete g[asesorNom.trim().toUpperCase()];
      }
      localStorage.setItem(STORAGE_KEY_CREDENCIALES, JSON.stringify(g));
    } catch (e) {
      console.warn("No se pudo guardar credencial en localStorage", e);
    }
  };

  const eliminarCredencialCustom = (nomOcod, asesorNom) => {
    try {
      const g = cargarCredencialesCustom();
      const k = String(nomOcod || "").trim().toUpperCase();
      delete g[k];
      if (asesorNom) delete g[asesorNom.trim().toUpperCase()];
      localStorage.setItem(STORAGE_KEY_CREDENCIALES, JSON.stringify(g));
    } catch (e) {
      console.warn("No se pudo eliminar credencial de localStorage", e);
    }
  };

  const obtenerCredencialVendedor = (nomOcod, zonaOpcional) => {
    const k = String(nomOcod || "").trim().toUpperCase();
    const v = buscarVendedor(nomOcod, null, zonaOpcional);
    const nombreV = v?.nombre || nomOcod || "";
    const pNom = normalizarTexto(nombreV).split(" ")[0].toLowerCase() || "asesor";
    const codNum = String(v?.codigo || (zonaOpcional ? String(zonaOpcional).replace(/^Z0*/, "") : "")).toLowerCase();
    const zonaNorm = String(v?.zona || zonaOpcional || "").toUpperCase();

    // 1. Revisar si hay credencial personalizada guardada en localStorage
    const creds = cargarCredencialesCustom();
    const custom = creds[k] || creds[nombreV.toUpperCase()] || (v?.codigo && creds[String(v.codigo).toUpperCase()]) || (zonaNorm && creds[zonaNorm]);
    if (custom && custom.usuario && custom.clave) {
      return {
        usuario: custom.usuario,
        clave: custom.clave,
        esPersonalizada: true,
        nombre: nombreV,
        zona: zonaNorm,
        primerNombre: pNom,
        codigo: codNum
      };
    }

    // 2. Si no hay personalizada, calcular los datos por defecto (usuario = primer nombre, clave = primer nombre o excel/config)
    const claveDeExcel = estado.clavesExcel?.get(nombreV.toUpperCase()) ||
                         estado.clavesExcel?.get(pNom.toUpperCase()) ||
                         (codNum && estado.clavesExcel?.get(codNum));

    const claveConfig = C.CLAVES_VENDEDORES && (
      C.CLAVES_VENDEDORES[pNom] ||
      C.CLAVES_VENDEDORES[codNum] ||
      C.CLAVES_VENDEDORES[v?.codigo]
    );

    const claveDefecto = claveDeExcel || claveConfig || pNom || "beval2026";
    const usuarioDefecto = pNom;

    return {
      usuario: usuarioDefecto,
      clave: claveDefecto,
      esPersonalizada: false,
      nombre: nombreV,
      zona: zonaNorm,
      primerNombre: pNom,
      codigo: codNum
    };
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

  function esFacturaDeAsesor(f, perfil) {
    if (!f || !perfil) return false;
    if (perfil.rol === "admin") return true;

    const vNom = (f.vendedor || "").trim();
    const objVend = buscarVendedor(vNom);
    const codF = String(objVend?.codigo || "").trim();
    const codZona = (f.zona || "").trim().toUpperCase().replace(/^Z0*/, "");

    const codPerfil = String(perfil.codigo_num || perfil.codigo_vendedor || "").trim().replace(/^Z0*/, "");
    const nomPerfil = normalizarTexto(perfil.nombre || "");
    const nomF = normalizarTexto(vNom);
    const zonaPerfil = (perfil.zona || "").trim().toUpperCase();
    const zonaF = (f.zona || "").trim().toUpperCase();

    // Coincidencia por código de asesor o código de zona
    if (codPerfil && (codF === codPerfil || codZona === codPerfil)) return true;
    // Coincidencia por nombre completo o primer nombre normalizado
    if (nomPerfil && (nomF === nomPerfil || nomF.includes(nomPerfil) || nomPerfil.includes(nomF))) return true;
    // Coincidencia por zona asignada del asesor
    if (zonaPerfil && zonaF === zonaPerfil) return true;
    // Coincidencia exacta de string
    if (perfil.codigo_vendedor && vNom.toUpperCase() === String(perfil.codigo_vendedor).toUpperCase()) return true;

    return false;
  }

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
    { campo: "factura", titulo: "Factura", ancho: "105px" },
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
    { campo: "factura", titulo: "Factura", ancho: "105px" },
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
    document.body.classList.toggle("es-admin", esAdmin());
    document.body.classList.toggle("es-vendedor", !esAdmin());
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

    // 2. Acceso Asesor Comercial (usuario personalizado, primer nombre, código, zona o correo)
    const credsCustom = cargarCredencialesCustom();
    let asesorEncontrado = null;
    let claveEsperadaCustom = null;

    // 2.0 Revisar si userInput coincide con algún nombre de usuario personalizado guardado
    for (const [vKey, c] of Object.entries(credsCustom)) {
      if (c && c.usuario && c.usuario.trim().toLowerCase() === userLower) {
        asesorEncontrado = buscarVendedor(vKey);
        claveEsperadaCustom = c.clave;
        break;
      }
    }

    // 2.1 Si no coincidió con usuario personalizado, buscar asesor por nombre, zona o código
    if (!asesorEncontrado) {
      asesorEncontrado = buscarVendedor(userInput);
    }

    if (asesorEncontrado && asesorEncontrado.nombre) {
      const v = asesorEncontrado;
      const cred = obtenerCredencialVendedor(v.nombre, v.zona);
      const primerNombreV = v?.nombre ? normalizarTexto(v.nombre).split(" ")[0].toLowerCase() : "";
      const codV = String(v?.codigo || "").replace(/^Z0*/, "").toLowerCase();

      // Claves alternativas de Excel o config
      const claveDeExcel = estado.clavesExcel?.get(v?.nombre?.toUpperCase()) ||
                           estado.clavesExcel?.get(primerNombreV.toUpperCase()) ||
                           estado.clavesExcel?.get(userLower.toUpperCase()) ||
                           (codV && estado.clavesExcel?.get(codV));

      const claveConfig = C.CLAVES_VENDEDORES && (
        C.CLAVES_VENDEDORES[userLower] ||
        C.CLAVES_VENDEDORES[primerNombreV] ||
        C.CLAVES_VENDEDORES[codV] ||
        C.CLAVES_VENDEDORES[v?.codigo]
      );

      // Validación de clave inteligente:
      // Acepta la clave personalizada configurada en la página, la de Excel, la de config,
      // o los comodines por defecto (primer nombre, código, beval2026, 123456)
      let claveValida = false;
      const passCorrecta = claveEsperadaCustom || cred.clave;
      if (passCorrecta && (passInput === passCorrecta || passLower === passCorrecta.toLowerCase())) {
        claveValida = true;
      } else if (claveDeExcel && passInput === claveDeExcel) {
        claveValida = true;
      } else if (claveConfig && passInput === claveConfig) {
        claveValida = true;
      } else if (
        passAceptadas.includes(passLower) ||
        (primerNombreV && passLower === primerNombreV) ||
        (userLower && passLower === userLower) ||
        (codV && passLower === codV) ||
        passLower === "beval" ||
        passLower === "beval2026" ||
        passLower === "123456"
      ) {
        claveValida = true;
      }

      if (claveValida) {
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
        aviso("Datos sincronizados con Google Sheets");
      }, demora);
    } catch (err) {
      console.error("Error al refrescar datos:", err);
      if (icono) icono.classList.remove("girando");
      if (btn) btn.disabled = false;
      aviso("Error al leer Google Sheets: " + (err.message || "Verifique la conexión"));
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
    document.body.classList.toggle("es-admin", esAdmin());
    document.body.classList.toggle("es-vendedor", !esAdmin());
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

    // 3. Poblar selectores de filtros dinámicos e interconectados
    construirCatalogoFiltros();

    const listaAnalistas = [...(estado.catalogoAnalistas?.keys() || [])].sort((a, b) => a.localeCompare(b, "es"));
    const labelAnalistaDefault = esAdmin()
      ? "Todos los analistas"
      : (listaAnalistas.length > 1 ? "Todos mis analistas" : "Mi analista");
    llenarSelect("f-analista", listaAnalistas, (a) => a, labelAnalistaDefault);

    if (esAdmin()) {
      actualizarOpcionesVendedores("");
    } else {
      const vNombre = estado.perfil?.nombre || estado.perfil?.codigo_vendedor || "";
      if ($("f-vendedor")) $("f-vendedor").value = vNombre;
      if ($("f-vendedor-input")) $("f-vendedor-input").value = vNombre;
    }
    actualizarOpcionesZonas("");
    inicializarComboboxVendedor();
    inicializarComboboxBuscar();

    aplicarFiltros();
  }

  // Catálogo inteligente de Filtros Cruzados (Vendedor, Analista, Zona)
  function construirCatalogoFiltros() {
    const vendsMap = new Map();
    const analistasMap = new Map();
    const zonasMap = new Map();

    const facturasParaCatalogo = esAdmin()
      ? estado.facturas
      : estado.facturas.filter((f) => esFacturaDeAsesor(f, estado.perfil));

    facturasParaCatalogo.forEach((f) => {
      const v = (f.vendedor || "").trim();
      const a = (f.analista || "").trim();
      const z = (f.zona || "").trim();

      if (v) {
        if (!vendsMap.has(v)) {
          const match = buscarVendedor(v, null, z);
          let cod = "";
          const codCand = String(match?.codigo || "").trim();
          if (codCand && codCand !== v && !v.includes(codCand) && /^\d+$/.test(codCand)) {
            cod = codCand;
          } else if (z && /^Z0*(\d+)$/i.test(z)) {
            cod = z.replace(/^Z0*/i, "");
          }
          vendsMap.set(v, {
            nombre: v,
            codigo: cod,
            zonas: new Set(),
            analistas: new Set(),
            count: 0
          });
        }
        const vObj = vendsMap.get(v);
        if (z) vObj.zonas.add(z);
        if (a) vObj.analistas.add(a);
        vObj.count++;
      }

      if (a) {
        if (!analistasMap.has(a)) analistasMap.set(a, { nombre: a, vendedores: new Set(), zonas: new Set() });
        const aObj = analistasMap.get(a);
        if (v) aObj.vendedores.add(v);
        if (z) aObj.zonas.add(z);
      }

      if (z) {
        if (!zonasMap.has(z)) zonasMap.set(z, { zona: z, vendedores: new Set(), analistas: new Set() });
        const zObj = zonasMap.get(z);
        if (v) zObj.vendedores.add(v);
        if (a) zObj.analistas.add(a);
      }
    });

    estado.catalogoVendedores = vendsMap;
    estado.catalogoAnalistas = analistasMap;
    estado.catalogoZonas = zonasMap;
  }

  function etiquetaVendedorFormato(vNombre) {
    const vObj = estado.catalogoVendedores?.get(vNombre);
    if (!vObj) return vNombre;
    const zonasStr = [...vObj.zonas].sort().join(", ");
    const zonaPart = zonasStr ? ` [${zonasStr}]` : "";
    if (vObj.codigo && vObj.codigo !== vNombre && !vNombre.includes(vObj.codigo)) {
      return `${vObj.codigo} · ${vObj.nombre}${zonaPart}`;
    }
    return `${vObj.nombre}${zonaPart}`;
  }

  let vendedoresDisponiblesCombo = [];

  function inicializarComboboxVendedor() {
    const input = $("f-vendedor-input");
    const selectOculto = $("f-vendedor");
    const listDiv = $("combo-vendedor-list");
    const clearBtn = $("btn-clear-vendedor");
    if (!input || !listDiv) return;
    if (input.dataset.comboInited) return;
    input.dataset.comboInited = "1";

    let vActiveIndex = -1;

    function renderOpciones(query = "") {
      const q = normalizarTexto(query);
      const selVal = selectOculto?.value || "";
      vActiveIndex = -1;

      let filtrados = vendedoresDisponiblesCombo;
      if (q) {
        filtrados = vendedoresDisponiblesCombo.filter((vNom) => {
          const vObj = estado.catalogoVendedores?.get(vNom);
          const s1 = normalizarTexto(vNom);
          const s2 = normalizarTexto(vObj?.codigo || "");
          const s3 = normalizarTexto([...(vObj?.zonas || [])].join(" "));
          return s1.includes(q) || s2.includes(q) || s3.includes(q);
        });
      }

      if (filtrados.length === 0) {
        listDiv.innerHTML = `<div style="padding: 10px 14px; font-size: 12px; color: var(--suave); text-align: center;">No se encontraron asesores</div>`;
        listDiv.hidden = false;
        return;
      }

      let html = "";
      if (!q) {
        html += `<div class="combo-item ${!selVal ? "selected" : ""}" data-val="">
          <span class="combo-item-nom">Todos los vendedores</span>
        </div>`;
      }

      html += filtrados.map((vNom) => {
        const vObj = estado.catalogoVendedores?.get(vNom);
        const zonasStr = [...(vObj?.zonas || [])].sort().join(", ");
        const codPart = (vObj?.codigo && vObj.codigo !== vNom && !vNom.includes(vObj.codigo)) ? `${vObj.codigo} · ` : "";
        const isSelected = vNom === selVal;
        return `
          <div class="combo-item ${isSelected ? "selected" : ""}" data-val="${esc(vNom)}">
            <span class="combo-item-nom">${esc(codPart + vNom)}</span>
            ${zonasStr ? `<span class="combo-item-zona">${esc(zonasStr)}</span>` : ""}
          </div>
        `;
      }).join("");

      listDiv.innerHTML = html;
      listDiv.hidden = false;
    }

    input.addEventListener("focus", () => {
      renderOpciones(input.value && input.value !== "Todos los vendedores" ? "" : "");
    });

    input.addEventListener("input", () => {
      const query = input.value;
      if (clearBtn) clearBtn.hidden = !query;
      renderOpciones(query);
      if (!query.trim()) {
        seleccionarVendedorDirecto("", false);
      }
    });

    listDiv.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".combo-item");
      if (!item) return;
      e.preventDefault();
      const val = item.dataset.val || "";
      seleccionarVendedorDirecto(val, true);
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        seleccionarVendedorDirecto("", true);
        input.focus();
      });
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".combo-vendedor-wrap")) {
        listDiv.hidden = true;
      }
    });

    input.addEventListener("keydown", (e) => {
      const items = [...listDiv.querySelectorAll(".combo-item")];
      if (e.key === "Escape") {
        listDiv.hidden = true;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (listDiv.hidden) {
          renderOpciones(input.value);
          return;
        }
        vActiveIndex = (vActiveIndex + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === vActiveIndex));
        items[vActiveIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (listDiv.hidden) return;
        vActiveIndex = (vActiveIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === vActiveIndex));
        items[vActiveIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (vActiveIndex >= 0 && items[vActiveIndex]) {
          seleccionarVendedorDirecto(items[vActiveIndex].dataset.val || "", true);
        } else {
          const primerItem = listDiv.querySelector(".combo-item");
          if (primerItem) {
            seleccionarVendedorDirecto(primerItem.dataset.val || "", true);
          }
        }
      }
    });
  }

  function seleccionarVendedorDirecto(vNom, dispararCascada = true) {
    const input = $("f-vendedor-input");
    const selectOculto = $("f-vendedor");
    const listDiv = $("combo-vendedor-list");
    const clearBtn = $("btn-clear-vendedor");

    if (selectOculto) selectOculto.value = vNom;
    if (input) {
      input.value = vNom ? etiquetaVendedorFormato(vNom) : "";
      if (clearBtn) clearBtn.hidden = !vNom;
    }
    if (listDiv) listDiv.hidden = true;

    if (dispararCascada) {
      onVendedorChange(vNom);
    }
  }

  // ========================================================
  // COMBOBOX DEL BUSCADOR GENERAL CON DESGLOSE INTELIGENTE
  // (Igual a la lista de vendedor: desglose por facturas,
  // clientes, asesores, analistas y montos)
  // ========================================================
  function inicializarComboboxBuscar() {
    const input = $("f-buscar");
    const listDiv = $("combo-buscar-list");
    const clearBtn = $("btn-clear-buscar");
    if (!input || !listDiv) return;
    if (input.dataset.comboInited) return;
    input.dataset.comboInited = "1";

    let activeIndex = -1;

    function renderOpciones(query = "") {
      const q = normalizarTexto(query);
      activeIndex = -1;

      const poolFacturas = esAdmin()
        ? (estado.facturas || [])
        : (estado.facturas || []).filter((f) => esFacturaDeAsesor(f, estado.perfil));

      // Si query está vacío, mostrar clientes con mayor saldo pendiente como sugerencia rápida
      if (!q) {
        const clientesMap = new Map();
        poolFacturas.forEach((f) => {
          if (!f.razon_social) return;
          const cNom = f.razon_social.trim();
          if (!clientesMap.has(cNom)) {
            clientesMap.set(cNom, {
              nombre: cNom,
              codigo: f.codigo_cliente || f.rif || "",
              vendedor: f.vendedor || "",
              zona: f.zona || "",
              facturas: 0,
              saldo: 0
            });
          }
          const c = clientesMap.get(cNom);
          c.facturas++;
          c.saldo += Number(f.saldo_usd) || 0;
        });

        const topClientes = [...clientesMap.values()]
          .sort((a, b) => b.saldo - a.saldo)
          .slice(0, 5);

        if (topClientes.length === 0) {
          listDiv.innerHTML = `<div class="combo-desglose-empty">Escribe N° de factura, cliente o RIF para buscar</div>`;
          listDiv.hidden = false;
          return;
        }

        let html = `<div class="combo-desglose-section">
          <div class="combo-desglose-header">
            ${esAdmin() ? "Clientes con mayor saldo sin retención" : "Mis clientes con mayor saldo"}
          </div>`;

        html += topClientes.map((c) => `
          <div class="combo-desglose-item" data-tipo="cliente" data-val="${esc(c.nombre)}">
            <div class="combo-desglose-principal">
              <div class="combo-desglose-titulo">
                <span class="combo-item-badge-pill pill-cliente">Cliente</span>
                <strong>${esc(c.nombre)}</strong>
              </div>
              <div class="combo-desglose-sub">
                <span>Cód: ${esc(c.codigo)}</span>
                ${c.vendedor ? `<span>· Asesor: ${esc(c.vendedor)}</span>` : ""}
              </div>
            </div>
            <div class="combo-desglose-lateral">
              <span class="combo-desglose-monto">$${usd(c.saldo)} USD</span>
              <span class="combo-cant-pill">${c.facturas} facturas</span>
            </div>
          </div>
        `).join("");
        html += `</div>`;

        html += `<div class="combo-desglose-section">
          <div class="combo-desglose-tip">
            Escribe un <strong>N° de factura</strong>, <strong>cliente</strong> o <strong>RIF</strong> para desglosar resultados al instante.
          </div>
        </div>`;

        listDiv.innerHTML = html;
        listDiv.hidden = false;
        return;
      }

      // 1. Facturas coincidentes
      const facturasCoinciden = poolFacturas.filter((f) => {
        const numF = String(f.factura || "").toLowerCase();
        return numF.includes(q);
      }).slice(0, 6);

      // 2. Clientes coincidentes (agrupados por razón social / código)
      const clientesCoincidenMap = new Map();
      poolFacturas.forEach((f) => {
        const rSocial = (f.razon_social || "").trim();
        const codCli = (f.codigo_cliente || "").trim();
        const rif = (f.rif || "").trim();
        const s1 = normalizarTexto(rSocial);
        const s2 = normalizarTexto(codCli);
        const s3 = normalizarTexto(rif);
        if (s1.includes(q) || s2.includes(q) || s3.includes(q)) {
          if (!clientesCoincidenMap.has(rSocial)) {
            clientesCoincidenMap.set(rSocial, {
              nombre: rSocial,
              codigo: codCli || rif,
              vendedor: f.vendedor || "",
              zona: f.zona || "",
              facturas: 0,
              saldo: 0
            });
          }
          const c = clientesCoincidenMap.get(rSocial);
          c.facturas++;
          c.saldo += Number(f.saldo_usd) || 0;
        }
      });
      const clientesCoinciden = [...clientesCoincidenMap.values()].slice(0, 5);

      // 3. Vendedores / Asesores coincidentes: SOLO ADMIN
      const vendedoresCoinciden = [];
      if (esAdmin() && estado.catalogoVendedores) {
        for (const [vNom, vObj] of estado.catalogoVendedores.entries()) {
          const s1 = normalizarTexto(vNom);
          const s2 = normalizarTexto(vObj.codigo || "");
          const s3 = normalizarTexto([...(vObj.zonas || [])].join(" "));
          if (s1.includes(q) || s2.includes(q) || s3.includes(q)) {
            vendedoresCoinciden.push({
              nombre: vNom,
              codigo: vObj.codigo || "",
              zonas: [...(vObj.zonas || [])].sort().join(", ")
            });
            if (vendedoresCoinciden.length >= 4) break;
          }
        }
      }

      // 4. Analistas coincidentes
      const analistasCoinciden = [];
      if (estado.catalogoAnalistas) {
        for (const [aNom, aObj] of estado.catalogoAnalistas.entries()) {
          const s1 = normalizarTexto(aNom);
          if (s1.includes(q)) {
            analistasCoinciden.push({
              nombre: aNom,
              zonas: [...(aObj.zonas || [])].sort().join(", ")
            });
            if (analistasCoinciden.length >= 3) break;
          }
        }
      }

      // 5. Total de facturas que coinciden con la búsqueda
      const totalCoincidencias = poolFacturas.filter((f) => {
        const campos = [f.razon_social, f.codigo_cliente, f.rif, f.factura, f.retencion, f.analista, f.vendedor, f.zona];
        return campos.some((x) => (x || "").toLowerCase().includes(q));
      }).length;

      let html = "";

      // Sección Facturas
      if (facturasCoinciden.length > 0) {
        html += `<div class="combo-desglose-section">
          <div class="combo-desglose-header">
            Facturas coincidentes (${facturasCoinciden.length})
          </div>`;
        html += facturasCoinciden.map((f) => {
          const dias = Number(f.dias_vencida) || 0;
          const badgeV = dias > 0
            ? `<span class="combo-desglose-badge combo-badge-vencida">${dias >= 45 ? "45+ días" : `${dias}d`}</span>`
            : `<span class="combo-desglose-badge combo-badge-aldia">Al día</span>`;
          return `
            <div class="combo-desglose-item" data-tipo="factura" data-val="${esc(f.factura)}">
              <div class="combo-desglose-principal">
                <div class="combo-desglose-titulo">
                  <span class="combo-item-badge-pill">Factura</span>
                  <strong>#${esc(f.factura)}</strong>
                </div>
                <div class="combo-desglose-sub">
                  <span>${esc(f.razon_social)}</span>
                  <span>· Zona ${esc(f.zona || "—")}</span>
                  <span>· Vence: ${fecha(f.fecha_vence)}</span>
                </div>
              </div>
              <div class="combo-desglose-lateral">
                <span class="combo-desglose-monto">$${usd(f.saldo_usd)} USD</span>
                ${badgeV}
              </div>
            </div>
          `;
        }).join("");
        html += `</div>`;
      }

      // Sección Clientes
      if (clientesCoinciden.length > 0) {
        html += `<div class="combo-desglose-section">
          <div class="combo-desglose-header">
            Clientes / Razón Social (${clientesCoinciden.length})
          </div>`;
        html += clientesCoinciden.map((c) => `
          <div class="combo-desglose-item" data-tipo="cliente" data-val="${esc(c.nombre)}">
            <div class="combo-desglose-principal">
              <div class="combo-desglose-titulo">
                <span class="combo-item-badge-pill pill-cliente">Cliente</span>
                <strong>${esc(c.nombre)}</strong>
              </div>
              <div class="combo-desglose-sub">
                <span>Cód: ${esc(c.codigo)}</span>
                ${c.vendedor ? `<span>· Asesor: ${esc(c.vendedor)}</span>` : ""}
              </div>
            </div>
            <div class="combo-desglose-lateral">
              <span class="combo-desglose-monto">$${usd(c.saldo)} USD</span>
              <span class="combo-cant-pill">${c.facturas} facturas</span>
            </div>
          </div>
        `).join("");
        html += `</div>`;
      }

      // Sección Asesores
      if (vendedoresCoinciden.length > 0) {
        html += `<div class="combo-desglose-section">
          <div class="combo-desglose-header">
            Asesores Comerciales (${vendedoresCoinciden.length})
          </div>`;
        html += vendedoresCoinciden.map((v) => `
          <div class="combo-desglose-item" data-tipo="vendedor" data-val="${esc(v.nombre)}">
            <div class="combo-desglose-principal">
              <div class="combo-desglose-titulo">
                <span class="combo-item-badge-pill pill-vendedor">Asesor</span>
                <strong>${esc((v.codigo ? v.codigo + " · " : "") + v.nombre)}</strong>
              </div>
              <div class="combo-desglose-sub">
                <span>Zona(s): ${esc(v.zonas || "Sin zona")}</span>
              </div>
            </div>
            <div class="combo-desglose-lateral">
              <span class="combo-action-pill">Filtrar asesor →</span>
            </div>
          </div>
        `).join("");
        html += `</div>`;
      }

      // Sección Analistas
      if (analistasCoinciden.length > 0) {
        html += `<div class="combo-desglose-section">
          <div class="combo-desglose-header">
            Analistas de Crédito (${analistasCoinciden.length})
          </div>`;
        html += analistasCoinciden.map((a) => `
          <div class="combo-desglose-item" data-tipo="analista" data-val="${esc(a.nombre)}">
            <div class="combo-desglose-principal">
              <div class="combo-desglose-titulo">
                <span class="combo-item-badge-pill pill-analista">Analista</span>
                <strong>${esc(a.nombre)}</strong>
              </div>
              <div class="combo-desglose-sub">
                <span>Analista de Crédito</span>
              </div>
            </div>
            <div class="combo-desglose-lateral">
              <span class="combo-action-pill">Filtrar analista →</span>
            </div>
          </div>
        `).join("");
        html += `</div>`;
      }

      // Fila de búsqueda general
      html += `<div class="combo-desglose-section">
        <div class="combo-desglose-item" data-tipo="texto" data-val="${esc(query)}">
          <div class="combo-desglose-principal">
            <div class="combo-desglose-titulo">
              <strong>Buscar "${esc(query)}" en toda la tabla</strong>
            </div>
            <div class="combo-desglose-sub">
              ${totalCoincidencias} facturas coinciden con este criterio
            </div>
          </div>
          <div class="combo-desglose-lateral">
            <span class="combo-action-pill pill-destacado">Ver tabla →</span>
          </div>
        </div>
      </div>`;

      listDiv.innerHTML = html;
      listDiv.hidden = false;
    }

    function seleccionarItem(item) {
      if (!item) return;
      const tipo = item.dataset.tipo;
      const val = item.dataset.val || "";

      if (tipo === "factura") {
        input.value = val;
        if (clearBtn) clearBtn.hidden = false;
        listDiv.hidden = true;
        aplicarFiltros();
      } else if (tipo === "cliente") {
        input.value = val;
        if (clearBtn) clearBtn.hidden = false;
        listDiv.hidden = true;
        aplicarFiltros();
      } else if (tipo === "vendedor") {
        input.value = "";
        if (clearBtn) clearBtn.hidden = true;
        listDiv.hidden = true;
        seleccionarVendedorDirecto(val, true);
      } else if (tipo === "analista") {
        input.value = "";
        if (clearBtn) clearBtn.hidden = true;
        listDiv.hidden = true;
        if ($("f-analista")) {
          $("f-analista").value = val;
          onAnalistaChange();
        }
      } else {
        input.value = val;
        if (clearBtn) clearBtn.hidden = !val;
        listDiv.hidden = true;
        aplicarFiltros();
      }
    }

    input.addEventListener("focus", () => {
      renderOpciones(input.value);
    });

    input.addEventListener("input", () => {
      const q = input.value;
      if (clearBtn) clearBtn.hidden = !q;
      renderOpciones(q);
      clearTimeout(aplicarFiltros.t);
      aplicarFiltros.t = setTimeout(aplicarFiltros, 200);
    });

    listDiv.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".combo-desglose-item");
      if (!item) return;
      e.preventDefault();
      seleccionarItem(item);
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.value = "";
        clearBtn.hidden = true;
        listDiv.hidden = true;
        aplicarFiltros();
        input.focus();
      });
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".combo-buscar-wrap")) {
        listDiv.hidden = true;
      }
    });

    input.addEventListener("keydown", (e) => {
      const items = [...listDiv.querySelectorAll(".combo-desglose-item")];
      if (e.key === "Escape") {
        listDiv.hidden = true;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (listDiv.hidden) {
          renderOpciones(input.value);
          return;
        }
        activeIndex = (activeIndex + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === activeIndex));
        items[activeIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (listDiv.hidden) return;
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === activeIndex));
        items[activeIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) {
          seleccionarItem(items[activeIndex]);
        } else {
          listDiv.hidden = true;
          aplicarFiltros();
        }
      }
    });
  }

  // Cascada Inteligente de Filtros Conectados (Vendedor <-> Analista <-> Zona)
  function onVendedorChange(vNom) {
    if (vNom) {
      const vObj = estado.catalogoVendedores?.get(vNom);
      if (vObj) {
        // Conectar Analista
        const analistasVend = [...vObj.analistas];
        if (analistasVend.length === 1) {
          if ($("f-analista")) $("f-analista").value = analistasVend[0];
        } else if (analistasVend.length > 1) {
          const aActual = $("f-analista")?.value;
          if (!aActual || !analistasVend.includes(aActual)) {
            if ($("f-analista")) $("f-analista").value = analistasVend[0];
          }
        }

        // Conectar Zona
        const zonasVend = [...vObj.zonas];
        if (zonasVend.length === 1) {
          if ($("f-zona")) $("f-zona").value = zonasVend[0];
        } else if (zonasVend.length > 1) {
          const zActual = $("f-zona")?.value;
          if (!zActual || !zonasVend.includes(zActual)) {
            if ($("f-zona")) $("f-zona").value = zonasVend[0];
          }
        }
      }
    }
    aplicarFiltros();
  }

  function onAnalistaChange() {
    const aSel = $("f-analista")?.value || "";
    if (esAdmin()) {
      actualizarOpcionesVendedores(aSel);
    }
    actualizarOpcionesZonas(aSel);
    aplicarFiltros();
  }

  function onZonaChange() {
    const zSel = $("f-zona")?.value || "";
    if (zSel) {
      const zObj = estado.catalogoZonas?.get(zSel);
      if (zObj) {
        // Si la zona pertenece a un solo analista, auto-seleccionar
        const analistasZona = [...zObj.analistas];
        if (analistasZona.length === 1) {
          if ($("f-analista")) $("f-analista").value = analistasZona[0];
        }
        // Si la zona tiene un solo vendedor, auto-seleccionar (solo para administrador)
        if (esAdmin()) {
          const vendsZona = [...zObj.vendedores];
          if (vendsZona.length === 1) {
            seleccionarVendedorDirecto(vendsZona[0], false);
          }
        }
      }
    }
    aplicarFiltros();
  }

  function actualizarOpcionesVendedores(analistaFiltro = "") {
    let lista = [];
    if (analistaFiltro) {
      const aObj = estado.catalogoAnalistas?.get(analistaFiltro);
      lista = aObj ? [...aObj.vendedores] : [];
    } else {
      lista = [...(estado.catalogoVendedores?.keys() || [])];
    }
    lista = lista.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    vendedoresDisponiblesCombo = lista;

    llenarSelect("f-vendedor", lista, (v) => etiquetaVendedorFormato(v));

    const vActual = $("f-vendedor")?.value;
    if (vActual && !lista.includes(vActual)) {
      seleccionarVendedorDirecto("", false);
    }
  }

  function actualizarOpcionesZonas(analistaFiltro = "") {
    let lista = [];
    if (analistaFiltro) {
      const aObj = estado.catalogoAnalistas?.get(analistaFiltro);
      lista = aObj ? [...aObj.zonas] : [];
    } else {
      lista = [...(estado.catalogoZonas?.keys() || [])];
    }
    lista = lista.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    const textoPrimero = esAdmin() ? "Todas" : (lista.length > 1 ? "Todas mis zonas" : "Mi zona");
    llenarSelect("f-zona", lista, (z) => z, textoPrimero);

    const zActual = $("f-zona")?.value;
    if (zActual && !lista.includes(zActual)) {
      if ($("f-zona")) $("f-zona").value = "";
    }
  }

  function llenarSelect(id, valores, etiqueta = (v) => v, textoPrimero = null) {
    const sel = $(id);
    if (!sel) return;
    const valorActual = sel.value;
    const primeroTexto = textoPrimero || (id === "f-analista" ? (esAdmin() ? "Todos los analistas" : "Mi analista") : (id === "f-zona" ? (esAdmin() ? "Todas" : "Mi zona") : "Todos"));
    const primeroHtml = `<option value="">${esc(primeroTexto)}</option>`;
    valores = valores.filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    sel.innerHTML = primeroHtml + valores.map((v) => `<option value="${esc(v)}">${esc(etiqueta(v))}</option>`).join("");
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
    const vendedorFijo = estado.perfil && !esAdmin() ? (estado.perfil.codigo_vendedor || estado.perfil.nombre) : null;

    return lista.filter((f) => {
      // Bloqueo estricto: si es asesor, jamás puede ver facturas de otros
      if (!esAdmin() && estado.perfil && !esFacturaDeAsesor(f, estado.perfil)) {
        return false;
      }

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

  $("f-vendedor")?.addEventListener("change", () => onVendedorChange($("f-vendedor").value));
  $("f-analista")?.addEventListener("change", onAnalistaChange);
  $("f-zona")?.addEventListener("change", onZonaChange);
  $("f-estado")?.addEventListener("change", aplicarFiltros);
  ["f-desde", "f-hasta"].forEach((id) => $(id)?.addEventListener("input", () => {
    clearTimeout(aplicarFiltros.t);
    aplicarFiltros.t = setTimeout(aplicarFiltros, 200);
  }));

  $("btn-limpiar")?.addEventListener("click", () => {
    estado.seleccionadas.clear();
    actualizarContadorSeleccionados();
    if (esAdmin()) {
      seleccionarVendedorDirecto("", false);
      actualizarOpcionesVendedores("");
    } else {
      const vNombre = estado.perfil?.nombre || estado.perfil?.codigo_vendedor || "";
      seleccionarVendedorDirecto(vNombre, false);
    }
    if ($("f-analista")) $("f-analista").value = "";
    if ($("f-zona")) $("f-zona").value = "";
    if ($("f-estado")) $("f-estado").value = "";
    if ($("f-buscar")) $("f-buscar").value = "";
    if ($("btn-clear-buscar")) $("btn-clear-buscar").hidden = true;
    if ($("combo-buscar-list")) $("combo-buscar-list").hidden = true;
    if ($("f-desde")) $("f-desde").value = "";
    if ($("f-hasta")) $("f-hasta").value = "";

    actualizarOpcionesZonas("");
    aplicarFiltros();
  });

  // ---------- SEMÁFORO DE COBRANZA ----------
  function calcularSemaforo(facturado, cobrado, saldoVencido, saldoTotal) {
    const avance = facturado > 0 ? (cobrado / facturado) * 100 : 0;
    const ratioMora = saldoTotal > 0 ? (saldoVencido / saldoTotal) * 100 : 0;

    if (saldoVencido <= 0 || ratioMora === 0) {
      if (avance >= 40) return { nivel: "estable", label: "Estable", clase: "estable" };
      return { nivel: "precaucion", label: "En precaución", clase: "precaucion" };
    }

    if (ratioMora > 45 || (avance < 25 && ratioMora > 20)) {
      return { nivel: "riesgo", label: "En riesgo", clase: "riesgo" };
    }

    if (avance >= 50 && ratioMora <= 25) {
      return { nivel: "estable", label: "Estable", clase: "estable" };
    }

    return { nivel: "precaucion", label: "En precaución", clase: "precaucion" };
  }

  // ---------- TARJETA EJECUTIVA HERO CARD ----------
  function pintarHeroCard() {
    const hero = $("vendor-hero");
    if (!hero) return;

    let codVendedor = null;
    let nombreVendedor = "";
    let esGlobal = false;

    if (!esAdmin() && estado.perfil) {
      codVendedor = estado.perfil.codigo_vendedor || estado.perfil.nombre;
      nombreVendedor = estado.perfil.nombre || `Asesor ${codVendedor}`;
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

    // ALCANCE Y REACTIVIDAD:
    // 1. Si hay facturas seleccionadas manualmente con checkboxes, el alcance se ciñe a ellas.
    // 2. Si no, evalúa el universo filtrado activo (respetando asesor, analista, zona, vencimiento, montos y búsqueda).
    const haySeleccionManual = estado.seleccionadas && estado.seleccionadas.size > 0;
    const facturasHeroTotal = haySeleccionManual
      ? estado.filtradas.filter((f) => estado.seleccionadas.has(f.factura))
      : estado.filtradas;

    const totalFacturadoGlobal = facturasHeroTotal.reduce((s, f) => s + (Number(f.monto_dolar) || 0), 0);
    const saldoTotalGlobal = facturasHeroTotal.reduce((s, f) => s + (Number(f.saldo_usd) || 0), 0);
    const cobradoGlobal = Math.max(0, totalFacturadoGlobal - saldoTotalGlobal);

    const facturasVencidas = facturasHeroTotal.filter((f) => Number(f.dias_vencida) > 0);
    const facturasAlDia = facturasHeroTotal.filter((f) => Number(f.dias_vencida) <= 0);

    // =========================================================================
    // BASE DE CÁLCULO PRINCIPAL: RETENCIÓN ESTIMADA 75%
    // =========================================================================
    // Objetivo / Base: Suma de retenciones estimadas del alcance (100% meta).
    // Cobrado en retención: Suma de retención recuperada/procesada según abonos y comprobantes.
    // Falta / Saldo: Retención Estimada - Cobrado en retención (mínimo 0).
    // Avance: (Cobrado en retención / Retención Estimada) * 100
    let retTotalGlobal = 0;
    let retCobradaGlobal = 0;
    let retVencidaGlobal = 0;
    let retAlDiaGlobal = 0;

    facturasHeroTotal.forEach((f) => {
      const retFac = Number(f.monto_estimado) || 0;
      const mDolar = Number(f.monto_dolar) || 0;
      const sUsd = Number(f.saldo_usd) || 0;
      retTotalGlobal += retFac;

      // Verificamos si tiene comprobante montado o en proceso ERP
      const tieneComp = (f.estado === "RETENCION CARGADA NO APLICADA") ||
        Boolean(f.retencion && f.retencion !== "S/C") ||
        (estado.comprobantesAsociados && Object.values(estado.comprobantesAsociados).some((c) => c.facturas && c.facturas.includes(String(f.factura).trim())));

      // Si tiene comprobante = 100% de la retención cobrada.
      // Si tuvo abono parcial en la factura = proporción exacta del abono aplicada a su retención individual.
      const cobFac = Math.max(0, mDolar - sUsd);
      const propCob = tieneComp ? 1 : (mDolar > 0 ? Math.min(1, Math.max(0, cobFac / mDolar)) : 0);

      const rCob = retFac * propCob;
      const rPend = Math.max(0, retFac - rCob);
      retCobradaGlobal += rCob;

      if (Number(f.dias_vencida) > 0) {
        retVencidaGlobal += rPend;
      } else {
        retAlDiaGlobal += rPend;
      }
    });

    // Saldo de retención pendiente por gestionar (mínimo 0)
    const retSaldoGlobal = Math.max(0, retTotalGlobal - retCobradaGlobal);

    // Semáforo evaluado sobre la gestión de retenciones (riesgo si la mora en retención es alta)
    const sem = calcularSemaforo(retTotalGlobal, retCobradaGlobal, retVencidaGlobal, retSaldoGlobal);
    const semEl = $("vh-semaforo");
    if (semEl) {
      semEl.className = `badge-semaforo ${sem.clase}`;
      semEl.textContent = esGlobal ? `Cartera ${sem.label}` : `Asesor ${sem.label}`;
    }

    // Porcentajes de distribución de la retención del 75%
    let pctCobrado = retTotalGlobal > 0 ? Math.round((retCobradaGlobal / retTotalGlobal) * 100) : 0;
    let pctAlDia = retTotalGlobal > 0 ? Math.round((retAlDiaGlobal / retTotalGlobal) * 100) : 0;
    let pctVencido = Math.max(0, 100 - pctCobrado - pctAlDia);
    if (retTotalGlobal === 0) {
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
    let avancePct = 0;
    let proyPct = 0;
    let tituloAvance = "Avance & Proyección Cierre";

    if (vista === "completa") {
      tituloAvance = "Avance & Proyección Cierre (Retención 75%)";
      avancePct = retTotalGlobal > 0 ? Math.min(100, Math.round((retCobradaGlobal / retTotalGlobal) * 100)) : 0;
      // Proyección basada en retención: lo cobrado (100%) + recuperación esperada de lo que está al día (85%) + recuperabilidad de mora (25%)
      const retProyectada = retCobradaGlobal + (retAlDiaGlobal * 0.85) + (retVencidaGlobal * 0.25);
      proyPct = retTotalGlobal > 0 ? Math.min(100, Math.round((retProyectada / retTotalGlobal) * 100)) : 0;
      $("vh-avance-txt").textContent = `${avancePct}% (Proy. Cierre ${proyPct}%)`;
    } else if (vista === "vencida") {
      tituloAvance = "Recuperación de Retención Vencida (Mora)";
      let retVencTotal = 0;
      let retVencCob = 0;
      facturasVencidas.forEach((f) => {
        const retFac = Number(f.monto_estimado) || 0;
        const mDolar = Number(f.monto_dolar) || 0;
        const sUsd = Number(f.saldo_usd) || 0;
        retVencTotal += retFac;
        const propCob = mDolar > 0 ? Math.min(1, Math.max(0, (mDolar - sUsd) / mDolar)) : 0;
        retVencCob += retFac * propCob;
      });
      avancePct = retVencTotal > 0 ? Math.min(100, Math.round((retVencCob / retVencTotal) * 100)) : 0;
      proyPct = retVencTotal > 0 ? Math.min(100, Math.round(((retVencCob + (retVencTotal - retVencCob) * 0.30) / retVencTotal) * 100)) : 0;
      $("vh-avance-txt").textContent = `${avancePct}% recuperado (Proy. ${proyPct}%)`;
    } else if (vista === "aldia") {
      tituloAvance = "Avance de Retención al Día (Por Vencer)";
      let retDiaTotal = 0;
      let retDiaCob = 0;
      facturasAlDia.forEach((f) => {
        const retFac = Number(f.monto_estimado) || 0;
        const mDolar = Number(f.monto_dolar) || 0;
        const sUsd = Number(f.saldo_usd) || 0;
        retDiaTotal += retFac;
        const propCob = mDolar > 0 ? Math.min(1, Math.max(0, (mDolar - sUsd) / mDolar)) : 0;
        retDiaCob += retFac * propCob;
      });
      avancePct = retDiaTotal > 0 ? Math.min(100, Math.round((retDiaCob / retDiaTotal) * 100)) : 0;
      proyPct = retDiaTotal > 0 ? Math.min(100, Math.round(((retDiaCob + (retDiaTotal - retDiaCob) * 0.90) / retDiaTotal) * 100)) : 0;
      $("vh-avance-txt").textContent = `${avancePct}% (Proy. Cierre ${proyPct}%)`;
    }

    const codObj = buscarVendedor(codVendedor);
    const codDisplay = codObj?.codigo || (facturasHeroTotal[0]?.zona ? facturasHeroTotal[0].zona.replace(/^Z0*/, "") : (codVendedor || ""));
    $("vh-tag").textContent = esGlobal ? "Consolidado Ejecutivo Beval" : `Asesor Comercial Softland · ${codDisplay}`;
    $("vh-nombre").textContent = nombreVendedor;
    $("vh-sub").textContent = haySeleccionManual
      ? `${ent(facturasHeroTotal.length)} facturas seleccionadas manualmente`
      : (esGlobal
          ? `${ent(facturasHeroTotal.length)} facturas en el alcance actual`
          : `Zona ${facturasHeroTotal[0]?.zona || "N/A"} · ${ent(facturasHeroTotal.length)} facturas asignadas`);

    // Tarjeta 1: Total Facturado (Dato informativo bruto)
    $("vh-facturado").textContent = `$${usd(totalFacturadoGlobal)}`;
    const subFacturado = $("vh-facturado-sub");
    if (subFacturado) subFacturado.textContent = `Saldo facturas: $${usd(saldoTotalGlobal)}`;

    // Tarjeta 2: Cobrado (derivado de la retención estimada)
    $("vh-cobrado").textContent = `$${usd(retCobradaGlobal)}`;
    const subCobrado = $("vh-cobrado-sub");
    if (subCobrado) subCobrado.textContent = `${pctCobrado}% del objetivo`;

    // Tarjeta 3: Falta / Saldo (derivado de la retención estimada: Retención Estimada - Cobrado)
    $("vh-saldo").textContent = `$${usd(retSaldoGlobal)}`;
    const subSaldo = $("vh-saldo-sub");
    if (subSaldo) subSaldo.textContent = `Pendiente por gestionar`;

    // Tarjeta 4: Retención Estimada 75% (Objetivo / Base del 100%)
    $("vh-retencion").textContent = `$${usd(retTotalGlobal)}`;
    const subRet = $("vh-retencion-sub");
    if (subRet) subRet.textContent = `Meta objetivo 100%`;

    const titAvEl = $("vh-avance-titulo");
    if (titAvEl) titAvEl.textContent = tituloAvance;

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
      ? `<span class="badge-comprobante-cargado" data-ver-detalle-comp="${esc(compAsociado)}" title="Comprobante digital cargado: ${esc(compAsociado)}. Clic para ver"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> #${esc(compAsociado)}</span>`
      : "";

    const clienteHtml = `
      <div class="cliente-consolidado" title="${esc(f.razon_social)} · ${esc(f.codigo_cliente)}">
        <button type="button" class="btn-copiar-razon" data-copiar-codigo="${esc(f.razon_social)}" data-tipo="Razón Social" title="Clic para copiar razón social: ${esc(f.razon_social)}">
          <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
          <span class="cod-icono-inline"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        </button>
        <button type="button" class="cliente-codigo-btn" data-copiar-codigo="${esc(f.codigo_cliente)}" data-tipo="Código Cliente" title="Toca para copiar código ${esc(f.codigo_cliente)}">
          <span class="cod-icono"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
          <span class="cod-txt">${esc(f.codigo_cliente || "")}</span>
        </button>
        ${badgeDias}
        ${badgeComprobante}
      </div>`;

    return `<tr data-fac="${esc(f.factura)}">
      <td style="width: 34px; text-align: center;">
        <input type="checkbox" class="chk-factura" data-factura="${esc(f.factura)}" ${isChecked ? "checked" : ""}>
      </td>
      <td style="width: 105px;">
        <button type="button" class="btn-copiar-factura" data-copiar-codigo="${esc(f.factura)}" data-tipo="Factura" title="Clic para copiar factura #${esc(f.factura)}">
          <span class="cod-txt">#${esc(f.factura)}</span>
          <span class="cod-icono"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        </button>
      </td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_emision)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_vence)}</td>
      <td class="num" style="width: 62px;">${diasV > 0 ? `<span class="vencida">${ent(diasV)}</span>` : ent(diasV)}</td>
      <td style="width: auto;">${clienteHtml}</td>
      <td style="width: 125px; font-size: 11.5px;">${esc(f.analista)}</td>
      <td style="width: 115px; font-size: 11.5px;" title="${esc(f.vendedor)}">${esc(f.vendedor)}</td>
      <td style="width: 50px; text-align: center;">${esc(f.zona)}</td>
      <td class="num" style="width: 86px;">${usd(f.monto_dolar)}</td>
      <td class="num" style="width: 86px;">${usd(f.saldo_usd)}</td>
      <td class="num celda-estimado" style="width: 92px;">${usd(f.monto_estimado)}</td>
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
        const listaKpi = estado.seleccionadas.size > 0
          ? estado.filtradas.filter((f) => estado.seleccionadas.has(f.factura))
          : estado.filtradas;
        pintarKpis(listaKpi, estado.filtradasProc);
        pintarHeroCard();
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
      const listaKpi = estado.seleccionadas.size > 0
        ? estado.filtradas.filter((f) => estado.seleccionadas.has(f.factura))
        : estado.filtradas;
      pintarKpis(listaKpi, estado.filtradasProc);
      pintarHeroCard();
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
        <button type="button" class="btn-copiar-razon" data-copiar-codigo="${esc(f.razon_social)}" data-tipo="Razón Social" title="Clic para copiar razón social: ${esc(f.razon_social)}">
          <span class="cliente-nombre">${esc(f.razon_social || "Sin nombre")}</span>
          <span class="cod-icono-inline"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        </button>
        <button type="button" class="cliente-codigo-btn" data-copiar-codigo="${esc(f.codigo_cliente)}" data-tipo="Código Cliente" title="Toca para copiar código ${esc(f.codigo_cliente)}">
          <span class="cod-icono"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
          <span class="cod-txt">${esc(f.codigo_cliente || "")}</span>
        </button>
        ${badgeDias}
      </div>`;

    let compAsociado = "";
    for (const [cNum, cData] of Object.entries(estado.comprobantesAsociados || {})) {
      if (cData.facturas && cData.facturas.includes(String(f.factura).trim())) {
        compAsociado = cNum;
        break;
      }
    }
    const badgeCompMontado = compAsociado
      ? `<span class="badge-comprobante-cargado" data-ver-detalle-comp="${esc(compAsociado)}" title="Comprobante digital cargado: ${esc(compAsociado)}. Clic para ver"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg> #${esc(compAsociado)}</span>`
      : "";

    const comprobanteHtml = f.retencion
      ? `<button type="button" class="btn-copiar-comprobante" data-copiar-codigo="${esc(f.retencion)}" title="Toca para copiar comprobante ${esc(f.retencion)}">
          <span class="cod-icono"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>
          <span class="cod-txt" style="font-family: monospace; font-weight: 700;">${esc(f.retencion)}</span>
        </button> ${badgeCompMontado}`
      : (badgeCompMontado || `<span style="color: var(--suave);">—</span>`);

    return `<tr data-fac="${esc(f.factura)}">
      <td style="width: 34px; text-align: center;">
        <input type="checkbox" class="chk-factura-proc" data-factura="${esc(f.factura)}" ${isChecked ? "checked" : ""}>
      </td>
      <td style="width: 105px;">
        <button type="button" class="btn-copiar-factura" data-copiar-codigo="${esc(f.factura)}" data-tipo="Factura" title="Clic para copiar factura #${esc(f.factura)}">
          <span class="cod-txt">#${esc(f.factura)}</span>
          <span class="cod-icono"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        </button>
      </td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_emision)}</td>
      <td class="celda-fecha" style="width: 94px;">${fecha(f.fecha_vence)}</td>
      <td class="num" style="width: 62px;">${diasV > 0 ? `<span class="vencida">${ent(diasV)}</span>` : ent(diasV)}</td>
      <td style="width: auto;">${clienteHtml}</td>
      <td style="width: 155px;">${comprobanteHtml}</td>
      <td class="num" style="width: 95px; font-weight: 700; color: #a3b018;">$${usd(f.monto_retencion || f.monto_estimado)}</td>
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
      aviso("No hay facturas por procesar para copiar");
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
    aviso(`Copiada lista de ${ent(lista.length)} facturas por procesar`);
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
    const tipo = btn.dataset.tipo || "Dato";

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
    const icono = btn.querySelector(".cod-icono") || btn.querySelector(".cod-icono-inline");
    const htmlOrig = icono ? icono.innerHTML : "";
    if (icono) icono.textContent = "";
    setTimeout(() => {
      btn.classList.remove("copiado");
      if (icono) icono.innerHTML = htmlOrig;
    }, 1200);
    aviso(`${tipo} copiado al portapapeles: ${cod}`);
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
    aviso(limpio ? `Teléfono guardado para ${v.nombre || cod}: ${limpio}` : `Teléfono eliminado para ${v.nombre || cod}`);
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
        ? `<span class="badge-ws enviado">Enviado</span>`
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
        ? `<button type="button" class="btn-editar-tel" data-editar-tel="${esc(cod)}" title="Clic para editar número de WhatsApp">${esc(v.telefono)} </button>`
        : `<button type="button" class="btn-editar-tel sin-tel" data-editar-tel="${esc(cod)}" title="Clic para registrar número de WhatsApp">Sin tel. [+ Tel]</button>`;

      const cred = obtenerCredencialVendedor(cod, zona);
      const credBtnHtml = `
        <button type="button" class="btn-editar-cred ${cred.esPersonalizada ? 'personalizada' : ''}" data-editar-cred="${esc(cod)}" title="Clic para ver o cambiar el usuario y la contraseña de este asesor">
          <span class="icono-llave"></span>
          <span class="cred-detalle">User: <strong>${esc(cred.usuario)}</strong> &bull; Clave: <strong>${esc(cred.clave)}</strong></span>
          ${cred.esPersonalizada ? '<span class="badge-personalizado" title="Clave personalizada"></span>' : ''}
          <span class="cred-lapiz"></span>
        </button>`;

      const celdaVendedor = `
        <div style="display: flex; flex-direction: column;">
          <strong style="color: var(--texto);">${esc(nombreLimpio)}</strong>
          <small style="color: var(--suave); font-size: 11px;">Código: ${esc(codIdent)}</small>
          ${telBtnHtml}
          ${credBtnHtml}
        </div>`;

      const waButtonsHtml = `
        <div class="acciones-wa-grupo">
          <button type="button" class="btn btn-wa-pill btn-wa-vencidas" data-wa="${esc(cod)}" data-modo="vencidas" title="Enviar WhatsApp solo de facturas vencidas (${r.vencidas}) y generar imagen">
            Vencidas (${r.vencidas})
          </button>
          <button type="button" class="btn btn-wa-pill btn-wa-todas" data-wa="${esc(cod)}" data-modo="todas" title="Enviar WhatsApp de cartera completa (${r.facturas}) y generar imagen">
            Todas (${r.facturas})
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
        <td class="num celda-estimado">$${usd(r.estimado)}</td>
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
    aviso("Estados de WhatsApp reiniciados para hoy");
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

    // Cabecera superior Beval Blue (#1d1d1b)
    ctx.fillStyle = "#1d1d1b";
    ctx.fillRect(0, 0, width, 125);

    // Línea de acento verde Beval (#ccdb2a)
    ctx.fillStyle = "#ccdb2a";
    ctx.fillRect(0, 125, width, 5);

    // Título Principal
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'Inter', sans-serif, Arial";
    ctx.fillText("DISTRIBUIDORA BEVAL, C.A.", padding, 38);

    // Subtítulo según modo
    ctx.fillStyle = esSoloVencidas ? "#f87171" : "#a3b018";
    ctx.font = "bold 13px 'Inter', sans-serif, Arial";
    const subTit = esSoloVencidas
      ? "🔴 REPORTE DE RETENCIONES DE IVA · SOLO FACTURAS VENCIDAS"
      : "📋 ESTADO DE CUENTA DE RETENCIONES · CARTERA COMPLETA";
    ctx.fillText(subTit, padding, 62);

    // Datos del Asesor y Fecha
    ctx.fillStyle = "#e5e5e5";
    ctx.font = "13px 'Inter', sans-serif, Arial";
    const hoyStr = new Date().toLocaleDateString("es-VE", { year: "numeric", month: "short", day: "numeric" });
    const zonaTxt = listaFacturas[0]?.zona ? `Zona: ${listaFacturas[0].zona}   |   ` : "";
    ctx.fillText(`Asesor Comercial: ${vendedorNom}   |   ${zonaTxt}Fecha de Corte: ${hoyStr}`, padding, 88);
    ctx.fillText(`Total Facturas: ${totalRows} documento(s) en seguimiento`, padding, 108);

    // Cabecera de la tabla
    const tableY = 145;
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(padding, tableY, width - (padding * 2), 30);

    ctx.fillStyle = "#2a2a2a";
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
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(padding, curY, width - (padding * 2), rowHeight);
      }

      // Línea divisoria
      ctx.fillStyle = "#e5e5e5";
      ctx.fillRect(padding, curY + rowHeight - 1, width - (padding * 2), 1);

      // Factura
      ctx.fillStyle = "#171717";
      ctx.font = "bold 11px 'Inter', sans-serif, Arial";
      ctx.fillText(String(f.factura || ""), padding + 10, curY + 18);

      // Cliente (truncado suave si es muy largo)
      ctx.font = "11px 'Inter', sans-serif, Arial";
      ctx.fillStyle = "#404040";
      const nomCliente = (f.razon_social || f.codigo_cliente || "").substring(0, 48);
      ctx.fillText(nomCliente, padding + 95, curY + 18);

      // Vence
      ctx.fillStyle = "#6b6b6b";
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
    ctx.fillStyle = "#1d1d1b";
    ctx.fillRect(padding, curY, width - (padding * 2), 44);

    const totalEstimado = listaFacturas.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px 'Inter', sans-serif, Arial";
    ctx.fillText(`TOTAL: ${totalRows} FACTURAS`, padding + 16, curY + 27);

    ctx.fillStyle = "#ccdb2a";
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
      aviso(`WhatsApp abierto para ${v.nombre || cod} con ${lista.length} facturas ${soloVencidas ? "vencidas" : "totales"}. ¡Imagen descargada lista para adjuntar!`);
    } else {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textoMsg)}`;
      window.open(url, "_blank", "noopener");
      marcarWsEnviado(cod);
      aviso(`Mensaje copiado e imagen descargada. Elige a ${v.nombre || cod} en WhatsApp`);
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
    aviso("Mensaje copiado al portapapeles");
  });

  // ---------- MENSAJERÍA MASIVA ----------
  const modalMasivo = $("modal-masivo");

  function abrirModalMasivo(tabInicial = "vendedores") {
    if (!esAdmin()) {
      aviso("Función exclusiva de administradores");
      return;
    }
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
      $("masivo-proximo-detalles").textContent = `Zona ${proximo.zona || "—"} · ${ent(cantFact)} facturas ${modoLabel} · $${usd(montoEst)} USD ${tel ? `· ${tel}` : "· ℹ️ Se abrirá WhatsApp para seleccionar contacto"}`;
      if (btnSiguiente) {
        btnSiguiente.disabled = false;
        btnSiguiente.dataset.codProximo = proximo.cod;
        btnSiguiente.innerHTML = tel
          ? `<span>▶ Enviar a WhatsApp de ${esc(v.nombre || proximo.cod)} (${cantFact} ${modoLabel})</span>`
          : `<span>▶ Abrir WhatsApp para ${esc(v.nombre || proximo.cod)} (${cantFact} ${modoLabel})</span>`;
      }
    } else {
      $("masivo-proximo-nombre").textContent = "¡Todos los asesores han sido contactados hoy!";
      $("masivo-proximo-detalles").textContent = "Puedes reiniciar los estados en cualquier momento si deseas enviar nuevamente.";
      if (btnSiguiente) {
        btnSiguiente.disabled = true;
        btnSiguiente.innerHTML = "<span>Todo enviado por hoy</span>";
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
    aviso(`Se han copiado todos los mensajes (${esModoVencidas ? "Solo Vencidas" : "Cartera Completa"}) al portapapeles`);
  });

  $("btn-copiar-clientes-sel")?.addEventListener("click", async () => {
    if (estado.seleccionadas.size === 0) {
      aviso("Primero marca al menos una factura en la tabla");
      return;
    }
    const listaSel = estado.facturas.filter((f) => estado.seleccionadas.has(f.factura));
    const lineas = listaSel.map((f) => `• Factura: ${f.factura} | Cliente: ${f.razon_social} | Estimado Ret. 75%: $${usd(f.monto_estimado)} USD | Vence: ${fecha(f.fecha_vence)}`);
    const texto = `*RECORDATORIO DE FACTURAS PENDIENTES DE RETENCIÓN DE IVA*\n\n` + lineas.join("\n") + `\n\nTotal estimado: $${usd(listaSel.reduce((s, f) => s + (Number(f.monto_estimado) || 0), 0))} USD`;
    await navigator.clipboard.writeText(texto);
    aviso(`Mensaje copiado con ${listaSel.length} facturas`);
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
    if (tab === "vendedores" && !esAdmin()) return;
    estado.tabActiva = tab;
    document.querySelectorAll("#pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + tab));
    if (tab === "comprobantes") {
      pintarComprobantesMontados();
    }
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

    const textoProgreso = procesandoComp?.querySelector("p") || $("comp-ocr-progreso");
    if (textoProgreso) textoProgreso.textContent = "Extrayendo texto del comprobante...";

    let textoExtraido = "";
    const imagenesParaOcr = [];

    // 1. Si es archivo PDF
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      if (window.pdfjsLib) {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
          
          for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            
            // Unir texto estructurado preservando saltos de línea por coordenadas verticales
            let pageText = "";
            let lastY = null;
            content.items.forEach((item) => {
              const y = item.transform ? Math.round(item.transform[5]) : null;
              if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
                pageText += "\n";
              } else if (pageText && !pageText.endsWith(" ") && !pageText.endsWith("\n")) {
                pageText += " ";
              }
              pageText += item.str;
              lastY = y;
            });
            textoExtraido += pageText + "\n";

            // Si la página tiene poco texto (< 35 caracteres), es un PDF escaneado (imagen)
            if (pageText.trim().length < 35) {
              const viewport = page.getViewport({ scale: 2.0 });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext("2d");
              await page.render({ canvasContext: ctx, viewport }).promise;
              imagenesParaOcr.push(canvas);
            }
          }
        } catch (err) {
          console.warn("No se pudo extraer texto directo del PDF con pdf.js:", err);
        }
      }
    } 
    // 2. Si es imagen directa (JPG, PNG, WEBP)
    else if (file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name)) {
      try {
        const img = new Image();
        const imgLoaded = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        await imgLoaded;
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        imagenesParaOcr.push(canvas);
      } catch (errImg) {
        console.warn("No se pudo cargar imagen para análisis:", errImg);
      }
    }

    // 3. Procesamiento OCR óptico si hay imágenes escaneadas y Tesseract está disponible
    if (imagenesParaOcr.length > 0 && window.Tesseract) {
      for (let idx = 0; idx < imagenesParaOcr.length; idx++) {
        if (textoProgreso) {
          textoProgreso.textContent = `Analizando imagen con OCR óptico de alta precisión (página ${idx + 1}/${imagenesParaOcr.length})...`;
        }
        try {
          const resOcr = await Tesseract.recognize(imagenesParaOcr[idx], "spa", {
            logger: (m) => {
              if (m.status === "recognizing text" && textoProgreso) {
                textoProgreso.textContent = `Reconociendo texto óptico... ${Math.round((m.progress || 0) * 100)}%`;
              }
            }
          });
          if (resOcr?.data?.text) {
            textoExtraido += "\n" + resOcr.data.text;
          }
        } catch (errOcr) {
          console.warn("Fallo OCR Tesseract:", errOcr);
        }
      }
    }

    analizarTextoComprobante(textoExtraido, file.name);
  }

  function analizarTextoComprobante(texto, fileName) {
    if (procesandoComp) procesandoComp.hidden = true;
    if (resultadosComp) resultadosComp.hidden = false;

    const textoLimpio = String(texto || "").replace(/\r/g, " ");

    // 1. Extraer número correlativo del comprobante
    // En Venezuela suelen ser de 14 dígitos (ej: 20261100012345), con o sin espacios/guiones,
    // o con etiquetas como N° Comprobante, Correlativo, Retención N°, etc.
    let numComp = "";

    // 1.1) 14 dígitos continuos SENIAT (2020 al 2029)
    const mSeniat = textoLimpio.match(/\b(202[0-9]{11})\b/);
    if (mSeniat) {
      numComp = mSeniat[1];
    }

    // 1.2) 14 dígitos separados por guiones o espacios (ej. 2026-11-00012345 o 2026 11 00012345)
    if (!numComp) {
      const mSeniatSep = textoLimpio.match(/\b(202[0-9])[\s\-_]?([0-9]{2})[\s\-_]?([0-9]{8})\b/);
      if (mSeniatSep) {
        numComp = `${mSeniatSep[1]}${mSeniatSep[2]}${mSeniatSep[3]}`;
      }
    }

    // 1.3) Por etiqueta explícita (N° Comprobante, Correlativo, etc.)
    if (!numComp) {
      const mEtiqueta = textoLimpio.match(/(?:comprobante[\s]+(?:n[°º.o\s]*|de[\s]+retenci[oó]n[\s]+n[°º.o\s]*)?|n[°º.o\s]*comprobante|correlativo[\s:]*|retenci[oó]n[\s]+n[°º.o\s]*)[\s:#]*([a-z0-9\-_/]{4,25})/i);
      if (mEtiqueta && mEtiqueta[1]) {
        numComp = mEtiqueta[1].replace(/^[#№Nn°º.:\s]+/, "").trim();
      }
    }

    // 1.4) Números largos con ceros a la izquierda (ej. 0000012345)
    if (!numComp) {
      const mCeros = textoLimpio.match(/\b(0000[0-9]{4,10})\b/);
      if (mCeros) numComp = mCeros[1];
    }

    // 1.5) A partir del nombre del archivo
    if (!numComp && fileName) {
      const mFile = fileName.match(/(202\d{11}|\d{6,14})/);
      if (mFile) numComp = mFile[1];
    }

    // 2. Extraer fecha del comprobante (opcional)
    let fechaComp = "";
    const mFecha = textoLimpio.match(/\b([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-]202[0-9])\b/);
    if (mFecha) fechaComp = mFecha[1].replace(/-/g, "/");
    else fechaComp = new Date().toLocaleDateString("es-VE");

    // 3. Extraer RIF del Agente de Retención / Cliente (opcional)
    let rifComp = "";
    const mRif = textoLimpio.match(/\b([JVEGP][\- ]?[0-9]{7,9}[\- ]?[0-9]?)\b/i);
    if (mRif) rifComp = mRif[1].replace(/\s+/g, "-").toUpperCase();

    // 4. Búsqueda inteligente de Facturas de Beval presentes en el comprobante
    const facturasDetectadas = new Map();
    const mapaFacturas = new Map();

    estado.facturas.forEach((f) => {
      const facLimpia = String(f.factura).trim();
      mapaFacturas.set(facLimpia, f);
      mapaFacturas.set(facLimpia.padStart(8, "0"), f);
      mapaFacturas.set(facLimpia.replace(/^0+/, ""), f);
    });

    if (textoLimpio) {
      // 4.1 Facturas de 7 dígitos estándar de Beval (3XXXXXX)
      const facs7Digitos = textoLimpio.match(/\b(3\d{6})\b/g) || [];
      // 4.2 Facturas con formato con puntos (ej. 3.394.686)
      const facsPuntos = (textoLimpio.match(/\b3\.\d{3}\.\d{3}\b/g) || []).map((x) => x.replace(/\./g, ""));
      // 4.3 Números generales de 5 a 9 dígitos
      const otrosNums = textoLimpio.match(/\b\d{5,9}\b/g) || [];
      // 4.4 Números tras palabras clave como Factura, Fact, Doc, Control
      const mNear = [...textoLimpio.matchAll(/(?:factura|fact\.?|doc\.?|control|afectad[ao]|n[°º.]?)[\s:#]*([0-9]{5,9})/gi)].map((m) => m[1]);

      const todosCandidatos = [...new Set([...facs7Digitos, ...facsPuntos, ...mNear, ...otrosNums])];

      for (const num of todosCandidatos) {
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

    // 5. Detectar Cliente y sugerir facturas del mismo cliente
    let clienteNombre = "";
    if (facturasDetectadas.size > 0) {
      const primera = [...facturasDetectadas.values()][0];
      clienteNombre = primera.razon_social || primera.codigo_cliente;
    } else if (rifComp) {
      const rifDigitos = rifComp.replace(/\D/g, "");
      const matchRif = estado.facturas.find((f) => (f.rif || f.codigo_cliente || "").replace(/\D/g, "") === rifDigitos);
      if (matchRif) {
        clienteNombre = matchRif.razon_social || matchRif.codigo_cliente;
        // Si encontramos el cliente por RIF, buscar si alguna de sus facturas aparece en el comprobante
        estado.facturas.filter((f) => (f.rif || f.codigo_cliente || "").replace(/\D/g, "") === rifDigitos).forEach((fCli) => {
          if (textoLimpio.includes(String(fCli.factura))) {
            facturasDetectadas.set(String(fCli.factura).trim(), fCli);
          }
        });
      }
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
      aviso(`¡Lectura exitosa! Se detectaron ${facturasDetectadas.size} factura(s) automáticamente.`);
    } else {
      aviso("ℹ️ Documento leído. Puedes ingresar el correlativo y asociar tus facturas abajo.");
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
            <button type="button" class="btn-quitar-fac" data-quitar-fac="${esc(f.factura)}" title="Quitar de este comprobante"></button>
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
      if (!esAdmin() && !esFacturaDeAsesor(f, estado.perfil)) return false;
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
      aviso("Agrega al menos una factura para filtrar");
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
    aviso(`Tabla filtrada con las ${facs.length} facturas del comprobante`);
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
      aviso("Asocia al menos una factura antes de copiar el resumen");
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
    aviso("Resumen para WhatsApp copiado al portapapeles con éxito");
  });

  // Permitir agregar factura pulsando Enter en el buscador del asistente
  inputAsistente?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = (inputAsistente.value || "").trim();
      if (!val) return;
      const valLimpio = val.replace(/\D/g, "");
      const f = estado.facturas.find((x) => String(x.factura).trim() === val || (valLimpio && String(x.factura).trim() === valLimpio));
      if (f) {
        if (!esAdmin() && !esFacturaDeAsesor(f, estado.perfil)) {
          aviso("Esta factura no pertenece a tu cartera");
          return;
        }
        estado.comprobanteActivo.facturas.set(String(f.factura).trim(), f);
        if (!$("comp-input-cliente")?.value) {
          $("comp-input-cliente").value = f.razon_social || f.codigo_cliente;
          estado.comprobanteActivo.cliente = f.razon_social || f.codigo_cliente;
        }
      } else {
        // Permitir asociar la factura manual directamente sin bloqueos
        const facManual = {
          factura: val,
          razon_social: $("comp-input-cliente")?.value || "Factura asociada manualmente",
          codigo_cliente: "COMPROBANTE",
          monto_dolar: 0,
          monto_estimado: 0,
          zona: "N/A",
          vendedor: "N/A",
          fecha_vence: new Date().toISOString().slice(0, 10)
        };
        estado.comprobanteActivo.facturas.set(val, facManual);
      }
      pintarListaFacturasComprobante();
      actualizarOtrasFacturasCliente();
      inputAsistente.value = "";
      if (dropdownSugerencias) dropdownSugerencias.hidden = true;
    }
  });

  // 3. Guardar Comprobante Asociado (Requisitos únicos: correlativo del comprobante y al menos una factura)
  $("btn-comp-guardar")?.addEventListener("click", () => {
    const numComp = ($("comp-input-numero")?.value || "").trim();
    if (!numComp) {
      aviso("El único requisito obligatorio es el número correlativo del comprobante");
      $("comp-input-numero")?.focus();
      return;
    }

    const facs = [...estado.comprobanteActivo.facturas.keys()];
    if (facs.length === 0) {
      aviso("Debe asociar al menos una factura al comprobante");
      $("comp-buscador-asistente")?.focus();
      return;
    }

    const fechaComp = ($("comp-input-fecha")?.value || "").trim() || fecha(new Date().toISOString().slice(0, 10));
    const primeraFac = estado.comprobanteActivo.facturas.values().next().value;
    const clienteComp = ($("comp-input-cliente")?.value || "").trim() || (primeraFac?.razon_social || primeraFac?.codigo_cliente || "Cliente asociado");

    const dataComp = {
      numero: numComp,
      fecha: fechaComp,
      cliente: clienteComp,
      facturas: facs,
      timestamp: new Date().toISOString(),
    };

    guardarComprobanteEnStorage(dataComp);
    estado.comprobantesAsociados[numComp] = dataComp;

    actualizarBadgesComprobantes();
    pintarFacturas();
    pintarPorProcesar();
    pintarComprobantesMontados();
    cerrarModalComprobante();
    aviso(`Comprobante #${numComp} guardado con éxito (${facs.length} factura(s) asociadas)`);
  });

  // ==============================================
  // GESTIÓN Y FILTRADO DE COMPROBANTES MONTADOS
  // ==============================================
  function obtenerComprobantesVisibles() {
    const todos = Object.values(estado.comprobantesAsociados || {});
    if (esAdmin()) return todos;
    return todos.filter((c) => {
      if (!c) return false;
      if (c.creadoPor && String(c.creadoPor).toLowerCase() === String(estado.perfil?.nombre || "").toLowerCase()) return true;
      const facs = Array.isArray(c.facturas) ? c.facturas : [];
      return facs.some((numFac) => {
        const facObj = estado.facturas.find((item) => String(item.factura).trim() === String(numFac).trim());
        return facObj && esFacturaDeAsesor(facObj, estado.perfil);
      });
    });
  }

  function actualizarBadgesComprobantes() {
    const total = obtenerComprobantesVisibles().length;
    const elBadge = $("badge-comprobantes-montados");
    if (elBadge) elBadge.textContent = total;
    const elKpi = $("k-comprobantes-montados");
    if (elKpi) elKpi.textContent = total;
    const elConteo = $("conteo-comprobantes");
    if (elConteo) elConteo.textContent = `${total} comprobante(s) montado(s)`;
  }

  function pintarComprobantesMontados() {
    actualizarBadgesComprobantes();
    const tbody = $("tabla-comprobantes-guardados")?.querySelector("tbody");
    if (!tbody) return;

    const filtro = ($("filtro-comprobantes")?.value || "").trim().toLowerCase();
    const comps = obtenerComprobantesVisibles();

    // Filtrado ágil por correlativo, por número de factura asociada, por cliente o por fecha
    const filtrados = comps.filter((c) => {
      if (!filtro) return true;
      const numC = String(c.numero || "").toLowerCase();
      const cli = String(c.cliente || "").toLowerCase();
      const facsStr = (c.facturas || []).join(" ").toLowerCase();
      const fechaC = String(c.fecha || "").toLowerCase();
      return numC.includes(filtro) || cli.includes(filtro) || facsStr.includes(filtro) || fechaC.includes(filtro);
    });

    if (filtrados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 36px 16px; color: var(--suave);">
        ${comps.length === 0
          ? "No has montado ningún comprobante todavía.<br><br><button type='button' class='btn primario btn-exito-beval' onclick='document.getElementById(\"btn-nuevo-comprobante-tab\")?.click()'>+ Montar Primer Comprobante</button>"
          : "No se encontraron comprobantes que coincidan con la búsqueda."}
      </td></tr>`;
      return;
    }

    filtrados.sort((a, b) => (b.timestamp || b.numero || "").localeCompare(a.timestamp || a.numero || ""));

    tbody.innerHTML = filtrados.map((c) => {
      let montoTotalFacturas = 0;
      let montoTotalRetenido = 0;
      const chipsFacturas = (c.facturas || []).map((facNum) => {
        const f = estado.facturas.find((item) => String(item.factura).trim() === String(facNum).trim());
        if (f) {
          montoTotalFacturas += Number(f.monto_dolar) || 0;
          montoTotalRetenido += Number(f.monto_estimado) || 0;
        }
        return `<span class="chip-fac-link" data-filtrar-fac="${esc(facNum)}" title="Ver factura #${esc(facNum)} en la tabla">#${esc(facNum)}</span>`;
      }).join(" ");

      return `<tr>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-family: monospace; font-size: 13.5px; color: var(--texto);">${esc(c.numero)}</strong>
            <button type="button" class="btn-copiar-mini" data-copiar-txt="${esc(c.numero)}" title="Copiar correlativo"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          </div>
          <small style="color: var(--suave); font-size: 10px;">${c.timestamp ? new Date(c.timestamp).toLocaleDateString("es-VE") : ""}</small>
        </td>
        <td>${esc(c.fecha || "-")}</td>
        <td>
          <strong style="color: var(--texto);">${esc(c.cliente || "Cliente no especificado")}</strong>
        </td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${chipsFacturas || '<em style="color: var(--suave); font-size: 11px;">Sin facturas</em>'}
          </div>
        </td>
        <td class="num" style="font-weight: 700;">${(c.facturas || []).length}</td>
        <td class="num celda-estimado">$${usd(montoTotalFacturas)}</td>
        <td style="text-align: center;">
          <div style="display: flex; justify-content: center; gap: 6px;">
            <button type="button" class="btn btn-sm btn-secundario" data-ver-detalle-comp="${esc(c.numero)}" title="Ver y editar facturas de este comprobante">
              Ver
            </button>
            <button type="button" class="btn btn-sm btn-secundario" data-eliminar-comp="${esc(c.numero)}" title="Eliminar comprobante" style="color: #dc2626;" aria-label="Eliminar comprobante">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  function abrirDetalleComprobante(numComp) {
    const comp = estado.comprobantesAsociados[numComp];
    if (!comp) return;

    limpiarModalComprobante();
    if (dropzoneComp) dropzoneComp.hidden = true;
    if (procesandoComp) procesandoComp.hidden = true;
    if (resultadosComp) resultadosComp.hidden = false;

    estado.comprobanteActivo.numero = comp.numero;
    estado.comprobanteActivo.fecha = comp.fecha || "";
    estado.comprobanteActivo.cliente = comp.cliente || "";

    (comp.facturas || []).forEach((facNum) => {
      const f = estado.facturas.find((item) => String(item.factura).trim() === String(facNum).trim());
      if (f) {
        estado.comprobanteActivo.facturas.set(String(facNum).trim(), f);
      } else {
        estado.comprobanteActivo.facturas.set(String(facNum).trim(), {
          factura: facNum,
          razon_social: comp.cliente || "Factura asociada",
          codigo_cliente: "COMPROBANTE",
          monto_dolar: 0,
          monto_estimado: 0,
          zona: "N/A",
          vendedor: "N/A",
          fecha_vence: new Date().toISOString().slice(0, 10)
        });
      }
    });

    if ($("comp-input-numero")) $("comp-input-numero").value = comp.numero;
    if ($("comp-input-fecha")) $("comp-input-fecha").value = comp.fecha || "";
    if ($("comp-input-cliente")) $("comp-input-cliente").value = comp.cliente || "";

    pintarListaFacturasComprobante();
    actualizarOtrasFacturasCliente();
    abrirModalComprobante();
  }

  // Eventos de gestión de comprobantes montados
  $("filtro-comprobantes")?.addEventListener("input", pintarComprobantesMontados);
  $("btn-nuevo-comprobante-tab")?.addEventListener("click", () => {
    limpiarModalComprobante();
    abrirModalComprobante();
  });
  $("kpi-card-comprobantes")?.addEventListener("click", () => {
    document.querySelector("#pestanas button[data-tab='comprobantes']")?.click();
  });

  // Delegación de eventos para comprobantes
  document.addEventListener("click", (e) => {
    // Ver detalle de comprobante
    const btnVer = e.target.closest("[data-ver-detalle-comp]");
    if (btnVer) {
      e.stopPropagation();
      e.preventDefault();
      abrirDetalleComprobante(btnVer.dataset.verDetalleComp);
      return;
    }

    // Eliminar comprobante
    const btnElim = e.target.closest("[data-eliminar-comp]");
    if (btnElim) {
      e.stopPropagation();
      e.preventDefault();
      const numC = btnElim.dataset.eliminarComp;
      const c = estado.comprobantesAsociados[numC];
      if (confirm(`¿Eliminar el comprobante #${numC} y desasociar sus ${(c?.facturas || []).length} factura(s)?`)) {
        eliminarComprobanteDeStorage(numC);
        delete estado.comprobantesAsociados[numC];
        actualizarBadgesComprobantes();
        pintarFacturas();
        pintarPorProcesar();
        pintarComprobantesMontados();
        aviso(`Comprobante #${numC} eliminado`);
      }
      return;
    }

    // Filtrar factura en la tabla principal
    const chipFac = e.target.closest("[data-filtrar-fac]");
    if (chipFac) {
      e.stopPropagation();
      e.preventDefault();
      const facNum = chipFac.dataset.filtrarFac;
      const btnTab = document.querySelector("#pestanas button[data-tab='facturas']");
      if (btnTab) btnTab.click();
      const buscadorFac = $("buscar-factura");
      if (buscadorFac) {
        buscadorFac.value = facNum;
        buscadorFac.dispatchEvent(new Event("input"));
      }
      return;
    }

    // Copiar texto genérico (ej: correlativo comprobante)
    const btnCopiar = e.target.closest("[data-copiar-txt]");
    if (btnCopiar) {
      e.stopPropagation();
      e.preventDefault();
      const txt = btnCopiar.dataset.copiarTxt;
      if (txt && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => {
          aviso(`Correlativo #${txt} copiado al portapapeles`);
        }).catch(() => {
          aviso(`${txt}`);
        });
      }
      return;
    }
  });

  // ==========================================
  // GESTIÓN DE ACCESOS Y CONTRASEÑAS DE ASESORES
  // ==========================================
  let asesorEditandoCred = null;

  function abrirModalCredencial(cod) {
    if (!esAdmin()) return;
    if (!cod) return;
    const v = buscarVendedor(cod);
    const zonaV = v.zona || (estado.facturas.find((f) => f.vendedor === cod || f.vendedor_original === cod)?.zona) || "";
    const cred = obtenerCredencialVendedor(cod, zonaV);

    asesorEditandoCred = { cod, v, cred, zona: zonaV };

    $("mc-asesor-nombre").textContent = v.nombre || cod;
    $("mc-asesor-zona").textContent = `Zona: ${zonaV || "S/Z"} · Código: ${v.codigo || "S/C"} · Tel: ${v.telefono || "Sin tel."}`;
    $("mc-input-usuario").value = cred.usuario;
    $("mc-input-clave").value = cred.clave;
    $("mc-input-clave").type = "text";
    $("modal-credencial").hidden = false;
    $("mc-input-usuario").focus();
  }

  function cerrarModalCredencial() {
    $("modal-credencial").hidden = true;
    asesorEditandoCred = null;
  }

  // Sugerencias rápidas de usuario
  $("mc-sug-pnombre")?.addEventListener("click", () => {
    if (asesorEditandoCred?.cred?.primerNombre) {
      $("mc-input-usuario").value = asesorEditandoCred.cred.primerNombre;
    }
  });

  $("mc-sug-zona")?.addEventListener("click", () => {
    const z = asesorEditandoCred?.zona || asesorEditandoCred?.v?.zona;
    if (z) $("mc-input-usuario").value = z.toLowerCase();
  });

  $("mc-sug-cod")?.addEventListener("click", () => {
    const c = asesorEditandoCred?.v?.codigo || asesorEditandoCred?.cred?.codigo;
    if (c) $("mc-input-usuario").value = String(c).toLowerCase();
  });

  // Sugerencias rápidas de clave
  $("mc-sug-clave-user")?.addEventListener("click", () => {
    $("mc-input-clave").value = ($("mc-input-usuario").value || "").trim();
  });

  $("mc-sug-clave-beval")?.addEventListener("click", () => {
    $("mc-input-clave").value = "beval2026";
  });

  $("mc-sug-clave-123")?.addEventListener("click", () => {
    $("mc-input-clave").value = "123456";
  });

  // Toggle visibilidad de clave
  $("mc-btn-ver-clave")?.addEventListener("click", () => {
    const inp = $("mc-input-clave");
    if (!inp) return;
    if (inp.type === "password") {
      inp.type = "text";
    } else {
      inp.type = "password";
    }
  });

  // Guardar credencial
  $("mc-btn-guardar")?.addEventListener("click", () => {
    if (!asesorEditandoCred) return;
    const u = ($("mc-input-usuario").value || "").trim();
    const c = ($("mc-input-clave").value || "").trim();

    if (!u || !c) {
      aviso("El usuario y la contraseña no pueden estar vacíos");
      return;
    }

    guardarCredencialCustom(asesorEditandoCred.cod, u, c, asesorEditandoCred.v.nombre, asesorEditandoCred.zona);
    cerrarModalCredencial();
    pintarVendedores();
    if (!$("modal-todos-accesos")?.hidden) pintarTablaTodosAccesos();
    aviso(`Acceso guardado para ${asesorEditandoCred.v.nombre || asesorEditandoCred.cod}: Usuario "${u}" | Clave "${c}"`);
  });

  // Restablecer por defecto
  $("mc-btn-restablecer")?.addEventListener("click", () => {
    if (!asesorEditandoCred) return;
    const nom = asesorEditandoCred.v.nombre || asesorEditandoCred.cod;
    if (confirm(`¿Restablecer el acceso por defecto para ${nom}?\n\nVolverá al primer nombre como usuario y contraseña.`)) {
      eliminarCredencialCustom(asesorEditandoCred.cod, asesorEditandoCred.v.nombre);
      cerrarModalCredencial();
      pintarVendedores();
      if (!$("modal-todos-accesos")?.hidden) pintarTablaTodosAccesos();
      aviso(`Acceso restablecido por defecto para ${nom}`);
    }
  });

  // Copiar mensaje listo para WhatsApp
  $("mc-btn-copiar-ws")?.addEventListener("click", () => {
    if (!asesorEditandoCred) return;
    const u = ($("mc-input-usuario").value || "").trim();
    const c = ($("mc-input-clave").value || "").trim();
    const v = asesorEditandoCred.v;
    const urlApp = window.location.href.split("?")[0].split("#")[0];

    const texto = `*DISTRIBUIDORA BEVAL, C.A.*
Hola *${v.nombre || asesorEditandoCred.cod}*, aquí tienes tus datos de acceso al sistema de cobranzas y retenciones:

🌐 *Enlace:* ${urlApp}
👤 *Usuario:* ${u}
🔑 *Contraseña:* ${c}

_Al ingresar podrás consultar tus clientes asignados y gestionar las facturas pendientes._`;

    navigator.clipboard.writeText(texto).then(() => {
      aviso("Mensaje de acceso copiado al portapapeles listo para enviar por WhatsApp");
    }).catch(() => {
      prompt("Copia este mensaje para el asesor:", texto);
    });
  });

  $("btn-cerrar-mc")?.addEventListener("click", cerrarModalCredencial);
  $("mc-btn-cancelar")?.addEventListener("click", cerrarModalCredencial);
  $("modal-credencial")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-credencial") cerrarModalCredencial();
  });

  // Listener delegado para los botones de editar credencial en la tabla
  document.addEventListener("click", (e) => {
    const btnCred = e.target.closest("[data-editar-cred]");
    if (btnCred) {
      e.stopPropagation();
      e.preventDefault();
      abrirModalCredencial(btnCred.dataset.editarCred);
    }
  });

  // ------------------------------------------
  // MODAL DE TODOS LOS ACCESOS Y CREDENCIALES
  // ------------------------------------------
  function abrirModalTodosAccesos() {
    if (!esAdmin()) return;
    pintarTablaTodosAccesos();
    $("modal-todos-accesos").hidden = false;
  }

  function cerrarModalTodosAccesos() {
    $("modal-todos-accesos").hidden = true;
  }

  function pintarTablaTodosAccesos() {
    const tbody = $("tabla-todos-accesos")?.querySelector("tbody");
    if (!tbody) return;

    const filtro = ($("mta-filtro")?.value || "").trim().toUpperCase();
    const listaG = grupos(estado.facturas);

    const filas = listaG.map((g) => {
      const v = buscarVendedor(g.cod, null, g.zona);
      const cred = obtenerCredencialVendedor(g.cod, g.zona);
      return { g, v, cred };
    }).filter(({ v, cred, g }) => {
      if (!filtro) return true;
      const s = `${v.nombre} ${v.zona} ${g.cod} ${cred.usuario} ${cred.clave}`.toUpperCase();
      return s.includes(filtro);
    });

    tbody.innerHTML = filas.map(({ g, v, cred }) => {
      return `<tr>
        <td style="font-weight: 700; color: var(--suave);">${esc(g.zona || v.zona || "S/Z")}</td>
        <td>
          <strong>${esc(v.nombre || g.cod)}</strong><br>
          <small style="color: var(--suave); font-size: 11px;">Tel: ${esc(v.telefono || "Sin tel.")}</small>
        </td>
        <td><strong style="color: var(--texto); font-family: monospace; font-size: 13px;">${esc(cred.usuario)}</strong></td>
        <td>
          <strong style="color: var(--primario); font-family: monospace; font-size: 13px;">${esc(cred.clave)}</strong>
          ${cred.esPersonalizada ? '<span class="badge-personalizado" style="margin-left: 6px;">Personalizada</span>' : ''}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-sm btn-secundario" data-editar-cred="${esc(g.cod)}" title="Editar usuario y clave">
            Cambiar
          </button>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--suave);">No se encontraron asesores con ese filtro.</td></tr>`;
  }

  $("btn-gestionar-credenciales")?.addEventListener("click", abrirModalTodosAccesos);
  $("btn-cerrar-mta")?.addEventListener("click", cerrarModalTodosAccesos);
  $("modal-todos-accesos")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-todos-accesos") cerrarModalTodosAccesos();
  });

  $("mta-filtro")?.addEventListener("input", pintarTablaTodosAccesos);

  // Exportar credenciales a CSV
  $("mta-btn-exportar")?.addEventListener("click", () => {
    const listaG = grupos(estado.facturas);
    const lineas = ["Zona,Asesor Comercial,Telefono,Usuario Login,Contrasena,Tipo"];
    listaG.forEach((g) => {
      const v = buscarVendedor(g.cod, null, g.zona);
      const cred = obtenerCredencialVendedor(g.cod, g.zona);
      lineas.push(`"${g.zona || v.zona || ""}","${(v.nombre || g.cod).replace(/"/g, '""')}","${v.telefono || ""}","${cred.usuario}","${cred.clave}","${cred.esPersonalizada ? "Personalizada" : "Por defecto"}"`);
    });
    const blob = new Blob([lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credenciales_asesores_beval_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    aviso("Archivo CSV con los accesos descargado");
  });

  iniciar().catch((err) => {
    console.error("Error al iniciar aplicación:", err);
    $("cargando").textContent = "Error: " + err.message;
  });
})();