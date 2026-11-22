export const TUNTAS_ADMIN_USER_ID = "b6521de4-d0f7-442f-a0cc-89bd26dc9729";
export const TUNTAS_ADMIN_EMAIL = "zeynn.belajar@gmail.com";

export function isTuntasAdminUser(user) {
  if (!user || typeof user !== "object") return false;
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  return user.id === TUNTAS_ADMIN_USER_ID && email === TUNTAS_ADMIN_EMAIL;
}
