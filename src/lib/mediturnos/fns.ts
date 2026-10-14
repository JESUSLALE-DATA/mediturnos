import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

async function clinic() {
  return import("./clinic.server");
}

export const ensureClinic = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { ensureClinicReady } = await clinic();
    await ensureClinicReady();
    return { ok: true as const };
  } catch (error) {
    console.error("[mediturnos] ensure", error);
    return { ok: false as const, error: "La base de datos no está disponible." };
  }
});

export const getSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadSnapshot } = await clinic();
    return loadSnapshot(context.userId);
  });

export const savePatientFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { savePatient } = await clinic();
    return savePatient(context.userId, data);
  });

export const saveAppointmentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveAppointment } = await clinic();
    return saveAppointment(context.userId, data);
  });

export const setAppointmentEstadoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { setAppointmentEstado } = await clinic();
    return setAppointmentEstado(context.userId, data);
  });

export const saveObraFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveObra } = await clinic();
    return saveObra(context.userId, data);
  });

export const saveEvolucionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveEvolucion } = await clinic();
    return saveEvolucion(context.userId, data);
  });

export const saveRecetaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveReceta } = await clinic();
    return saveReceta(context.userId, data);
  });

export const saveContactoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveContacto } = await clinic();
    return saveContacto(context.userId, data);
  });

export const setPermisoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { setPermiso } = await clinic();
    return setPermiso(context.userId, data);
  });

export const createStaffFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { createStaff } = await clinic();
    return createStaff(context.userId, data);
  });

export const setUserStatusFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { setUserStatus } = await clinic();
    return setUserStatus(context.userId, data);
  });

export const attachOwnPatientFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { attachOwnPatient } = await clinic();
    return attachOwnPatient(context.userId, data);
  });
