# FinTrack · Control de Gastos Personal

FinTrack es una aplicación web ligera, moderna y **completamente gratuita** diseñada para ayudarte a tomar el control total de tus finanzas personales. Con una interfaz minimalista y enfocada en la experiencia de usuario móvil, permite gestionar ingresos, gastos y presupuestos de manera eficiente.

![Estado](https://img.shields.io/badge/Status-Gratis-brightgreen)
![Tecnologías](https://img.shields.io/badge/Tech-HTML%20%7C%20CSS%20%1C%20JS-blue)

## ✨ Características Principales

- **Dashboard Inteligente**: Visualiza de un vistazo tu balance mensual, ingresos totales, gastos y cumplimiento de presupuesto.
- **Comparativa Mensual y Meta de Ahorro**: Cada mes se compara con el anterior (el balance y el gasto por categoría muestran con flechas si subiste o bajaste) y podés definir una meta de ahorro —en % de ingresos o como monto fijo— con su barra de progreso.
- **Gestión de Gastos**: Clasifica tus salidas en categorías fijas (Vivienda, Servicios, Ahorro, etc.) y variables (Alimentación, Salidas, Ropa, etc.).
- **Gastos Recurrentes**: Cargás el alquiler, Netflix o el gimnasio una sola vez y se generan solos cada mes. El importe base se edita donde quieras —desde la pestaña o desde el propio gasto— y el mes siguiente usa el valor nuevo; los ya generados se marcan con `↻`, se pueden pausar y borrar.
- **Control de Presupuesto (Budget vs Real)**: Define límites mensuales por categoría y monitorea cuánto has ejecutado en tiempo real con alertas visuales.
- **Seguimiento de Ingresos**: Registra tus fuentes de ingresos (Sueldo, Freelance, Inversiones) y visualiza proyecciones anuales.
- **Historial Detallado**: Filtra y revisa tus movimientos por mes y categoría.
- **Búsqueda y Orden en Gastos**: Encontrá un gasto del mes escribiendo parte de su nombre (sin tildes ni mayúsculas) y ordená la lista por monto o por categoría.
- **Exportación de Datos**: Descarga toda tu información en formato JSON para tener un respaldo siempre a mano.
- **Privacidad Total**: Tus datos se guardan localmente en tu navegador (LocalStorage). Nada se sube a servidores externos.

### 🧾 Cómo se comportan los recurrentes

- Se generan **hasta el mes actual**: los meses futuros no se llenan con gastos estimados.
- El importe base manda: editás el gasto del mes más reciente y el mes siguiente ya sale con ese valor. Al editar desde la pestaña podés marcar "Aplicar también a {mes}" para corregir el gasto del mes que estás viendo.
- Si borrás un gasto generado, no vuelve a aparecer en ese mes (queda registrado como salteado).
- Si no abrás la app durante varios meses, esos meses se generan cuando los visités, con el **importe base actual** y no con el que correspondería; se corrige editando el gasto.
- No se generan meses anteriores al que elegiste al crear el recurrente, ni para recurrentes pausados.

## 🚀 Instalación y Uso

Al ser una aplicación web estática, no requiere instalación compleja:

1. Clona este repositorio o descarga los archivos.
2. Abre el archivo `index.html` en cualquier navegador moderno.
3. ¡Empieza a trackear tus finanzas!

## 🧪 Tests

Tests con [Vitest](https://vitest.dev) sobre un entorno `jsdom`, en dos grupos:

- **Unitarios** (`tests/*.test.js`): cada módulo por separado, con fixtures de DOM.
- **Integración** (`tests/integration/`): levantan la app real —el `index.html` de verdad más `main.js`— y la manejan por el DOM, para cubrir el cableado entre módulos, la persistencia y los flujos completos.

```bash
pnpm install              # instala las devDependencies
pnpm test                 # corre todo una vez
pnpm test:unit            # sólo los unitarios
pnpm test:integration     # sólo los de integración
pnpm test:watch           # modo watch
pnpm test:coverage        # reporte de cobertura en coverage/
```

## 🛠️ Tecnologías Utilizadas

- **HTML5**: Estructura semántica.
- **CSS3 (Custom Properties & Flexbox)**: Diseño *mobile-first* con estética dark-mode y fuentes modernas (Syne & DM Mono).
- **JavaScript (Vanilla)**: Lógica de estado, renderizado dinámico y persistencia local sin dependencias externas.

## 📱 Diseño

La aplicación ha sido diseñada con un enfoque **Mobile-First**, optimizada para ser guardada como acceso directo en el celular y utilizada como una App nativa.

## 📄 Licencia

Este proyecto es de uso libre y gratuito. 

---
*Desarrollado con ❤️ para mejorar tu salud financiera.*
