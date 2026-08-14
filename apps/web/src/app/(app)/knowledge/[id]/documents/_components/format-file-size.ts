/**
 * Shared by knowledge-document-list.tsx (E05-S010) and
 * knowledge-document-upload.tsx (E05-S011) — both this story's own
 * files within the same route, so there's no Domain Ownership Boundary
 * reason to duplicate between them the way both independently duplicate
 * this from conversations/[id]/_components/file-attachment-picker.tsx
 * (E03-S008, a different domain, out of this story's allowed scope —
 * see either component's own doc comment for that reasoning).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
