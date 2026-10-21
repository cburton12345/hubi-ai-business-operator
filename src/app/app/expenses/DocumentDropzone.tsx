"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { validateExpenseDocumentSelection } from "@/lib/document-intelligence/upload-policy";
import {
  cancelExpenseDocumentUploadBatch,
  DirectUploadCanceledError,
  uploadAndProcessExpenseDocuments,
} from "@/lib/document-intelligence/direct-upload-client";

export function DocumentDropzone({ projects }: { projects: { id: string; name: string; taxYear: number | null }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeBatchIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [pending, setPending] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [progress, setProgress] = useState("");
  const [outcome, setOutcome] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [batchLabel, setBatchLabel] = useState("");

  function selectFiles(files: File[]) {
    const error = validateExpenseDocumentSelection(files);
    if (error || !inputRef.current) {
      if (inputRef.current) inputRef.current.value = "";
      setFileNames([]);
      setSelectionError(error ?? "Choose at least one document to import.");
      return;
    }
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
    setFileNames(files.map((file) => file.name));
    setSelectionError("");
  }

  async function cancelPendingUpload() {
    if (!pending || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCanceling(true);
    setProgress("Canceling this import…");
    const batchId = activeBatchIdRef.current;
    if (!batchId) return;
    abortRef.current?.abort();
    try {
      await cancelExpenseDocumentUploadBatch(batchId);
      setOutcome("Import canceled. Documents that already finished remain preserved.");
      setSelectionError("");
      router.refresh();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "The document import could not be canceled.");
    }
  }

  return (
    <form className="panel form-stack span-7" aria-busy={pending} onSubmit={async (event) => {
      event.preventDefault();
      if (pending) return;
      const files = Array.from(inputRef.current?.files ?? []);
      const error = validateExpenseDocumentSelection(files);
      if (error) {
        setSelectionError(error);
        return;
      }
      setPending(true);
      const controller = new AbortController();
      abortRef.current = controller;
      activeBatchIdRef.current = null;
      cancelRequestedRef.current = false;
      setCanceling(false);
      setSelectionError("");
      setOutcome("");
      try {
        const upload = await uploadAndProcessExpenseDocuments({
          files,
          sourceProduct: "expense_intelligence",
          batchLabel: batchLabel.trim() || null,
          projectId: newProjectName.trim() ? null : projectId || null,
          newProjectName: newProjectName.trim() || null,
          taxYear: newProjectName.trim().match(/\b(20\d{2})\b/) ? Number(newProjectName.trim().match(/\b(20\d{2})\b/)?.[1]) : null,
          onProgress: setProgress,
          signal: controller.signal,
          onBatchCreated: async (createdBatchId) => {
            activeBatchIdRef.current = createdBatchId;
            if (!cancelRequestedRef.current) return;
            controller.abort();
            await cancelExpenseDocumentUploadBatch(createdBatchId);
            throw new DirectUploadCanceledError();
          },
        });
        const results = upload.results;
        const failedNames = new Set(results.filter((result) => !result.ok).map((result) => result.fileName));
        const failedFiles = files.filter((file) => failedNames.has(file.name));
        if (inputRef.current) {
          const transfer = new DataTransfer();
          failedFiles.forEach((file) => transfer.items.add(file));
          inputRef.current.files = transfer.files;
        }
        setFileNames(failedFiles.map((file) => file.name));
        const completed = results.length - failedFiles.length;
        const coverageResult = [...results].reverse().find((result) => result.ok && result.statementCoverage);
        const coverage = coverageResult?.ok ? coverageResult.statementCoverage : null;
        setOutcome(`${upload.batch.label}: ${upload.batch.importedFileCount} new, ${upload.batch.reusedFileCount} already preserved, ${upload.batch.failedFileCount} failed, and ${upload.batch.unresolvedFileCount} unresolved out of ${upload.batch.expectedFileCount}.${failedFiles.length ? ` Failed file${failedFiles.length === 1 ? " remains" : "s remain"} selected for retry.` : ""}${coverage ? ` ${coverage.message}` : ""}`);
        const firstFailure = results.find((result) => !result.ok);
        setSelectionError(firstFailure && !firstFailure.ok ? firstFailure.error : "");
        router.refresh();
      } catch (uploadError) {
        if (uploadError instanceof DirectUploadCanceledError || controller.signal.aborted) {
          setOutcome("Import canceled. Documents that already finished remain preserved.");
          setSelectionError("");
          router.refresh();
        } else {
          setSelectionError(uploadError instanceof Error ? uploadError.message : "Document import failed.");
        }
      } finally {
        setPending(false);
        setProgress("");
        if (abortRef.current === controller) abortRef.current = null;
        activeBatchIdRef.current = null;
        cancelRequestedRef.current = false;
        setCanceling(false);
      }
    }}>
      <div>
        <p className="eyebrow">Receipt & Expense Intelligence</p>
        <h2>Drop it here. Ferocity will sort out what it is and where it belongs.</h2>
        <p className="muted">Photograph or upload receipts, statements, Cash App downloads, spreadsheets, or financial exports. Structured files are read directly instead of OCR.</p>
      </div>
      <div className="document-project-fields">
        <label>Upload batch label
          <input value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} maxLength={160} placeholder="Example: May 2025 Cash App statements" />
        </label>
        <label>Add this batch to an existing project
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); if (event.target.value) setNewProjectName(""); }}>
            <option value="">Keep this batch separate</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.taxYear ? ` (${project.taxYear})` : ""}</option>)}
          </select>
        </label>
        <label>Or create a new document project
          <input value={newProjectName} onChange={(event) => { setNewProjectName(event.target.value); if (event.target.value) setProjectId(""); }} maxLength={160} placeholder="Example: H4R 2025 taxes" />
        </label>
      </div>
      <label
        className={`document-dropzone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <FileUp size={28} />
        <strong>{fileNames.length ? `${fileNames.length} document${fileNames.length === 1 ? "" : "s"} ready` : "Drag documents here, take a photo, or choose files"}</strong>
        <span>{fileNames.length ? fileNames.slice(0, 4).join(", ") + (fileNames.length > 4 ? ` and ${fileNames.length - 4} more` : "") : "Images, PDF, CSV, XLSX, XML, OFX/QFX/QBO, or TXT · up to 15 MB each · 25 per batch"}</span>
        <input
          ref={inputRef}
          name="documents"
          type="file"
          accept="image/*,application/pdf,.csv,.tsv,.txt,.xlsx,.xml,.ofx,.qfx,.qbo"
          capture="environment"
          multiple
          required
          onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
        />
      </label>
      {selectionError ? <p className="notice danger" role="alert">{selectionError}</p> : null}
      {outcome ? <p className="notice success" role="status">{outcome}</p> : null}
      {progress ? <p className="muted" role="status">{progress}</p> : null}
      <div className="button-row">
        <button className="button" type="submit" disabled={pending || fileNames.length === 0}>
          {pending ? "Importing and analyzing…" : `Import and understand ${fileNames.length > 1 ? `${fileNames.length} documents` : "document"}`}
        </button>
        {pending ? <button className="button secondary" type="button" onClick={cancelPendingUpload} disabled={canceling}>
          {canceling ? "Canceling…" : "Cancel import"}
        </button> : null}
      </div>
    </form>
  );
}
