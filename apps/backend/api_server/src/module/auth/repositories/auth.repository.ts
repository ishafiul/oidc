import { eq, and } from 'drizzle-orm';
import {DB} from "../../../core/db";
import {auths, trustedDevices} from "../../../core/db/schema";

export async function createAuthSession(
	db: DB,
	id: string,
	userId: string,
	deviceId: string,
	isTrusted: boolean = false
) {
	const [authSession] = await db.insert(auths).values({
		id,
		userId,
		deviceId,
		lastRefresh: new Date(),
		isTrusted,
		trustedAt: isTrusted ? new Date() : null,
	}).returning({ id: auths.id });

	return authSession;
}

export async function findAuthByUserId(db: DB, userId: string) {
	return db.query.auths.findFirst({
		where: (auths, { eq }) => eq(auths.userId, userId),
	});
}

export async function findAuthById(db: DB, authId: string) {
	return db.query.auths.findFirst({
		where: (auths, { eq }) => eq(auths.id, authId),
	});
}

export async function findActiveAuthSession(
	db: DB,
	input: { userId: string; sessionId: string; deviceId: string },
) {
	return db.query.auths.findFirst({
		where: (auths, { eq, and }) => and(
			eq(auths.id, input.sessionId),
			eq(auths.userId, input.userId),
			eq(auths.deviceId, input.deviceId),
		),
	});
}

export async function findAuthByDeviceId(db: DB, deviceId: string) {
	return db.query.auths.findFirst({
		where: (auths, { eq }) => eq(auths.deviceId, deviceId),
	});
}

export async function updateAuthLastRefresh(db: DB, authId: string) {
	await db.update(auths)
		.set({
			lastRefresh: new Date(),
		})
		.where(eq(auths.id, authId));
}

export async function deleteAuthByUserId(db: DB, userId: string) {
	await db.delete(auths).where(eq(auths.userId, userId));
}

export async function deleteAuthById(db: DB, authId: string) {
	await db.delete(auths).where(eq(auths.id, authId));
}

export async function deleteAuthByDeviceId(db: DB, deviceId: string) {
	await db.delete(auths).where(eq(auths.deviceId, deviceId));
}

export async function findAuthsByUserId(db: DB, userId: string) {
	return db.query.auths.findMany({
		where: (auths, { eq }) => eq(auths.userId, userId),
	});
}

export async function markDeviceAsTrusted(db: DB, authId: string) {
	const auth = await findAuthById(db, authId);
	if (!auth) return;
	await upsertTrustedDevice(db, auth.userId, auth.deviceId);
}

export async function findTrustedDevicesByUserId(db: DB, userId: string) {
	return db.query.trustedDevices.findMany({
		where: (trustedDevices, { eq }) => eq(trustedDevices.userId, userId),
	});
}

export async function findTrustedAuthByDeviceAndUser(db: DB, deviceId: string, userId: string) {
	return findTrustedDeviceByDeviceAndUser(db, deviceId, userId);
}

export async function findTrustedDeviceByDeviceAndUser(db: DB, deviceId: string, userId: string) {
	return db.query.trustedDevices.findFirst({
		where: (trustedDevices, { eq, and }) => and(
			eq(trustedDevices.deviceId, deviceId),
			eq(trustedDevices.userId, userId)
		),
	});
}

export async function upsertTrustedDevice(db: DB, userId: string, deviceId: string) {
	const now = new Date();
	const [trustedDevice] = await db.insert(trustedDevices)
		.values({
			id: crypto.randomUUID(),
			userId,
			deviceId,
			trustedAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [trustedDevices.userId, trustedDevices.deviceId],
			set: {
				trustedAt: now,
				updatedAt: now,
			},
		})
		.returning();

	return trustedDevice;
}
