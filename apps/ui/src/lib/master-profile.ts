export const MASTER_EMAIL = "colin.kenny777@gmail.com";

export function isMasterEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === MASTER_EMAIL;
}
