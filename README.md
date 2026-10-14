# Medi-Turnos

Consultorio: pacientes, turnos, obras sociales, historia clínica y cuatro roles.
El acceso usa Better Auth (correo y contraseña con hash). Los datos viven en Postgres
(Neon al publicar; Postgres embebido en la vista previa).

La versión anterior (Express + `database.json` + contraseñas en texto plano) no se
puede publicar en este entorno: el disco es efímero y no hay sesión real. El flujo
clínico se conservó y se conectó a la base.

## Cuentas de práctica

Se crean solas la primera vez, si todavía no hay perfiles. Clave: `Medi1234`.

| Rol | Usuario |
| --- | --- |
| Administración | `admin` |
| Secretaría | `secretaria` |
| Profesional | `doctora` (también `profesional`) |
| Paciente | `paciente` o DNI `32456789` |

`1234` se rechaza. Un paciente nuevo se registra desde el acceso Pacientes y entra
enseguida. No hay verificación de correo: no hay servidor de mail y no se simula.

## Publicar

La plataforma inyecta `DATABASE_URL` y las credenciales de acceso. No hace falta un
archivo `.env`. El esquema está en `migrations/` y se aplica al compilar.

Antes de cargar pacientes reales: cambie las claves de práctica desde el panel y
suspenda las cuentas de demostración.

## Respaldo

Con la base publicada: `pg_dump "$DATABASE_URL" -Fc -f mediturnos.dump`.
Restaurar: `pg_restore --clean --if-exists -d "$DATABASE_URL" mediturnos.dump`.
En la vista previa los datos viven en memoria y se pierden al reiniciar el servidor.

Salud del servicio: `GET /api/health` responde `db: up` o `503` si la base no responde.
