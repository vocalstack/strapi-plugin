declare const _default: {
    transcript: {
        schema: {
            kind: string;
            collectionName: string;
            info: {
                singularName: string;
                pluralName: string;
                displayName: string;
                description: string;
            };
            options: {
                draftAndPublish: boolean;
            };
            pluginOptions: {
                "content-manager": {
                    visible: boolean;
                };
                "content-type-builder": {
                    visible: boolean;
                };
            };
            attributes: {
                fileName: {
                    type: string;
                };
                file: {
                    type: string;
                    multiple: boolean;
                    allowedTypes: string[];
                };
                fileId: {
                    type: string;
                    required: boolean;
                    unique: boolean;
                };
                status: {
                    type: string;
                    enum: string[];
                    default: string;
                };
                transcript: {
                    type: string;
                };
                sentences: {
                    type: string;
                };
                language: {
                    type: string;
                };
                error: {
                    type: string;
                };
                recordingId: {
                    type: string;
                };
                transcriptionId: {
                    type: string;
                };
                transcribedAt: {
                    type: string;
                };
            };
        };
    };
};
export default _default;
