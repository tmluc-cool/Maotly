# Política de privacidad de Moatly

Última actualización: 12 de octubre de 2026 (versión 2: reseñas)

## ¿Quién es el responsable?

Moatly es un **proyecto personal hecho por diversión** de [@tmluc-cool](https://github.com/tmluc-cool): no es una empresa ni un servicio comercial.
Contacto: a través de los [issues del repositorio del proyecto](https://github.com/tmluc-cool/githuub-appstore/issues).

Usas la app bajo tu propio riesgo. No se asume ninguna responsabilidad de ningún tipo.

## En resumen

- Moatly funciona **sin iniciar sesión** y guarda todo **localmente en tu computadora**.
- Sin la red, la app **solo se comunica con GitHub**. No hay publicidad, ni rastreadores, ni analíticas, ni informes de errores.
- La **red Moatly es voluntaria** y está desactivada por defecto. Solo cuando eliges «Participar» e inicias sesión con GitHub, la app envía datos a nuestro servidor.

## ¿Qué pasa sin la red?

Una vez por semana, la app descarga un paquete de actualización desde GitHub (github.com, repositorio público «moatly-data»). En la búsqueda en vivo y en la actualización manual, la app se comunica directamente con GitHub. Los proyectos se abren en tu navegador. En todo esto se aplica la política de privacidad de GitHub. Nosotros no recibimos nada de ello.

En tu computadora, la app guarda una base de datos con información pública sobre proyectos de GitHub (nombre, descripción, estrellas, etc.), tu configuración y, si agregas uno, tu token de GitHub cifrado.

## ¿Qué datos guardamos si participas en la red?

| Datos | Para qué |
| --- | --- |
| ID de GitHub y nombre de usuario de GitHub | para reconocerte como miembro |
| Versión de la app | para ver qué versiones se siguen usando |
| Día en que te uniste y último día activo (solo la fecha, sin hora) | para borrar automáticamente a los miembros inactivos |
| Número de aportes y los ID de los proyectos de GitHub que propusiste | para revisar las propuestas e incluirlas en la próxima actualización |
| Tus reseñas (estrellas, texto, fecha) y tus respuestas como propietario de un proyecto | para que otras personas puedan leerlas: **públicas, con tu nombre de usuario de GitHub** |
| Qué reseñas votaste positivamente | para que cada persona pueda votar solo una vez; solo se publica el número de votos, no quién votó |

**No se guarda:** dirección de correo electrónico, dirección IP, términos de búsqueda, ID de dispositivos, archivos de tu computadora. Verificamos tu token de GitHub una sola vez al iniciar sesión y no lo guardamos.

## Reseñas

- Solo quien participa en la red puede escribir reseñas, darles votos positivos y responderlas. **Cualquiera puede leerlas.**
- Una vez por semana, todas las reseñas se escriben, junto con tu nombre de usuario de GitHub, en el paquete de actualización público en GitHub (repositorio «moatly-data», versión publicada más reciente). Así, todos los usuarios las reciben sin comunicarse con nuestro servidor. Eliminamos las copias antiguas de las versiones publicadas anteriores.
- Cuando respondes, el servidor comprueba una sola vez en GitHub, con tu token de GitHub, si eres el propietario del proyecto. No guarda el token.
- Puedes cambiar o borrar tu propia reseña en cualquier momento. Las reseñas borradas también desaparecen para todos los demás con la siguiente actualización semanal.
- Podemos ocultar o borrar reseñas, por ejemplo, en caso de spam o insultos.

## ¿Dónde se guardan los datos?

En Cloudflare (Cloudflare Workers y Cloudflare D1). Hemos desactivado los registros (logs) permanentes.

## ¿Por cuánto tiempo?

Hasta que salgas de la red o, automáticamente, después de **12 meses sin actividad**.

## Tus derechos: consultar y borrar

- **Consultar:** Configuración → Red → «Mostrar mis datos guardados» muestra exactamente lo que el servidor sabe de ti.
- **Borrar:** Configuración → Red → desactiva el interruptor «Participar» → «Salir y borrar datos». Tu cuenta, tus propuestas pendientes, tus reseñas, votos positivos y respuestas se borran de inmediato del servidor y, con la siguiente actualización semanal, también desaparecen de las apps de los demás.
- Para cualquier otra pregunta, puedes escribir al contacto indicado arriba.

## Cambios

Si esta política cambia de forma importante, la app vuelve a pedir su consentimiento a todos los miembros de la red.
