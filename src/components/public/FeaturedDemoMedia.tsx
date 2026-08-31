import Image from "next/image";
import { getFeaturedDemo, normalizeDemoEmbedUrl } from "@/lib/public-site/featured-demo";

type Props = {
  priority?: boolean;
  fallbackAlt: string;
};

export async function FeaturedDemoMedia({ priority = false, fallbackAlt }: Props) {
  const demo = await getFeaturedDemo();
  const mediaUrl = demo.enabled ? normalizeDemoEmbedUrl(demo.sourceType, demo.mediaUrl) : null;

  if (!mediaUrl) {
    return (
      <Image
        className="walkthrough-animation"
        src="/ferocity-demo-walkthrough.svg"
        alt={fallbackAlt}
        width={1280}
        height={720}
        priority={priority}
      />
    );
  }

  if (demo.sourceType === "direct_video") {
    return (
      <figure className="featured-demo-media">
        <video
          className="walkthrough-animation"
          controls
          playsInline
          preload="metadata"
          poster={demo.posterUrl || undefined}
          aria-label="Ferocity product demonstration"
        >
          <source src={mediaUrl} />
          Your browser does not support this video. Open the full product demo instead.
        </video>
        <figcaption><strong>Made with Ferocity.</strong> Concept, script, shot plan, and production workflow created in Ferocity; final rendering completed through a connected video provider.</figcaption>
      </figure>
    );
  }

  return (
    <figure className="featured-demo-media">
      <iframe
        className="walkthrough-animation"
        src={mediaUrl}
        title="Ferocity product demonstration"
        loading={priority ? "eager" : "lazy"}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <figcaption><strong>Made with Ferocity.</strong> Concept, script, shot plan, and production workflow created in Ferocity; final rendering completed through a connected video provider.</figcaption>
    </figure>
  );
}
