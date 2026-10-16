const landing = {
  meta: {
    title: "OpenCircle · Círculos de ahorro y pasarela financiera sobre Open Payments",
    description:
      "Círculos de ahorro y transferencias transfronterizas sobre Open Payments e Interledger (ILP). Aportes transparentes, consentimiento interactivo GNAP y liquidación verificable con Rafiki.",
    ogAlt: "OpenCircle: ahorro colaborativo y pagos abiertos con Open Payments",
  },
  nav: {
    how: "Cómo funciona",
    benefits: "Beneficios",
    safety: "Seguridad",
    faq: "Preguntas frecuentes",
    cta: "Explorar demo",
    label: "Navegación principal",
    menu: "Abrir menú",
    close: "Cerrar menú",
    home: "Inicio de OpenCircle",
    language: "Idioma",
    switchTo: "English",
  },
  hero: {
    eyebrow: "Pasarela y círculos financieros sobre Open Payments",
    titleStart: "Ahorros y cobros comunitarios ",
    titleHighlight: "con liquidación global instantánea.",
    lead: "Organiza círculos de ahorro con amigos o recibe pagos transfronterizos. Conecta tu Wallet Address, autoriza de forma segura mediante consentimientos GNAP y liquida en segundos vía Rafiki e Interledger.",
    primary: "Explorar demo",
    secondary: "Descubre cómo funciona",
    micro: "Estándar Open Payments · Protocolo Interledger · Liquidación verificada",
    dashboard: {
      label: "Vista previa del panel de OpenCircle con liquidación en tiempo real",
      heading: "Círculo activo · Open Payments",
      circle: "Viaje de fin de año ✈️",
      status: "Ronda 2 de 5 · Liquidando vía Rafiki",
      contribution: "Aporte por ronda",
      participants: "Participantes",
      people: "{count} billeteras",
      pool: "Fondo a liquidar",
      progress: "{confirmed} de {total} débitos confirmados",
      activity: "Actividad en el ledger",
      confirmed: "Liquidado vía ILP",
      pending: "Esperando GNAP",
      times: ["hace 2 min", "hace 1 h", "ayer", "ayer"],
      receives: "Recibe esta ronda",
      notifyPaid: "María autorizó y liquidó su aporte",
      notifyNext: "Próximo turno: Carlos",
      sample: "Demostración sobre testnet",
    },
  },
  trust: [
    "Liquidación instantánea vía Interledger",
    "Consentimiento interactivo seguro GNAP",
    "Verificación criptográfica con Rafiki",
  ],
  benefits: {
    title: "Finanzas colaborativas con precisión matemática.",
    lead: "Olvídate de perseguir transferencias manuales, enviar comprobantes por WhatsApp o depender de bancos opacos.",
    kicker: "Interoperabilidad sin fronteras.",
    cards: [
      {
        title: "Conecta tu Wallet Address abierta",
        body: "Participa utilizando cualquier billetera compatible con Open Payments ($billetera/usuario). Cero ataduras a una sola aplicación.",
      },
      {
        title: "Autorización interactiva GNAP",
        body: "Cada débito requiere tu consentimiento directo y explícito con montos límites inmutables. Cero sorpresas ni cargos inesperados.",
      },
      {
        title: "Transparencia y auditoría en tiempo real",
        body: "Consulta cada débito liquidado, el turno asignado y la máquina de estados de pago verificada de punta a punta.",
      },
      {
        title: "Liquidación verificada por Rafiki",
        body: "Los fondos solo se transfieren cuando todos los débitos son confirmados criptográficamente mediante webhooks firmados.",
      },
    ],
    mock: {
      payTitle: "Débito autorizado",
      payTo: "Para: Viaje de fin de año ($circle/viaje)",
      payFrom: "Desde tu Wallet Address",
      payDone: "Liquidado",
      you: "Tú",
      round: "Ronda {n}",
      now: "Ahora",
      next: "Siguiente",
      feedTitle: "Movimientos del ledger",
      feedPaid: "liquidó",
      ruleAll: "{n} de {n} aportes verificados",
      ruleCheck: "Firma de webhook Rafiki válida",
      ruleRelease: "Pago liquidado a Andrés vía ILP",
    },
  },
  how: {
    title: "Cuatro pasos para operar en OpenCircle.",
    lead: "Flujo guiado y transparente basado en el estándar abierto de Open Payments.",
    steps: [
      {
        title: "1. Conecta tu Wallet Address",
        body: "Ingresa tu identificador financiero ($billetera.dev/usuario) para enlazar pagos sin exponer cuentas bancarias sensibles.",
      },
      {
        title: "2. Define reglas y participantes",
        body: "Establece el monto en enteros mínimos, el orden de turnos y las condiciones inmutables de la ronda de ahorro.",
      },
      {
        title: "3. Autoriza con consentimiento GNAP",
        body: "Cada ciclo solicita una autorización interactiva en tu billetera con cuotas y montos máximos predefinidos.",
      },
      {
        title: "4. Liquidación directa por Rafiki",
        body: "Al confirmarse todos los aportes, el conector Rafiki liquida automáticamente al beneficiario en turno mediante Interledger.",
      },
    ],
    mock: {
      name: "Identificador del círculo",
      amount: "Cuota por ronda",
      invite: "Wallet de cobro ($circle)",
      copied: "Copiada",
      received: "Liquidado a tu billetera",
    },
  },
  calc: {
    title: "Simula tu círculo de ahorro.",
    lead: "Calcula con precisión entera y cero floats el fondo que recibirás en tu turno.",
    participants: "Billeteras participantes",
    fewer: "Quitar un participante",
    more: "Agregar un participante",
    contribution: "Aporte por participante (COP)",
    presets: "Montos sugeridos",
    fee: "Comisión ilustrativa",
    feeBadge: "Ejemplo",
    feeHelp: "Valor de ejemplo para pruebas en testnet.",
    payoutLabel: "Recibes en tu turno",
    total: "Fondo total por ronda",
    feeLine: "Costo de red ilustrativo ({rate})",
    payoutLine: "Liquidación neta estimada",
    summary: "Cada participante aporta {each} por ciclo durante {n} ciclos ({total} en total) y recibe {payout} en su turno.",
    note: "Cálculo ilustrativo con números enteros. Las comisiones y liquidaciones finales corresponden al conector Rafiki en testnet.",
    errorAmount: "Escribe un monto entre $ 1.000 y $ 10.000.000.",
    breakdown: "Composición del pool por ciclo",
  },
  safety: {
    title: "Seguridad y custodia descentralizada.",
    lead: "OpenCircle está diseñado bajo principios de mínimo privilegio, firmas criptográficas y cero custodia centralizada de fondos.",
    items: [
      {
        title: "Custodia en Interledger (ILP)",
        body: "OpenCircle nunca retiene tus fondos en cuentas intermediarias opacas. Las transferencias se ejecutan directamente entre billeteras compatibles.",
      },
      {
        title: "Prueba verificable de pago",
        body: "Un ciclo solo pasa a completado tras recibir y validar criptográficamente la firma HMAC del webhook emitido por Rafiki.",
      },
      {
        title: "Idempotencia determinista",
        body: "Cada solicitud que mueve fondos lleva una clave de idempotencia única, eliminando riesgos de débitos duplicados.",
      },
      {
        title: "Aislamiento criptográfico",
        body: "Las claves privadas de firma e instancias del SDK operan exclusivamente en módulos aislados del servidor (server-only).",
      },
    ],
    disclaimer: "Demostración técnica en testnet. OpenCircle utiliza estándares abiertos de Open Payments y liquidación simulada a través de Rafiki.",
  },
  useCases: {
    title: "Soluciones para comunidades y comercios.",
    lead: "Diseñado tanto para círculos de confianza mutua como para creadores y comercios que reciben cobros globales.",
    cards: [
      { emoji: "✈️", title: "Círculos de ahorro y viajes", body: "Ahorra con tu grupo de confianza y recibe la suma acordada en tu fecha exacta." },
      { emoji: "🛍️", title: "Cobros directos para creadores", body: "Genera enlaces de cobro y recibe pagos globales en segundos sin altas comisiones." },
      { emoji: "🌐", title: "Pagos transfronterizos", body: "Interoperabilidad nativa entre monedas y billeteras mediante el protocolo Interledger." },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Qué es OpenCircle?",
        a: "OpenCircle es una plataforma y suite de finanzas comunitarias y cobros construida sobre el estándar Open Payments y el protocolo Interledger (ILP) con liquidación en Rafiki.",
      },
      {
        q: "¿Cómo se custodia el dinero?",
        a: "OpenCircle no es un custodio centralizado tradicional. Los fondos permanecen en billeteras habilitadas con Open Payments y se transmiten punto a punto a través de Interledger.",
      },
      {
        q: "¿Qué es una Wallet Address?",
        a: "Es un identificador público con formato URL (por ejemplo, $ilp.rafiki.money/mi-cuenta) que permite enviar y recibir pagos de forma interoperable sin revelar datos bancarios privados.",
      },
      {
        q: "¿Cómo autorizo los pagos?",
        a: "Cada débito requiere tu interacción mediante el protocolo GNAP (Grant Negotiation and Authorization Protocol), donde apruebas explícitamente el monto y destino en tu propia billetera.",
      },
      {
        q: "¿Qué pasa si un participante no aporta?",
        a: "La ronda no se liquida hasta que todos los débitos estén confirmados. El protocolo protege al grupo impidiendo la liberación anticipada de fondos.",
      },
      {
        q: "¿Existen comisiones?",
        a: "El protocolo Open Payments opera con tarifas mínimas de red. En la demostración actual se muestran valores ilustrativos sobre entorno de pruebas.",
      },
      {
        q: "¿Está listo para dinero real?",
        a: "Actualmente opera en entorno de pruebas (testnet) con activos simulados para verificar la seguridad, estabilidad e integración con Rafiki.",
      },
    ],
  },
  finalCta: {
    title: "Construye tu círculo financiero hoy.",
    lead: "Conecta tu Wallet Address. Organiza tus fondos. Disfruta de pagos instantáneos con estándares abiertos.",
    primary: "Explorar demo",
    secondary: "Crear un círculo de prueba",
    note: "Construido sobre Open Payments, Interledger Protocol y Rafiki.",
  },
  footer: {
    tagline: "Pagos y ahorros colaborativos sobre Open Payments.",
    navTitle: "Producto",
    legalTitle: "Legal",
    demo: "Explorar demo",
    privacy: "Privacidad",
    terms: "Términos",
    disclosure: "OpenCircle es un proyecto en desarrollo sobre Open Payments y Rafiki. Utiliza fondos de prueba en testnet y no custodia dinero real.",
    source: "Código en GitHub",
  },
}

export type LandingDictionary = typeof landing
export default landing
