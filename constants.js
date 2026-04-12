// ============================================================
// constants.js — Datos estáticos y configuración global
// Responsabilidad: definir constantes que el resto de los
// módulos consumen, sin lógica propia.
// ============================================================

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export const CUR_YEAR = new Date().getFullYear();

export const CAT_FIJOS = [
  { key:'vivienda',      label:'Vivienda',       icon:'🏠', color:'#7c6dfa' },
  { key:'servicios',     label:'Servicios',       icon:'💡', color:'#6dfad0' },
  { key:'impuestos',     label:'Impuestos',       icon:'🏛️', color:'#fa6d9a' },
  { key:'prestamo',      label:'Préstamo',        icon:'🏦', color:'#fad06d' },
  { key:'ahorro',        label:'Ahorro',          icon:'💰', color:'#4ade80' },
  { key:'suscripciones', label:'Suscripciones',   icon:'📱', color:'#60a5fa' },
  { key:'seguro',        label:'Seguro',          icon:'🛡️', color:'#a78bfa' },
];

export const CAT_VARIABLES = [
  { key:'alimentacion',    label:'Alimentación',     icon:'🛒', color:'#fb923c' },
  { key:'cuidado_personal',label:'Cuidado Personal', icon:'💊', color:'#f472b6' },
  { key:'salidas',         label:'Salidas',           icon:'🎉', color:'#c084fc' },
  { key:'regalos',         label:'Regalos',           icon:'🎁', color:'#f87171' },
  { key:'mascotas',        label:'Mascotas',          icon:'🐾', color:'#fb923c' },
  { key:'viaticos',        label:'Viáticos',          icon:'🚗', color:'#34d399' },
  { key:'ropa',            label:'Ropa',              icon:'👕', color:'#38bdf8' },
  { key:'vacaciones',      label:'Vacaciones',        icon:'✈️', color:'#818cf8' },
  { key:'extras',          label:'Extras',            icon:'⭐', color:'#fbbf24' },
  { key:'salud',           label:'Salud',             icon:'❤️', color:'#f87171' },
];

export const ALL_CATS = [...CAT_FIJOS, ...CAT_VARIABLES];
