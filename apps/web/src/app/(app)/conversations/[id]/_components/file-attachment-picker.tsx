"use client";

import { useId } from "react";

/**
 * E03-S008: file attachment picker. AI_KM_BMAD_High_Granularity/ defines
 * no file type/MIME allowlist, no size limit, and no max-file-count for
 * this story specifically — the only concrete format list in the whole
 * spec (SOURCE_BASELINE.md's PDF/DOCX/PPTX/XLSX/CSV/TXT/Image/Web/Scan
 * PDF) belongs to E06 Knowledge Ingestion's parser stories (Team B), not
 * this chat attachment picker, and the real validation stories (E06-S03
 * MIME allowlist, E06-S04 file-size validation, E06-S07 antivirus hook)
 * are all unelaborated Team B titles with no values to borrow. Same
 * precedent as E03-S006 declining to invent a message character limit
 * under the same generic "validate size" boilerplate — this component
 * does not invent a type/size/count restriction either. Purely a
 * client-side selection UI: no upload happens here (Frontend/BFF may
 * never connect directly to Object Storage — E03 epic's own Development
 * Boundaries), so there's nothing to validate against a real backend
 * limit yet regardless.
 *
 * Controlled by its parent (MessageComposer) rather than owning its own
 * state — the selected files are part of what MessageComposer submits
 * together with the draft text, not an independently-persisted field
 * like ModeSwitch/KnowledgeSelector/ModelSelector's conversation
 * properties.
 */
export interface FileAttachmentPickerProps {
  files: File[];
  onFilesSelected: (files: FileList) => void;
  onRemove: (index: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachmentPicker({ files, onFilesSelected, onRemove }: FileAttachmentPickerProps) {
  const inputId = useId();

  return (
    <div style={{ marginTop: 8 }}>
      <label htmlFor={inputId}>附件</label>
      <br />
      <input
        id={inputId}
        type="file"
        multiple
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFilesSelected(event.target.files);
          }
          // Reset so selecting the exact same file again (e.g. after
          // removing it) still fires onChange — browsers otherwise
          // treat an unchanged input value as no-op.
          event.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              {file.name}（{formatFileSize(file.size)}）
              <button type="button" onClick={() => onRemove(index)}>
                移除 {file.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
