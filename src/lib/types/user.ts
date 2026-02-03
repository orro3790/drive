/**
 * Domain User Type
 *
 * Properly typed user reflecting the actual database schema.
 * Better Auth's $Infer types role as `string | null | undefined`,
 * but our database schema enforces `role NOT NULL DEFAULT 'driver'`.
 *
 * Use this type for domain logic that needs the correct role type.
 */

export type UserRole = 'driver' | 'manager';

export interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	role: UserRole;
	phone?: string | null;
	weeklyCap: number;
	isFlagged: boolean;
	flagWarningDate?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Cast Better Auth user to properly typed User.
 * Safe to use because database schema enforces role NOT NULL.
 */
export function asUser(authUser: {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	role?: string | null;
	phone?: string | null;
	weeklyCap?: number | null;
	isFlagged?: boolean | null;
	flagWarningDate?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}): User {
	return {
		...authUser,
		role: (authUser.role ?? 'driver') as UserRole,
		weeklyCap: authUser.weeklyCap ?? 4,
		isFlagged: authUser.isFlagged ?? false
	};
}
