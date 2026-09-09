/**
 * Runtime contract type augmentations (0.13.3 store-rehome adaptation).
 *
 * Upstream 0.1.2-rc.1 rehomed the store engine (client-runtime/client →
 * client-store, inlined) and reshaped the client loader's module table; the
 * client-side type augmentations that used to ride in with a
 * `@deepseek-ai/dsh-client-runtime` devDependency are declared here instead —
 * the official "each package declares its own contract" form (see
 * client-ui-layout rc.1 lib/types/client/index.d.ts for the canonical shape).
 * Copies are from @deepseek-ai/dsh-client-runtime 0.1.1-rc.2 (unrepublished =
 * byte-identical contract) and are restricted to what this package's
 * typecheck consumes; upstream's own copies live in the monorepo compile.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Root slot owner share: the shell supplies an empty object. */
type RootOwnerProps = Record<never, never>

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * The built-in render-tree root hole (seeded by SlotCore): the one slot
         * the shell itself renders. OCCUPIED by ui-responsive's AppFrame
         * (single slot: registering here replaces the shipped frame).
         */
        'root': {
            kind: 'single';
            scope: 'root';
            owner: RootOwnerProps;
        };
    }
    /** Structural slice of the runtime's SessionListState this package projects. */
    interface SessionListStateLike {
        /** Current session id (undefined in the no-session state). */
        current: string | undefined;
        /** Session rows keyed by id (blank flag drives the composer placeholder). */
        byId: Record<string, { blank?: boolean } & Record<string, unknown>>;
    }
    /**
     * Props injected into every global slot component (runtime merge; the
     * ui-slots package declares the empty seat).
     */
    interface GlobalStandardProps {
        /** Session list + current-selection selector feed. Selector state type is
         *  runtime-internal (SessionListState); declared structurally here — the
         *  components only project scalar fields, never mutate. */
        useSessions: <T>(selector: (state: SessionListStateLike) => T) => T;
        /** Selector hook over real Workspaces and their independent baseline lifecycle. */
        useWorkspaces: <T>(selector: (state: never) => T) => T;
    }
}

declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Slot registry: register()/inject() composition face (rc.1 client API;
         *  inject takes a single service name or an array — cordis normalizes). */
        slots: {
            register(spec: Record<string, unknown>, component: unknown): () => void;
            inject(deps: string | readonly string[], fn: (...args: unknown[]) => unknown, label?: string): void;
        };
        /** Session domain face (open/clear used by the shell overlay feed). */
        sessions: {
            open(id: string): void;
            clear(): void;
        };
    }
}
