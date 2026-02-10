import { vi } from 'vitest';

type Procedure<TArgs extends readonly unknown[] = readonly unknown[], TResult = unknown> = (
	...args: TArgs
) => TResult;

type AsyncProcedure<TArgs extends readonly unknown[] = readonly unknown[], TResult = unknown> = (
	...args: TArgs
) => Promise<TResult>;

export function createBoundaryMock<TArgs extends readonly unknown[], TResult>(
	implementation?: Procedure<TArgs, TResult>
) {
	return vi.fn<Procedure<TArgs, TResult>>(implementation);
}

export function mockBoundaryResolved<TArgs extends readonly unknown[], TResult>(value: TResult) {
	return vi.fn<AsyncProcedure<TArgs, TResult>>(async () => value);
}

export function mockBoundaryRejected<TArgs extends readonly unknown[], TResult = never>(
	error: unknown
) {
	return vi.fn<AsyncProcedure<TArgs, TResult>>(async () => {
		throw error;
	});
}
