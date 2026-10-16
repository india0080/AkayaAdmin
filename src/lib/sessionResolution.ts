export interface VerifiedAdmin {
  uid: string;
  email: string;
  roles: string[];
  permissions: string[];
  legacy: boolean;
}

// A transport failure is not evidence of either membership or privileges.
export async function resolveVerifiedAdmin(
  read: () => Promise<VerifiedAdmin>,
  email: string | null,
): Promise<(VerifiedAdmin & { degraded: false }) | null> {
  try {
    const me = await read();
    return { ...me, email: me.email || email || '', degraded: false };
  } catch (error) {
    if ((error as { kind?: string })?.kind === 'permission') return null;
    throw error;
  }
}
