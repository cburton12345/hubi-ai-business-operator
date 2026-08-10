"use client";

import { useEffect, useRef, useState } from "react";

type Deliverable = { label: string; aspectRatio: string; use: string };
type FinishedAsset = Deliverable & { url: string; extension: string; mimeType: string };
type FinishedOutput = FinishedAsset & { blob: Blob };

function dimensions(aspectRatio: string) {
  if (aspectRatio === "9:16") return { width: 720, height: 1280 };
  if (aspectRatio === "1:1") return { width: 720, height: 720 };
  if (aspectRatio === "4:5") return { width: 720, height: 900 };
  return { width: 1280, height: 720 };
}

function drawCover(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawContained(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  context.save();
  context.globalAlpha = 0.35;
  drawCover(context, video, width, height);
  context.restore();
  context.fillStyle = "rgba(3, 7, 18, .48)";
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawOverlay(context: CanvasRenderingContext2D, input: {
  width: number;
  height: number;
  currentTime: number;
  duration: number;
  brandName: string;
  domain: string;
  goal: string;
  service: string;
  cta: string;
  captions: string[];
}) {
  const { width, height } = input;
  const progress = input.duration > 0 ? input.currentTime / input.duration : 0;
  const margin = Math.round(width * 0.055);
  const small = Math.max(22, Math.round(width * 0.027));
  const large = Math.max(32, Math.round(width * 0.052));
  const captionIndex = Math.min(input.captions.length - 1, Math.floor(progress * input.captions.length));
  const message = input.captions[captionIndex] || (progress < 0.3 ? input.goal : progress < 0.72 ? input.service : input.cta);
  context.textBaseline = "top";
  context.font = `700 ${small}px Arial, sans-serif`;
  context.fillStyle = "rgba(3, 7, 18, .78)";
  const brandWidth = Math.min(width - margin * 2, context.measureText(input.brandName).width + 36);
  context.fillRect(margin, margin, brandWidth, small + 24);
  context.fillStyle = "#ffffff";
  context.fillText(input.brandName, margin + 18, margin + 12);

  context.font = `800 ${large}px Arial, sans-serif`;
  const lines = wrapText(context, message, width - margin * 2.6);
  const lineHeight = Math.round(large * 1.08);
  const boxHeight = lines.length * lineHeight + 42;
  const boxY = height - boxHeight - margin * 1.8;
  context.fillStyle = "rgba(3, 7, 18, .82)";
  context.fillRect(margin, boxY, width - margin * 2, boxHeight);
  context.fillStyle = "#ffffff";
  lines.forEach((line, index) => context.fillText(line, margin * 1.25, boxY + 20 + index * lineHeight));
  context.font = `600 ${Math.max(18, Math.round(small * 0.78))}px Arial, sans-serif`;
  context.fillStyle = "#a7f3d0";
  context.fillText(input.domain, margin * 1.25, height - margin * 0.95);
}

function recorderType() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

async function finishOne(sourceUrl: string, deliverable: Deliverable, overlays: Omit<Parameters<typeof drawOverlay>[1], "width" | "height" | "currentTime" | "duration">) {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("The source could not be loaded for finishing.")), { once: true });
  });
  const { width, height } = dimensions(deliverable.aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot finish video locally.");
  const canvasStream = canvas.captureStream(30);
  const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const sourceStream = captureVideo.captureStream?.() ?? captureVideo.mozCaptureStream?.();
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...(sourceStream?.getAudioTracks() ?? [])]);
  const mimeType = recorderType();
  const recorder = new MediaRecorder(combined, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" })), { once: true });
    recorder.addEventListener("error", () => reject(new Error("The local finishing pass failed.")), { once: true });
  });
  const paint = () => {
    drawContained(context, video, width, height);
    drawOverlay(context, { ...overlays, width, height, currentTime: video.currentTime, duration: video.duration });
    if (!video.ended) requestAnimationFrame(paint);
  };
  recorder.start(1000);
  await video.play();
  paint();
  await new Promise<void>((resolve) => video.addEventListener("ended", () => resolve(), { once: true }));
  recorder.stop();
  const blob = await finished;
  sourceStream?.getTracks().forEach((track) => track.stop());
  canvasStream.getTracks().forEach((track) => track.stop());
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  return { ...deliverable, blob, url: URL.createObjectURL(blob), extension, mimeType: blob.type } satisfies FinishedOutput;
}

