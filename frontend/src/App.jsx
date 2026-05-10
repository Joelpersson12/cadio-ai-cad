import { useEffect, useState } from "react";
import CadViewport from "./components/CadViewport";
import {
  API_BASE,
  exportUrl,
  generate,
  getMesh,
  listPrinters,
  toggleFeature,
  updateParameters
} from "./api";

const FRONTEND_CACHE_VERSION = "cad-frontend-v2";
const SESSION_KEY = "cad_session_id";
const VERSION_KEY = "cad_frontend_version";

function NumberInput({ label, value, onChange, step = 1, min = 0 }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) || "");
  const [prompt, setPrompt] = useState("Create a phone stand");
  const [status, setStatus] = useState("Ready");
  const [modelData, setModelData] = useState(null);
  const [printers, setPrinters] = useState({});
  const [selectedPrinter, setSelectedPrinter] = useState("adventurer_3");

  useEffect(() => {
    console.log("NEW CAD FRONTEND ACTIVE");
    console.log("CAD API BASE:", API_BASE);
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== FRONTEND_CACHE_VERSION) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.setItem(VERSION_KEY, FRONTEND_CACHE_VERSION);
      setSessionId("");
      setModelData(null);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    listPrinters()
      .then((data) => setPrinters(data.printers || {}))
      .catch(() => {});
  }, []);

  async function runPrompt() {
    try {
      setStatus("Applying AI command...");
      const data = await generate({
        session_id: sessionId || undefined,
        prompt,
        printer: selectedPrinter,
        fit: true
      });
      setSessionId(data.session_id);
      setModelData(data);
      const meshData = await getMesh(data.session_id);
      setModelData(meshData);
      setStatus(`Updated v${data.version}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function refreshMesh() {
    if (!sessionId) {
      return;
    }
    try {
      const data = await getMesh(sessionId);
      setModelData(data);
      setStatus(`Synced v${data.version}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function patchParam(key, value) {
    if (!sessionId) {
      return;
    }
    const base = modelData?.parameters || {};
    try {
      const data = await updateParameters({
        session_id: sessionId,
        parameters: { ...base, [key]: value }
      });
      setModelData(data.mesh ? data : await getMesh(sessionId));
      setStatus(`Param updated: ${key}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onToggleFeature(featureId, enabled) {
    if (!sessionId) {
      return;
    }
    try {
      const data = await toggleFeature({
        session_id: sessionId,
        feature_id: featureId,
        enabled
      });
      setModelData(data.mesh ? data : await getMesh(sessionId));
      setStatus(`Feature ${featureId} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  const params = modelData?.parameters || {};
  const features = modelData?.feature_tree || [];
  const bounds = modelData?.bounds || {};
  const meshData = modelData?.mesh || null;
  const exportStl = sessionId ? exportUrl(sessionId, "stl") : "#";
  const canExport = Boolean(sessionId);
  const exportObj = sessionId ? exportUrl(sessionId, "obj") : "#";
  const exportStep = sessionId ? exportUrl(sessionId, "step") : "#";

  return (
    <div className="app">
      <aside className="panel left">
        <h2>AI Copilot</h2>
        <p className="muted">Session: {sessionId || "not started"}</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Try: make thicker, add holes, fillet edges, mirror geometry, resize 90 80 140"
        />
        <button onClick={runPrompt}>Apply AI Command</button>
        <button onClick={refreshMesh} className="secondary">
          Refresh Model
        </button>
        <div className="status">{status}</div>
      </aside>

      <main className="viewport-wrap">
        <CadViewport meshData={meshData} />
      </main>

      <aside className="panel right">
        <h2>Parameters</h2>
        <label className="field">
          <span>Printer</span>
          <select value={selectedPrinter} onChange={(e) => setSelectedPrinter(e.target.value)}>
            {Object.keys(printers).map((key) => (
              <option value={key} key={key}>
                {printers[key].name}
              </option>
            ))}
          </select>
        </label>
        <NumberInput label="Width" value={params.width} onChange={(v) => patchParam("width", v)} />
        <NumberInput label="Depth" value={params.depth} onChange={(v) => patchParam("depth", v)} />
        <NumberInput label="Height" value={params.height} onChange={(v) => patchParam("height", v)} />
        <NumberInput label="Thickness" value={params.thickness} onChange={(v) => patchParam("thickness", v)} />
        <NumberInput label="Angle" value={params.angle} onChange={(v) => patchParam("angle", v)} />
        <NumberInput label="Fillet" value={params.fillet_radius} onChange={(v) => patchParam("fillet_radius", v)} step={0.5} />
        <NumberInput label="Hole Count" value={params.hole_count} onChange={(v) => patchParam("hole_count", v)} />
        <NumberInput label="Hole Diameter" value={params.hole_diameter} onChange={(v) => patchParam("hole_diameter", v)} step={0.5} />

        <h3>Feature Tree</h3>
        <div className="feature-list">
          {features.map((f) => (
            <label key={f.id} className="feature-item">
              <input
                type="checkbox"
                checked={Boolean(f.enabled)}
                onChange={(e) => onToggleFeature(f.id, e.target.checked)}
              />
              <span>{f.type}</span>
            </label>
          ))}
        </div>

        <h3>Model Metadata</h3>
        <p className="muted">Version: {modelData?.version ?? 0}</p>
        <p className="muted">Bounds: {bounds.x?.toFixed?.(1) || 0} x {bounds.y?.toFixed?.(1) || 0} x {bounds.z?.toFixed?.(1) || 0} mm</p>
        <p className="muted">Printability: {modelData?.printability_score ?? 0}</p>

        <h3>Export</h3>
        <div className="exports">
          <a href={exportStl} aria-disabled={!canExport}>STL</a>
          <a href={exportObj} aria-disabled={!canExport}>OBJ</a>
          <a href={exportStep} aria-disabled={!canExport}>STEP</a>
        </div>
      </aside>
    </div>
  );
}
