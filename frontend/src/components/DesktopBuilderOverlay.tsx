import { useEffect, useState } from "react";
import { generate as apiGenerate } from "../utils/api";
import { useCadStore } from "../stores/cadStore";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

type AttachedImage = {
  name: string;
  type: string;
  previewUrl: string;
  maskDataUrl: string;
};

function isBuilderRoute() {
  return window.location.hash.startsWith("#builder");
}

function collapseBuilderPanels() {
  if (!isBuilderRoute() || window.innerWidth < 768) return;
  const titles = [
    "Collapse workspace panel",
    "Collapse AI panel",
    "Collapse parameters panel",
  ];
  for (const title of titles) {
    const button = document.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
    button?.click();
  }
}

export default function DesktopBuilderOverlay() {
  const [visible, setVisible] = useState(isBuilderRoute());
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachment, setAttachment] = useState<AttachedImage | null>(null);
  const [error, setError] = useState("");
  const {
    runPrompt,
    isBusy,
    selectedObjectId,
    onDeleteObject,
    sessionId,
    printer,
    applyScenePayload,
  } = useCadStore();
  const busy = sending || isBusy;

  useEffect(() => {
    const sync = () => {
      const active = isBuilderRoute();
      setVisible(active);
      if (active) {
        window.setTimeout(collapseBuilderPanels, 80);
        window.setTimeout(collapseBuilderPanels, 350);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const send = async () => {
    const text = prompt.trim();
    if ((!text && !attachment) || busy) return;
    setSending(true);
    setError("");
    try {
      if (attachment) {
        const data = await apiGenerate({
          session_id: sessionId || undefined,
          prompt: text || "Turn this image into a printable 3D model.",
          image: attachment.maskDataUrl,
          imageName: attachment.name,
          imageType: attachment.type,
          mode: text ? "hybrid" : "image",
          printer,
          fit: true,
        } as Parameters<typeof apiGenerate>[0] & {
          image: string;
          imageName: string;
          imageType: string;
          mode: "image" | "hybrid";
        });
        applyScenePayload(data);
        setAttachment(null);
      } else {
        await runPrompt(text);
      }
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image to 3D failed. Try a simpler logo or silhouette.");
    } finally {
      setSending(false);
    }
  };

  const attachFile = async (file: File | undefined) => {
    setMenuOpen(false);
    setError("");
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large. Max file size is 5 MB.");
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Unsupported file type. Use PNG, JPG, JPEG, WEBP or SVG.");
      return;
    }
    try {
      setAttachment(await imageFileToMask(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not detect a clean shape in this image.");
    }
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {selectedObjectId && (
        <button
          type="button"
          onClick={() => void onDeleteObject()}
          className="pointer-events-auto absolute left-1/2 top-4 h-9 -translate-x-1/2 rounded-lg border border-[#5a2f33] bg-[#2b1f20]/95 px-4 text-xs font-semibold text-[#ff9a9a] shadow-xl backdrop-blur hover:border-[#ff8b8b] hover:text-white"
          title="Delete selected model"
        >
          Delete selected
        </button>
      )}
      <div className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 right-24 w-auto md:left-1/2 md:right-auto md:w-[min(560px,calc(100%-22rem))] md:-translate-x-1/2">
        {(attachment || error) && (
          <div className="mb-2 rounded-xl border border-[#333] bg-[#151515]/95 p-2 text-xs text-white shadow-xl backdrop-blur">
            {attachment && (
              <div className="flex items-center gap-3">
                <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded-lg bg-white object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{attachment.name}</div>
                  <div className="text-[#9ca3af]">Image to 3D · best for logos, icons, silhouettes and simple 2D shapes.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="h-8 rounded-lg border border-[#333] px-3 font-semibold text-[#cfcfcf] hover:text-white"
                >
                  Remove
                </button>
              </div>
            )}
            {error && <div className="mt-1 text-[#ffb4b4]">{error}</div>}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-[#333] bg-[#151515]/95 p-1.5 shadow-2xl backdrop-blur">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="grid h-11 w-11 place-items-center rounded-xl border border-[#343436] bg-[#202020] text-xl font-semibold text-[#d1d5db] hover:border-[#28c7df] hover:text-white"
              title="Attach image"
            >
              +
            </button>
            {menuOpen && (
              <div className="absolute bottom-14 left-0 w-64 rounded-xl border border-[#333] bg-[#181819] p-2 text-sm text-white shadow-2xl">
                <label className="block cursor-pointer rounded-lg px-3 py-2 hover:bg-[#2a2a2c]">
                  Upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(event) => void attachFile(event.target.files?.[0])}
                  />
                </label>
                <label className="block cursor-pointer rounded-lg px-3 py-2 hover:bg-[#2a2a2c] md:hidden">
                  Take photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => void attachFile(event.target.files?.[0])}
                  />
                </label>
                <div className="border-t border-[#333] px-3 py-2 text-[11px] leading-4 text-[#9ca3af]">
                  Upload a logo, icon or silhouette to turn it into a printable 3D model.
                  <span className="mt-1 block text-[#c9a46a]">
                    Do not upload copyrighted logos unless you have permission.
                  </span>
                </div>
              </div>
            )}
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void send();
            }}
            placeholder={attachment ? "Make this logo 5 mm thick, keychain, 120 mm wide..." : "Ask AI to create or change the model..."}
            className="min-h-11 flex-1 rounded-xl border border-[#343436] bg-[#111827] px-4 py-2 text-base text-white outline-none placeholder:text-[#858585] focus:border-[#28c7df]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || (!prompt.trim() && !attachment)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#28c7df] text-base font-black text-[#081225] shadow-[0_0_18px_rgba(40,199,223,0.22)] disabled:opacity-40"
            title="Send prompt"
          >
            {busy ? "..." : ">"}
          </button>
        </div>
      </div>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load this image. Try another PNG, JPG, WEBP or SVG."));
    image.src = src;
  });
}

async function imageFileToMask(file: File): Promise<AttachedImage> {
  const previewUrl = await readAsDataUrl(file);
  const image = await loadImage(previewUrl);
  const maxSize = 128;
  const scale = Math.min(maxSize / Math.max(image.width, image.height), 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Image processing is not supported in this browser.");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const pixels = extractForegroundMask(rgba, width, height);
  const active = pixels.reduce((sum, value) => sum + value, 0);
  if (active < 4) {
    throw new Error("We could not detect a clean shape in this image. Try a simpler logo or higher contrast image.");
  }
  const json = JSON.stringify({ width, height, pixels });
  const maskDataUrl = `data:application/x-cadio-mask+json;base64,${btoa(json)}`;
  return { name: file.name, type: file.type, previewUrl, maskDataUrl };
}

function extractForegroundMask(rgba: Uint8ClampedArray, width: number, height: number): number[] {
  const border: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      border.push((y * width + x) * 4);
    }
  }
  const transparentBorder = border.filter((index) => rgba[index + 3] < 32).length / Math.max(border.length, 1);
  if (transparentBorder > 0.18) {
    return buildCandidate(rgba, (index) => rgba[index + 3] > 32);
  }

  const opaqueBorder = border.filter((index) => rgba[index + 3] > 32);
  const bg = opaqueBorder.reduce(
    (acc, index) => {
      acc.r += rgba[index];
      acc.g += rgba[index + 1];
      acc.b += rgba[index + 2];
      return acc;
    },
    { r: 0, g: 0, b: 0 },
  );
  const count = Math.max(opaqueBorder.length, 1);
  bg.r /= count;
  bg.g /= count;
  bg.b /= count;
  const bgLuma = luma(bg.r, bg.g, bg.b);

  const candidates = [
    buildCandidate(rgba, (index) => colorDistance(rgba[index], rgba[index + 1], rgba[index + 2], bg.r, bg.g, bg.b) > 34),
    buildCandidate(rgba, (index) => (bgLuma < 128 ? lumaAt(rgba, index) > bgLuma + 38 : lumaAt(rgba, index) < bgLuma - 38)),
    buildCandidate(rgba, (index) => lumaAt(rgba, index) < 210),
  ];
  const viable = candidates
    .map((pixels) => ({ pixels, ratio: activeRatio(pixels) }))
    .filter(({ ratio }) => ratio > 0.0025 && ratio < 0.62)
    .sort((a, b) => a.ratio - b.ratio);
  return viable[0]?.pixels || candidates[0];
}

function buildCandidate(rgba: Uint8ClampedArray, isForeground: (index: number) => boolean): number[] {
  const pixels: number[] = [];
  for (let index = 0; index < rgba.length; index += 4) {
    pixels.push(rgba[index + 3] > 32 && isForeground(index) ? 1 : 0);
  }
  return pixels;
}

function activeRatio(pixels: number[]) {
  return pixels.reduce((sum, value) => sum + value, 0) / Math.max(pixels.length, 1);
}

function lumaAt(rgba: Uint8ClampedArray, index: number) {
  return luma(rgba[index], rgba[index + 1], rgba[index + 2]);
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
