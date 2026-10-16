const legal = {
  updated: "Última actualización: 16 de octubre de 2026",
  contact: "Si tienes preguntas sobre esta política o estos términos, escríbenos a través del repositorio del proyecto:",
  privacy: {
    title: "Política de privacidad",
    description: "Qué datos recoge OpenCircle y qué cookies usa.",
    sections: [
      {
        h: "Qué es este sitio",
        p: "OpenCircle es un prototipo creado durante un hackathon. No es una entidad financiera y no recibe dinero real: la demostración funciona con billeteras y fondos de prueba.",
      },
      {
        h: "Qué datos recogemos",
        p: "Ninguno de forma activa: el sitio no tiene formularios de registro y la demostración no pide datos personales. Los nombres que ves en la demostración son de ejemplo.",
      },
      {
        h: "Datos técnicos",
        p: "Como cualquier sitio web, el servidor que lo aloja puede registrar datos técnicos de las visitas, como la dirección IP, para operar y proteger el servicio. No los usamos para identificarte ni para publicidad.",
      },
      {
        h: "Cookies",
        p: "Usamos una cookie para recordar el idioma que elegiste. No usamos cookies de publicidad ni de analítica.",
      },
    ],
  },
  terms: {
    title: "Términos de uso",
    description: "Condiciones para usar el prototipo de OpenCircle y su demostración.",
    sections: [
      {
        h: "Un prototipo en desarrollo",
        p: "OpenCircle es un prototipo. Sus funciones pueden cambiar, fallar o dejar de estar disponibles sin aviso.",
      },
      {
        h: "Sin dinero real",
        p: "La demostración usa billeteras y fondos de prueba. El sitio no acepta depósitos de dinero real; no intentes enviarlo.",
      },
      {
        h: "No somos una entidad financiera",
        p: "OpenCircle no es un banco ni una entidad vigilada, y no ofrece productos de ahorro, crédito ni inversión. Una versión con dinero real necesitaría una entidad financiera autorizada que custodie los fondos.",
      },
      {
        h: "Cálculos de ejemplo",
        p: "La calculadora, las comisiones y los montos que muestra el sitio son ilustrativos. No son una oferta ni una promesa de pago.",
      },
      {
        h: "Sin garantías",
        p: "El sitio se ofrece tal como está, sin garantía de disponibilidad, exactitud ni resultados.",
      },
      {
        h: "Cambios a estos términos",
        p: "Podemos actualizar estos términos. Cuando lo hagamos, cambiaremos la fecha de última actualización.",
      },
    ],
  },
}

export type LegalDictionary = typeof legal
export default legal
