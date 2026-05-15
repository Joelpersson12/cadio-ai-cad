/** AI command panel - left sidebar for CAD generation controls. */

import { useState, useRef } from "react";
import { healthCheck, generate, type GenerateResponse, type GenerateMode } from "../utils/api";

// Printer definitions with build volumes (in mm)
const PRINTERS = {
  "flashforge_adventurer_3": {
    name: "Flashforge Adventurer 3",
    volume: { x: 150, y: 150, z: 150 },
  },
  "ender_3": {
    name: "Ender 3",
    volume: { x: 220, y: 220, z: 250 },
  },
  "prusa_mk3s": {
    name: "Prusa MK3S",
    volume: { x: 250, y: 210, z: 210 },
  },
  "bambu_a1": {
    name: "Bambu A1",
    volume: { x: 256, y: 256, z: 256 },
  },
} as const;

type PrinterKey = keyof typeof PRINTERS;

interface AiPanelProps {
  onApiResponse: (response: GenerateResponse | { error: string } | { status: string; message?: string }) => void;
  onMeshGenerated: (response: GenerateResponse) => void;
}

export default function AiPanel({ onApiResponse, onMeshGenerated }: AiPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<GenerateMode>("text");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [printer, setPrinter] = useState<PrinterKey>("flashforge_adventurer_3");
  const [fitToPrinter, setFitToPrinter] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"healthy" | "unhealthy" | "error" | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedPrinter = PRINTERS[printer];

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64 = result.split(",")[1];
      setImageData(base64);
      // Auto-switch to image or hybrid mode
      if (mode === "text" && prompt.trim()) {
        setMode("hybrid");
      } else if (mode === "text") {
        setMode("image");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const clearImage = () => {
    setImageData(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (mode === "image" || mode === "hybrid") {
      setMode("text");
    }
  };

  const handleGenerate = async () => {
    // Validate inputs based on mode
    if (mode === "text" && !prompt.trim()) return;
    if (mode === "image" && !imageData) return;
    if (mode === "hybrid" && !prompt.trim() && !imageData) return;
    if (isLoading) return;
    
    setIsLoading(true);
    setStatus("Generating model...");
    try {
      const response = await generate({
        prompt: prompt.trim(),
        image: imageData || undefined,
        mode,
        printer,
        fit: fitToPrinter,
      });
      onApiResponse(response);
      onMeshGenerated(response);
      setStatus(response.scaled ? "Model generated (scaled to fit)" : "Model generated");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      onApiResponse({ error: errorMessage });
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setIsLoading(true);
    setHealthStatus(null);
    setStatus("Checking health...");
    try {
      const response = await healthCheck();
      onApiResponse(response);
      setHealthStatus(response.status === "ok" ? "healthy" : "unhealthy");
      setStatus("Backend is healthy");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      onApiResponse({ error: errorMessage });
      setHealthStatus("error");
      setStatus(`Health check failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const canGenerate = () => {
    if (isLoading) return false;
    if (mode === "text") return !!prompt.trim();
    if (mode === "image") return !!imageData;
    if (mode === "hybrid") return !!prompt.trim() || !!imageData;
    return false;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Controls</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure and generate 3D models
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col gap-5 overflow-y-auto">
        {/* Mode Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Generation Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["text", "image", "hybrid"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "hybrid" ? "Hybrid" : `${m} → CAD`}
              </button>
            ))}
          </div>
        </div>

        {/* Text Input (shown for text and hybrid modes) */}
        {(mode === "text" || mode === "hybrid") && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {mode === "hybrid" ? "Text Instructions (Optional)" : "CAD Prompt"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "hybrid" 
                ? "Add text instructions to enhance the image..." 
                : "Create a phone stand with rounded edges..."
              }
              className="w-full min-h-[100px] rounded-lg border border-border bg-input text-foreground p-4 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
          </div>
        )}

        {/* Image Input (shown for image and hybrid modes) */}
        {(mode === "image" || mode === "hybrid") && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Reference Image
            </label>
            
            {/* Image Preview */}
            {imagePreview ? (
              <div className="relative rounded-lg border border-border overflow-hidden">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-32 object-cover"
                />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 text-foreground flex items-center justify-center hover:bg-background transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Take Photo Button */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border bg-muted/50 hover:bg-muted hover:border-primary/50 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                  <span className="text-xs text-muted-foreground">Take Photo</span>
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Upload Image Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border bg-muted/50 hover:bg-muted hover:border-primary/50 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  <span className="text-xs text-muted-foreground">Upload Image</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Supports PNG, JPG, WEBP. Use camera for broken parts or real objects.
            </p>
          </div>
        )}

        {/* Printer Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Printer
          </label>
          <select
            value={printer}
            onChange={(e) => setPrinter(e.target.value as PrinterKey)}
            className="w-full rounded-lg border border-border bg-input text-foreground p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all appearance-none cursor-pointer"
          >
            {Object.entries(PRINTERS).map(([key, { name, volume }]) => (
              <option key={key} value={key}>
                {name} ({volume.x}x{volume.y}x{volume.z})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Build volume: {selectedPrinter.volume.x} x {selectedPrinter.volume.y} x {selectedPrinter.volume.z} mm
          </p>
        </div>

        {/* Fit to Printer Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">
              Fit to printer volume
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Auto-scale model to fit build plate
            </p>
          </div>
          <button
            onClick={() => setFitToPrinter(!fitToPrinter)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              fitToPrinter ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                fitToPrinter ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate()}
            className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Model
              </>
            )}
          </button>

          <button
            onClick={() => void handleHealthCheck()}
            disabled={isLoading}
            className="w-full rounded-lg bg-secondary text-secondary-foreground py-3 font-medium text-sm hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Health Check
            {healthStatus && (
              <span className={`ml-1 w-2 h-2 rounded-full ${
                healthStatus === "healthy" ? "bg-green-500" : "bg-red-500"
              }`} />
            )}
          </button>
        </div>

        {/* Quick Commands (only for text mode) */}
        {mode === "text" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick Prompts
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                "phone stand",
                "box with lid",
                "cable holder",
                "wall hook",
                "bracket",
                "gear",
              ].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setPrompt(cmd)}
                  className="px-3 py-1.5 rounded-md text-xs bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors capitalize"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="mt-auto pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Status: <span className="text-foreground">{status}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
