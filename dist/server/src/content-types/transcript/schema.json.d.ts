declare const _default: {
  "kind": "collectionType",
  "collectionName": "vocalstack_transcripts",
  "info": {
    "singularName": "transcript",
    "pluralName": "transcripts",
    "displayName": "Transcript",
    "description": "VocalStack transcripts of Media Library audio files."
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {
    "content-manager": { "visible": true },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "fileName": { "type": "string" },
    "file": { "type": "media", "multiple": false, "allowedTypes": ["audios"] },
    "fileId": { "type": "integer", "required": true, "unique": true },
    "status": { "type": "enumeration", "enum": ["idle", "processing", "done", "failed"], "default": "idle" },
    "transcript": { "type": "text" },
    "sentences": { "type": "json" },
    "language": { "type": "string" },
    "error": { "type": "text" },
    "recordingId": { "type": "string" },
    "transcriptionId": { "type": "string" },
    "jobRecordingId": { "type": "string" },
    "jobTranscriptionId": { "type": "string" },
    "transcribedAt": { "type": "datetime" }
  }
}
;

export default _default;
