// Datos públicos del proyecto Supabase (la clave publishable es segura en el navegador).
window.APP_CONFIG = {
  SUPABASE_URL: "https://wmocgpslihuwyosaxpgg.supabase.co",
  SUPABASE_KEY: "sb_publishable_tf179y8v8vzpxFayXcZXKA_FWZHeVpD",
  EMPRESA: "Beval",
  // Los vendedores entran con su código; por dentro se usa v<código>@<este dominio>
  DOMINIO_VENDEDORES: "vendedores.beval.biz",
  MENSAJE: [
    "Buen día, {VENDEDOR}.",
    "",
    "Se encuentran pendientes los comprobantes de retención de IVA de {FACTURAS} facturas de tu cartera, por un estimado de {ESTIMADO} USD.",
    "",
    "{DETALLE}",
    "",
    "Agradezco tu gestión para solicitarlos a los clientes."
  ].join("\n")
};
