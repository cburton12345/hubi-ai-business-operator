"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

export function DocumentDropzone({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  return (
    <form action={action} className="panel form-stack span-7">
      <div>
        <p className="eyebrow">Receipt & Expense Intelligence</p>
        <h2>Drop it here. Ferocity will sort out what it is and where it belongs.</h2>
        <p className="muted">Photograph or upload a receipt, invoice, bill, purchase order, warranty, or similar document.</p>
      </div>
      <label
        className={`document-dropzone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files);
          if (!files.length || !inputRef.current) return;
          const transfer = new DataTransfer();
          files.slice(0, 25).forEach((file) => transfer.items.add(file));
          inputRef.current.files = transfer.files;
          setFileNames(Array.from(transfer.files).map((file) => file.name));
        }}
      >
        <FileUp size={28} />
        <strong>{fileNames.length ? `${fileNames.length} document${fileNames.length === 1 ? "" : "s"} ready` : "Drag documents here, take a photo, or choose files"}</strong>
        <span>{fileNames.length ? fileNames.slice(0, 4).join(", ") + (fileNames.length > 4 ? ` and ${fileNames.length - 4} more` : "") : "JPG, PNG, WebP, HEIC, or PDF · up to 15 MB each · 25 per batch"}</span>
        <input
          ref={inputRef}
          name="documents"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          required
          onChange={(event) => setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))}
        />
      </label>
      <input type="hidden" name="sourceChannel" value="upload" />
      <button className="button" type="submit">Import and understand {fileNames.length > 1 ? `${fileNames.length} documents` : "document"}</button>
    </form>
  );
}
