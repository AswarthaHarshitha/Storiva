import bcrypt from "bcryptjs";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/prismaErrors.js";

const BCRYPT_COST = 12;

// Compared against when an email is unknown, so a failed login takes the same time
// whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("stockflow-timing-equalizer", BCRYPT_COST);

const emailTaken = () =>
  new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.", {
    email: "An account with this email already exists. Try logging in instead.",
  });

/** Creates the organization and its owner together; neither exists without the other. */
export async function signUp(input: { email: string; password: string; organizationName: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw emailTaken();

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    return await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: input.organizationName } });
      return tx.user.create({
        data: { email: input.email, passwordHash, organizationId: organization.id },
        select: { id: true },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "That email and password combination is not correct.");
  }
  return { id: user.id };
}

export async function getAccount(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, organization: { select: { id: true, name: true } } },
  });
  return { id: user.id, email: user.email, organization: user.organization };
}
