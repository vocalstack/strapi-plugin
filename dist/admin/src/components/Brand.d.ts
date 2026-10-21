/** Whether Strapi shows its dark theme: its lightest surface is dark. */
export declare function useDark(): boolean;
/** The accent colour for the current theme. */
export declare function useAccent(): string;
/** The VocalStack wordmark, light or dark to match the admin's theme. */
export declare const Logo: ({ height }: {
    height?: number;
}) => import("react").JSX.Element;
