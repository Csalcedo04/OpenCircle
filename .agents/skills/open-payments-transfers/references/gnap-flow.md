# Protocolo GNAP y Manejo de Consentimiento Interactivo

Este documento detalla la negociación de permisos entre el cliente de Open Payments y el servidor de autorización (GNAP) de Rafiki.

## 1. Solicitud Inicial de Grant (Step 1)
El cliente backend emite una petición POST al endpoint de grant con su clave de cliente firmada:
- **`access_token`:** Especifica el tipo de recurso (`outgoing-payment`), acciones (`create`, `read`) y límites del pago.
- **`interact`:** Declara la URL de retorno (`redirect`) y el método de inicio de interacción.
- **`client`:** Identificador y clave pública de firma del cliente registrado.

## 2. Persistencia de Desafío Criptográfico
Antes de redirigir al usuario hacia la pantalla de consentimiento del FSP emisor:
- Genera un `state` aleatorio de alta entropía y un `nonce` criptográfico.
- Guarda en la tabla `consent_challenges` el `state`, `nonce`, identificador de usuario y `continue_uri`.
- Asocia una expiración estricta (máximo 10 minutos).

## 3. Retorno y Verificación de Redirección (Step 2)
Al procesar la llamada de retorno en el backend:
1. Compara el `state` de la URL contra el valor almacenado en la sesión activa.
2. Si los valores difieren o expiraron, aborta la transacción inmediatamente.
3. Envía una solicitud POST autenticada al `continue_uri` proporcionado por GNAP, adjuntando el `interact_ref`.
4. Recibe el token de acceso acotado que autoriza la emisión del pago.
