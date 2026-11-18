// Datos públicos del proyecto Supabase y Google Sheets maestro
window.APP_CONFIG = {
  SUPABASE_URL: "https://wmocgpslihuwyosaxpgg.supabase.co",
  SUPABASE_KEY: "sb_publishable_tf179y8v8vzpxFayXcZXKA_FWZHeVpD",
  GOOGLE_SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/1Jf5oSCIGX7wKNswlpsea8mWDRqa2DYgKYVuNN5sqH6w/export?format=csv&gid=0",
  GOOGLE_SHEET_URL: "https://docs.google.com/spreadsheets/d/1Jf5oSCIGX7wKNswlpsea8mWDRqa2DYgKYVuNN5sqH6w/edit?gid=0#gid=0",
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
