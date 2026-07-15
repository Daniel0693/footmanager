import { PrismaClient } from '@prisma/client';
import { isDateRangeActive } from '../src/common/date-range-active';

/**
 * Attribution du tout premier rôle plateforme (SuperAdmin/Proprietaire,
 * docs/modules/auth-roles.md §Rôles plateforme) — hors seed.ts (rejoué
 * régulièrement pour réinitialiser les données système, jamais pour des
 * attributions instance-spécifiques) et hors toute UI/API self-service (pas
 * encore construite en MVP, voir docs/roadmap.md).
 *
 * Ne crée jamais de User (évite de manipuler un mot de passe dans un script
 * privilégié) : élève un compte déjà inscrit via le flux normal.
 *
 * Usage :
 *   npm run bootstrap:platform-role -- --email=admin@example.com --role=Proprietaire --confirm
 *
 * Sans --confirm : affiche ce qui serait fait et sort sans rien écrire
 * (même posture que `prisma migrate reset`, CLAUDE.md — destructif/sensible,
 * jamais sans confirmation explicite).
 */

const ALLOWED_ROLES = ['Proprietaire', 'SuperAdmin'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args = new Map<string, string | true>();
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args.set(key, rest.length > 0 ? rest.join('=') : true);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = args.get('email');
  const role = args.get('role');
  const confirm = args.get('confirm') === true;

  if (typeof email !== 'string' || !email) {
    throw new Error('Usage: --email=<compte existant> requis.');
  }
  if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role as AllowedRole)) {
    throw new Error(
      `Usage: --role=<${ALLOWED_ROLES.join('|')}> requis (rôle plateforme uniquement).`,
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `Aucun User avec l'email "${email}" — ce script n'en crée jamais, ` +
        'le compte doit déjà exister via le flux d\'inscription normal.',
    );
  }

  const systemRole = await prisma.role.findFirst({
    where: { name: role, isSystem: true, clubId: null },
  });
  if (!systemRole) {
    throw new Error(
      `Rôle système "${role}" introuvable — as-tu exécuté "npx prisma db seed" ?`,
    );
  }

  const existingUserRoles = await prisma.userRole.findMany({
    where: { userId: user.id, roleId: systemRole.id },
  });
  const alreadyActive = existingUserRoles.some((userRole) => isDateRangeActive(userRole));
  if (alreadyActive) {
    console.log(
      `${email} détient déjà un rôle plateforme actif "${role}" — rien à faire.`,
    );
    return;
  }

  if (!confirm) {
    console.log(
      `[simulation] accorderait le rôle plateforme "${role}" à ${email} ` +
        `(userId=${user.id}). Relancer avec --confirm pour appliquer.`,
    );
    return;
  }

  await prisma.userRole.create({
    data: { userId: user.id, roleId: systemRole.id },
  });
  console.log(
    `Rôle plateforme "${role}" accordé à ${email} (userId=${user.id}) le ${new Date().toISOString()}.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
