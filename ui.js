/* =====================================================================
   BEVAL · Capa de interacción (solo visual).
   No modifica la lógica de app.js: escucha y decora el DOM existente.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var reducirMov = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var guardar = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var leer = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  function saludoHora() {
    var h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }

  /* ------------------------------------------------------------------
     LOGIN
     ------------------------------------------------------------------ */
  var marca = $("lg-marca");
  var canvas = $("lg-puntos");
  var usuario = $("login-correo");
  var clave = $("login-clave");
  var tarjeta = $("auto-card");
  var error = $("login-error");

  if ($("lg-saludo")) $("lg-saludo").textContent = saludoHora();

  // Campo de puntos que se agranda alrededor del cursor
  if (marca && canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, paso = 26;
    var raton = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    var activo = false;

    var medir = function () {
      var r = marca.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    var dibujar = function () {
      ctx.clearRect(0, 0, W, H);
      raton.x += (raton.tx - raton.x) * 0.12;
      raton.y += (raton.ty - raton.y) * 0.12;
      var radio = 190;
      for (var y = paso / 2; y < H; y += paso) {
        for (var x = paso / 2; x < W; x += paso) {
          var dx = x - raton.x, dy = y - raton.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          var f = Math.max(0, 1 - d / radio);
          var e = f * f;
          var r = 1.1 + e * 3.6;
          // los puntos cercanos se apartan ligeramente del cursor
          var ox = d > 0 ? (dx / d) * e * 7 : 0;
          var oy = d > 0 ? (dy / d) * e * 7 : 0;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r, 0, 6.2832);
          ctx.fillStyle = "rgba(22,22,21," + (0.1 + e * 0.55).toFixed(3) + ")";
          ctx.fill();
        }
      }
      if (activo) requestAnimationFrame(dibujar);
    };
    var iniciarCampo = function () {
      if (activo || marca.offsetParent === null) return;
      activo = true; medir(); requestAnimationFrame(dibujar);
    };

    marca.addEventListener("pointermove", function (e) {
      var r = marca.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      raton.tx = x; raton.ty = y;
      if (raton.x < -1000) { raton.x = x; raton.y = y; }
      marca.style.setProperty("--mx", x + "px");
      marca.style.setProperty("--my", y + "px");
      // leve paralaje del logo
      var logo = marca.querySelector(".lg-logo");
      if (logo && !reducirMov) {
        logo.style.setProperty("--px", ((x / r.width - 0.5) * 14).toFixed(1) + "px");
        logo.style.setProperty("--py", ((y / r.height - 0.5) * 10).toFixed(1) + "px");
      }
    });
    marca.addEventListener("pointerleave", function () { raton.tx = -9999; raton.ty = -9999; });
    window.addEventListener("resize", function () { if (activo) medir(); });

    // El login se muestra cuando app.js quita "hidden": arrancamos en ese momento
    var vistaLogin = $("vista-login");
    if (vistaLogin) {
      new MutationObserver(function () {
        if (!vistaLogin.hidden) { if (reducirMov) { medir(); dibujar(); } else iniciarCampo(); }
        else activo = false;
      }).observe(vistaLogin, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  // Selector de perfil (asesor / administración): ajusta las ayudas
  var rol = $("lg-rol");
  var pista = $("lg-pista");
  var textos = {
    asesor: { pista: "Tu usuario es tu primer nombre (ej. «angel»).", ph: "Usuario" },
    admin: { pista: "Usa tu usuario corporativo o tu correo @beval.biz.", ph: "Usuario o correo" }
  };
  function ponerRol(r) {
    if (!rol) return;
    rol.dataset.rol = r;
    rol.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.rol === r));
    });
    if (pista) {
      pista.style.opacity = 0;
      setTimeout(function () { pista.textContent = textos[r].pista; pista.style.opacity = 1; }, 150);
    }
    var lbl = document.querySelector('label[for="login-correo"]');
    if (lbl) lbl.textContent = textos[r].ph;
    guardar("beval_rol_login", r);
  }
  if (rol) {
    rol.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-rol]");
      if (b) { ponerRol(b.dataset.rol); usuario && usuario.focus(); }
    });
    rol.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        ponerRol(rol.dataset.rol === "admin" ? "asesor" : "admin");
        rol.querySelector('[aria-checked="true"]').focus();
      }
    });
    ponerRol(leer("beval_rol_login") === "admin" ? "admin" : "asesor");
  }

  // Mostrar / ocultar contraseña
  var ojo = $("ojo-clave");
  if (ojo && clave) {
    ojo.addEventListener("click", function () {
      var ver = clave.type === "password";
      clave.type = ver ? "text" : "password";
      ojo.setAttribute("aria-pressed", String(ver));
      ojo.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
      clave.focus();
    });
  }

  // Aviso de Bloq Mayús
  var mayus = $("lg-mayus");
  if (clave && mayus) {
    var revisarMayus = function (e) {
      if (e.getModifierState) mayus.hidden = !e.getModifierState("CapsLock");
    };
    clave.addEventListener("keydown", revisarMayus);
    clave.addEventListener("keyup", revisarMayus);
    clave.addEventListener("blur", function () { mayus.hidden = true; });
  }

  // Barra de progreso del formulario
  var barra = $("lg-progreso-barra");
  function progreso() {
    if (!barra) return;
    var n = (usuario && usuario.value.trim() ? 1 : 0) + (clave && clave.value ? 1 : 0);
    barra.style.width = (n * 50) + "%";
  }
  [usuario, clave].forEach(function (el) { el && el.addEventListener("input", progreso); });

  // Temblor cuando app.js muestra un error
  if (error && tarjeta) {
    new MutationObserver(function () {
      if (!error.hidden) {
        tarjeta.classList.remove("temblor");
        void tarjeta.offsetWidth;
        tarjeta.classList.add("temblor");
        clave && clave.select();
      }
    }).observe(error, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* ------------------------------------------------------------------
     APLICACIÓN
     ------------------------------------------------------------------ */
  var shell = $("vista-app");
  var nav = $("pestanas");
  var titulo = $("tb-titulo");

  // Saludo con el nombre del usuario + iniciales en el avatar
  var nombreEl = $("usuario-nombre");
  function actualizarUsuario() {
    var n = (nombreEl && nombreEl.textContent || "").trim();
    var partes = n.split(/\s+/).filter(Boolean);
    var ini = partes.length ? (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase() : "B";
    if ($("sb-avatar")) $("sb-avatar").textContent = ini;
    var primero = partes[0] ? partes[0].charAt(0) + partes[0].slice(1).toLowerCase() : "";
    if ($("tb-saludo")) $("tb-saludo").textContent = saludoHora() + (primero ? ", " + primero : "");
  }
  if (nombreEl) new MutationObserver(actualizarUsuario).observe(nombreEl, { childList: true, characterData: true, subtree: true });
  actualizarUsuario();

  // Título de la barra superior según la pestaña activa
  function cerrarMenu() { shell && shell.classList.remove("sb-abierta"); }
  if (nav && titulo) {
    nav.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-tab]");
      if (!b) return;
      titulo.textContent = b.dataset.titulo || b.textContent.trim();
      titulo.classList.remove("cambio"); void titulo.offsetWidth; titulo.classList.add("cambio");
      cerrarMenu();
      window.scrollTo({ top: 0, behavior: reducirMov ? "auto" : "smooth" });
    });
  }
  // Cuando app.js cambia de pestaña por código (p. ej. al hacer clic en un KPI), sincronizamos el título
  if (nav && titulo) {
    new MutationObserver(function () {
      var a = nav.querySelector("button.activa");
      if (a && a.dataset.titulo && titulo.textContent !== a.dataset.titulo) titulo.textContent = a.dataset.titulo;
    }).observe(nav, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  // Barra lateral: contraer (escritorio) y abrir/cerrar (móvil)
  if (shell) {
    if (leer("beval_sb_mini") === "1") shell.classList.add("sb-mini");
    $("sb-colapsar") && $("sb-colapsar").addEventListener("click", function () {
      var mini = shell.classList.toggle("sb-mini");
      guardar("beval_sb_mini", mini ? "1" : "0");
    });
    $("tb-menu") && $("tb-menu").addEventListener("click", function () { shell.classList.add("sb-abierta"); });
    $("sb-velo") && $("sb-velo").addEventListener("click", cerrarMenu);
    $("btn-abrir-comprobante-nav") && $("btn-abrir-comprobante-nav").addEventListener("click", cerrarMenu);
  }

  // Sombra de la barra superior al hacer scroll
  var topbar = document.querySelector(".topbar");
  if (topbar) {
    var enScroll = false;
    window.addEventListener("scroll", function () {
      if (enScroll) return;
      enScroll = true;
      requestAnimationFrame(function () {
        topbar.classList.toggle("con-sombra", window.scrollY > 8);
        enScroll = false;
      });
    }, { passive: true });
  }

  // Indicador de atajo "/" en el buscador
  var buscar = $("f-buscar");
  if (buscar && buscar.parentElement) {
    var kbd = document.createElement("kbd");
    kbd.className = "atajo-kbd";
    kbd.textContent = "/";
    buscar.parentElement.appendChild(kbd);
  }

  // Los números de los KPI cuentan hacia su nuevo valor
  function aNumero(t) {
    var limpio = String(t).replace(/[^\d,.-]/g, "");
    if (!limpio) return null;
    // formato es-VE: 1.234,56
    var n = parseFloat(limpio.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  document.querySelectorAll("#vista-app .kpi strong").forEach(function (el) {
    var previo = aNumero(el.textContent) || 0;
    var anim = 0;
    var obs = new MutationObserver(function () {
      var final = el.textContent;
      var objetivo = aNumero(final);
      if (objetivo === null || objetivo === previo) { previo = objetivo === null ? previo : objetivo; return; }
      var decimales = /,\d{1,2}$/.test(final) ? 2 : 0;
      var desde = previo, t0 = performance.now(), dur = reducirMov ? 0 : 700;
      previo = objetivo;
      el.classList.remove("destello"); void el.offsetWidth; el.classList.add("destello");
      if (!dur || document.hidden) { anim++; return; }
      var id = ++anim;   // una animación nueva cancela la anterior
      function escribir(txt) {
        el.textContent = txt;
        obs.takeRecords();   // descarta nuestras propias mutaciones
      }
      escribir(desde.toLocaleString("es-VE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }));
      requestAnimationFrame(function animar(t) {
        if (id !== anim) return;
        var p = Math.min(1, Math.max(0, (t - t0) / dur));
        var e = 1 - Math.pow(1 - p, 3);
        escribir(p < 1
          ? (desde + (objetivo - desde) * e).toLocaleString("es-VE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
          : final);
        if (p < 1) requestAnimationFrame(animar);
      });
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  });

  // Los contadores del menú "saltan" cuando cambian
  document.querySelectorAll(".sb-nav .tab-badge").forEach(function (b) {
    var antes = b.textContent;
    new MutationObserver(function () {
      if (b.textContent === antes) return;
      antes = b.textContent;
      b.classList.remove("saltar"); void b.offsetWidth; b.classList.add("saltar");
    }).observe(b, { childList: true, characterData: true, subtree: true });
  });

  // Brillo que sigue al cursor en tarjetas
  document.querySelectorAll("#vista-app .kpi, #vista-app .vh-metric").forEach(function (c) { c.classList.add("brillo"); });
  document.addEventListener("pointermove", function (e) {
    var c = e.target.closest && e.target.closest(".brillo");
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  // Onda al hacer clic en botones
  if (!reducirMov) {
    document.addEventListener("pointerdown", function (e) {
      var b = e.target.closest && e.target.closest(".btn, .sb-nav button, .sb-cta, .lg-entrar");
      if (!b || b.disabled) return;
      var r = b.getBoundingClientRect();
      var s = Math.max(r.width, r.height);
      var o = document.createElement("span");
      o.className = "onda";
      o.style.width = o.style.height = s + "px";
      o.style.left = (e.clientX - r.left - s / 2) + "px";
      o.style.top = (e.clientY - r.top - s / 2) + "px";
      if (getComputedStyle(b).position === "static") b.style.position = "relative";
      b.style.overflow = "hidden";
      b.appendChild(o);
      setTimeout(function () { o.remove(); }, 650);
    });
  }

  // Atajos de teclado (solo dentro de la aplicación)
  document.addEventListener("keydown", function (e) {
    if (!shell || shell.hidden) return;
    var t = e.target;
    var escribiendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    var modalAbierto = !!document.querySelector(".modal-backdrop:not([hidden])");

    if (e.key === "Escape") {
      if (shell.classList.contains("sb-abierta")) { cerrarMenu(); return; }
      if (escribiendo && t.id === "f-buscar") t.blur();
      return;
    }
    if (escribiendo || modalAbierto || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "/") { e.preventDefault(); buscar && buscar.focus(); return; }
    if (e.key === "[") { $("sb-colapsar") && $("sb-colapsar").click(); return; }
    if (e.key === "t" || e.key === "T") { $("btn-tema") && $("btn-tema").click(); return; }
    if (e.key === "r" || e.key === "R") { $("btn-refrescar") && $("btn-refrescar").click(); return; }
    if (/^[1-4]$/.test(e.key) && nav) {
      var b = nav.querySelector('button[data-atajo="' + e.key + '"]');
      if (b && !b.hidden) b.click();
    }
  });

  // Módulo de avance: reparte el texto de app.js ("20% (Proy. Cierre 70%)") en cifras grandes
  var avTxt = $("vh-avance-txt");
  if (avTxt) {
    var avNum = $("av-num"), avEtq = $("av-etq"), avProy = $("av-proy"),
        avProyNum = $("av-proy-num"), avProyFill = $("av-proy-fill");
    var avPrevio = 0, avAnim = 0;
    var pintarAvance = function () {
      var t = avTxt.textContent || "";
      var m = t.match(/(\d+)\s*%/);
      var avance = m ? parseInt(m[1], 10) : 0;
      var p = t.match(/Proy[^\d]*(\d+)\s*%/i);
      var recuperado = /recuperad/i.test(t);
      if (avEtq) avEtq.textContent = recuperado ? "recuperado" : "cobrado";
      if (avProy) avProy.hidden = !p;
      if (avProyNum && p) avProyNum.textContent = p[1] + "%";
      if (avProyFill) avProyFill.style.width = (p ? Math.min(100, parseInt(p[1], 10)) : 0) + "%";
      if (!avNum) return;
      var desde = avPrevio, id = ++avAnim, t0 = performance.now();
      avPrevio = avance;
      if (reducirMov || document.hidden || desde === avance) { avNum.textContent = avance; return; }
      requestAnimationFrame(function paso(ahora) {
        if (id !== avAnim) return;
        var k = Math.min(1, Math.max(0, (ahora - t0) / 800));
        avNum.textContent = Math.round(desde + (avance - desde) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(paso);
      });
    };
    new MutationObserver(pintarAvance).observe(avTxt, { childList: true, characterData: true, subtree: true });
    pintarAvance();
  }

  // Cambio de tema animado: un círculo que se expande desde el botón
  var tema = $("btn-tema");
  if (tema) {
    var enTransicion = false;
    tema.addEventListener("click", function (e) {
      if (enTransicion) return;              // el clic re-emitido pasa directo a app.js
      e.stopImmediatePropagation();
      var r = tema.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var cambiar = function () { enTransicion = true; tema.click(); enTransicion = false; };
      tema.classList.remove("girando-tema"); void tema.offsetWidth; tema.classList.add("girando-tema");

      if (!document.startViewTransition || reducirMov) {
        document.documentElement.classList.add("tema-transicion");
        cambiar();
        setTimeout(function () { document.documentElement.classList.remove("tema-transicion"); }, 600);
        return;
      }
      var vt = document.startViewTransition(cambiar);
      vt.ready.then(function () {
        document.documentElement.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radio + "px at " + x + "px " + y + "px)"] },
          { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      }).catch(function () {});
    }, true);   // fase de captura: se ejecuta antes que el manejador de app.js
    tema.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tema.click(); }
    });
    // relanza la animación del icono al cambiar de tema
    new MutationObserver(function () {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", document.documentElement.getAttribute("data-theme") === "dark" ? "#0e0f0c" : "#ccdb2a");
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
})();
