import { ConnectionResponse } from '../types';
/** The message of a failed call: the plugin's own `{ error }`, or Strapi's `{ error: { message } }`. */
export declare function errorMessage(err: unknown): string;
/** The plugin's own error code (`not_connected`), when a call failed with one. */
export declare function errorCode(err: unknown): string | undefined;
/** The VocalStack connection, and the one-click flow that opens the dashboard in a new tab. */
export declare function useConnection(): {
    connect: () => Promise<void>;
    connecting: boolean;
    connection: ConnectionResponse | undefined;
    refresh: () => Promise<void>;
    setConnection: import('react').Dispatch<import('react').SetStateAction<ConnectionResponse | undefined>>;
};