export function VideoFinishExporter({ videoJobId, sourceUrl, brandName, domain, goal, service, cta, voiceover, deliverables, existingAssets }: {
  videoJobId: string;
  sourceUrl: string;
  brandName: string;
  domain: string;
  goal: string;
  service: string;
  cta: string;
  voiceover: string;
  deliverables: Deliverable[];
  existingAssets: FinishedAsset[];
}) {
  const started = useRef(false);
  const localUrls = useRef<string[]>([]);
  const [assets, setAssets] = useState<FinishedAsset[]>(existingAssets);
  const [status, setStatus] = useState("Preparing finished channel cuts without another premium generation…");

  useEffect(() => {
    if (started.current || !deliverables.length) return;
    started.current = true;
    let active = true;
    const run = async () => {
      const next: FinishedAsset[] = [...existingAssets];
      let persistenceFailed = false;
      const captions = voiceover.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
      try {
        const remaining = deliverables.filter((deliverable) => !next.some((asset) => asset.aspectRatio === deliverable.aspectRatio));
        if (!remaining.length) {
          setStatus("Finished cuts are stored and ready. No additional premium video generation was used.");
          return;
        }
        for (const deliverable of remaining) {
          if (!active) return;
          setStatus(`Finishing ${deliverable.label}…`);
          const output = await finishOne(sourceUrl, deliverable, { brandName, domain, goal, service, cta, captions });
          localUrls.current.push(output.url);
          const form = new FormData();
          form.set("file", output.blob, `finished-${deliverable.aspectRatio.replace(":", "x")}.${output.extension}`);
          form.set("aspectRatio", deliverable.aspectRatio);
          form.set("label", deliverable.label);
          const upload = await fetch(`/api/video/${videoJobId}/finished`, { method: "POST", body: form });
          const result = await upload.json() as { ok?: boolean; asset?: { url?: string; mimeType?: string }; error?: string };
          if (upload.ok && result.ok && result.asset?.url) {
            URL.revokeObjectURL(output.url);
            localUrls.current = localUrls.current.filter((url) => url !== output.url);
            next.push({ ...deliverable, url: result.asset.url, mimeType: result.asset.mimeType || output.mimeType, extension: (result.asset.mimeType || output.mimeType).includes("mp4") ? "mp4" : "webm" });
          } else {
            persistenceFailed = true;
            next.push(output);
            setStatus(`${result.error || "Private storage was unavailable."} The finished cut is still available to download from this page.`);
          }
          setAssets([...next]);
        }
        setStatus(persistenceFailed
          ? "Finished cuts are ready on this page, but at least one must be downloaded now because private storage was unavailable. No additional premium generation was used."
          : "Finished cuts are stored and ready. No additional premium video generation was used.");
      } catch (error) {
        setStatus(error instanceof Error ? `${error.message} The approved source remains available.` : "Local finishing needs attention.");
      }
    };
    void run();
    return () => {
      active = false;
      localUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
    // The inputs identify one immutable production pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="form-stack">
      <div className="notice-card"><div><strong>Ferocity finishing</strong><p className="muted">{status}</p></div><span className="pill">no new render</span></div>
      <div className="button-row">
        {assets.map((asset) => (
          <a className="button secondary-button" download={`${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${asset.aspectRatio.replace(":", "x")}.${asset.extension}`} href={asset.url} key={asset.aspectRatio}>
            Download {asset.aspectRatio}
          </a>
        ))}
      </div>
      {assets.some((asset) => asset.extension !== "mp4") ? <p className="muted">This browser produced WebM files. They are finished, playable cuts, but Ferocity will keep the publish gate closed for destinations that require MP4 conversion.</p> : null}
    </div>
  );
}
