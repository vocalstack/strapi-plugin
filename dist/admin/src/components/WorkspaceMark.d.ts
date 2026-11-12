import { Workspace } from '../types';
/**
 * A workspace's mark, as the VocalStack dashboard draws it: its own icon, a person for
 * the personal workspace, else its initials on a tile tinted with its colour.
 */
export declare const WorkspaceMark: ({ size, workspace }: {
    size?: number;
    workspace: Workspace;
}) => import("react").JSX.Element;
