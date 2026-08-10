"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type InspectionState = "waiting" | "inspecting" | "complete" | "manual" | "failed";

function waitFor(video: HTMLVideoElement, event: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video inspection timed out."));
    }, 15_000);
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("The source footage could not be loaded for inspection."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

async function captureFrame(video: HTMLVideoElement, atPercent: number) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = Math.max(0, Math.min(duration - 0.05, duration * atPercent));
  await waitFor(video, "seeked");
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot inspect video frames.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { atPercent, imageDataUrl: canvas.toDataURL("image/jpeg", 0.72) };
}

export function VideoQualityController({
  videoJobId,
  sourceUrl,
  shouldInspect,
  initialStatus,
  initialScore
}: {
  videoJobId: string;
  sourceUrl: string;
  shouldInspect: boolean;
  initialStatus: string;
  initialScore: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedRef = useRef(false);
  const router = useRouter();
  const [state, setState] = useState<InspectionState>(
    initialStatus === "complete" ? "complete" : initialStatus === "unavailable" ? "manual" : "waiting"
  );
  const [message, setMessage] = useState(
    initialStatus === "complete"
      ? `Ferocity inspected this source${initialScore === null ? "." : ` and scored it ${initialScore}/100.`}`
      : "Ferocity will inspect representative frames before treating this as a finished ad."
  );

  useEffect(() => {
    if (!shouldInspect || startedRef.current) return;
    startedRef.current = true;
    const video = videoRef.current;
    if (!video) return;

    const inspect = async () => {
      setState("inspecting");
      setMessage("Ferocity is checking the source footage for artifacts, readability, composition, and claim risk.");
      try {
        if (!video.duration || !Number.isFinite(video.duration)) {
          await waitFor(video, "loadedmetadata");
        }
        const frames = [];
        for (const atPercent of [0.15, 0.5, 0.85]) {
          frames.push(await captureFrame(video, atPercent));
        }
        video.currentTime = 0;
        const response = await fetch(`/api/video/${videoJobId}/quality`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frames })
        });
        const result = await response.json() as {
          ok?: boolean;
          error?: string;
          qualityReview?: { status?: string; score?: number; note?: string; decision?: string };
        };
        if (!response.ok || !result.ok) throw new Error(result.error || "Video inspection did not finish.");
        const review = result.qualityReview;
        if (review?.status === "unavailable") {
          setState("manual");
          setMessage(review.note || "Automated inspection was unavailable, so Ferocity kept the publish gate closed.");
        } else {
          setState("complete");
          setMessage(review?.note || `Inspection complete${typeof review?.score === "number" ? `: ${review.score}/100` : ""}.`);
        }
        router.refresh();
      } catch (error) {
        setState("failed");
        setMessage(error instanceof Error ? error.message : "Video inspection needs attention.");
      }
    };

    void inspect();
  }, [router, shouldInspect, videoJobId]);

  return (
    <div className="form-stack">
      <video ref={videoRef} controls playsInline preload="metadata" src={sourceUrl} style={{ width: "100%", borderRadius: 12 }}>
        Your browser does not support video playback.
      </video>
      <div className="notice-card" aria-live="polite">
        <div>
          <strong>{state === "complete" ? "Quality inspection complete" : state === "inspecting" ? "Inspecting source footage" : state === "manual" ? "Human review still required" : state === "failed" ? "Inspection needs attention" : "Quality inspection queued"}</strong>
          <p className="muted">{message}</p>
        </div>
        <span className={`pill ${state === "failed" || state === "manual" ? "medium" : ""}`}>{state}</span>
      </div>
    </div>
  );
}
