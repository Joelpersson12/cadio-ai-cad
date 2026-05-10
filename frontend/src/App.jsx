import { useEffect, useState } from "react";
import CadViewport from "./components/CadViewport";
import {
  API_BASE,
  exportUrl,
  generate,
  getMesh,
  listPrinters,
  toggleFeature,
  updateParameters,
  selectObject,
  deleteObject,
  updateObjectTransform
} from "./api";

const FRONTEND_CACHE_VERSION = "cad-frontend-v3";
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
  const [transformMode, setTransformMode] = useState("translate");

  useEffect(() => {
    console.log("NEW CAD FRONTEND ACTIVE");
    console.log("CAD API BASE:", API_BASE);
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== FRONTEND_CACHE_VERSION) {
      localStorage.setItem(VERSION_KEY, FRONTEND_CACHE_VERSION);
      if (!sessionId) {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    listPrinters().then((data) => setPrinters(data.printers || {})).catch(() => {});
  }, []);

  async function syncMesh(targetSessionId = sessionId) {
    if (!targetSessionId) return;
    console.log("mesh fetch started");
    const data = await getMesh(targetSessionId);
    setModelData(data);
    console.log("viewport updated successfully");
  }

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
      await syncMesh(data.session_id);
      setStatus(`Updated v${data.version}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function patchParam(key, value) {
    if (!sessionId || !selectedObject) return;
    const base = selectedObject.parameters || {};
    try {
      await updateParameters({
        session_id: sessionId,
        object_id: selectedObject.id,
        parameters: { ...base, [key]: value }
      });
      await syncMesh(sessionId);
      setStatus(`Param updated: ${key}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onToggleFeature(featureId, enabled) {
    if (!sessionId || !selectedObject) return;
    try {
      await toggleFeature({
        session_id: sessionId,
        object_id: selectedObject.id,
        feature_id: featureId,
        enabled
      });
      await syncMesh(sessionId);
      setStatus(`Feature ${featureId} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onSelectObject(objectId) {
    if (!sessionId) return;
    try {
      await selectObject({ session_id: sessionId, object_id: objectId });
      await syncMesh(sessionId);
      setStatus("Object selected");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onDeleteObject() {
    if (!sessionId || !selectedObject) return;
    try {
      await deleteObject({ session_id: sessionId, object_id: selectedObject.id });
      await syncMesh(sessionId);
      setStatus("Object deleted");
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function onTransformCommit(objectId, transform) {
    if (!sessionId) return;
    try {
      await updateObjectTransform({
        session_id: sessionId,
        object_id: objectId,
        ...transform
      });
      await syncMesh(sessionId);
      setStatus("Transform saved");
    } catch (err) {
      setStatus(err.message);
    }
  }

  const objects = modelData?.objects || [];
  const selectedObjectId = modelData?.selected_object_id;
  const selectedObject = objects.find((o) => o.id === selectedObjectId) || null;
  const params = selectedObject?.parameters || {};
  const features = selectedObject?.feature_tree || [];
  const bounds = modelData?.bounds || {};
  const exportStl = sessionId ? exportUrl(sessionId, "stl") : "#";
  const exportObj = sessionId ? exportUrl(sessionId, "obj") : "#";
  const exportStep = sessionId ? exportUrl(sessionId, "step") : "#";
  const canExport = Boolean(sessionId);
  const printAssistant = modelData?.print_assistant || { warnings: [], checks: [], hints: [] };

  return (
    <div className="app">
      <aside className="panel left">
        <h2>AI Copilot</h2>
        <p className="muted">Session: {sessionId || "not started"}</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Try: add object, duplicate this part, move object left, rotate 90 degrees, fillet edges"
        />
        <button onClick={runPrompt}>Apply AI Command</button>
        <button onClick={() => syncMesh()} className="secondary">Refresh Model</button>
        <div className="status">{status}</div>
      </aside>

      <main className="viewport-wrap">
        <CadViewport
          objects={objects}
          selectedObjectId={selectedObjectId}
          onSelectObject={onSelectObject}
          transformMode={transformMode}
          onTransformCommit={onTransformCommit}
        />
      </main>

      <aside className="panel right">
        <h2>Object Hierarchy</h2>
        <div className="feature-list">
          {objects.map((o) => (
            <button
              key={o.id}
              className={o.id === selectedObjectId ? "" : "secondary"}
              onClick={() => onSelectObject(o.id)}
            >
              {o.name}
            </button>
          ))}
        </div>

        <h3>Transform Tools</h3>
        <div className="exports">
          <button onClick={() => setTransformMode("translate")}>Move</button>
          <button onClick={() => setTransformMode("rotate")}>Rotate</button>
          <button onClick={() => setTransformMode("scale")}>Scale</button>
        </div>
        <button className="secondary" onClick={onDeleteObject}>Delete Selected</button>

        <h3>Parameters</h3>
        <label className="field">
          <span>Printer</span>
          <select value={selectedPrinter} onChange={(e) => setSelectedPrinter(e.target.value)}>
            {Object.keys(printers).map((key) => (
              <option value={key} key={key}>{printers[key].name}</option>
            ))}
          </select>
        </label>
        <NumberInput label="Width" value={params.width} onChange={(v) => patchParam("width", v)} />
        <NumberInput label="Depth" value={params.depth} onChange={(v) => patchParam("depth", v)} />
        <NumberInput label="Height" value={params.height} onChange={(v) => patchParam("height", v)} />
        <NumberInput label="Thickness" value={params.thickness} onChange={(v) => patchParam("thickness", v)} />
        <NumberInput label="Fillet Radius" value={params.fillet_radius} onChange={(v) => patchParam("fillet_radius", v)} step={0.5} />
        <NumberInput label="Hole Count" value={params.hole_count} onChange={(v) => patchParam("hole_count", v)} />
        <NumberInput label="Wall Thickness" value={params.wall_thickness} onChange={(v) => patchParam("wall_thickness", v)} step={0.2} />

        <h3>Feature Tree</h3>
        <div className="feature-list">
          {features.map((f) => (
            <label key={f.id} className="feature-item">
              <input type="checkbox" checked={Boolean(f.enabled)} onChange={(e) => onToggleFeature(f.id, e.target.checked)} />
              <span>{f.type}</span>
            </label>
          ))}
        </div>

        <h3>Print Assistant</h3>
        {printAssistant.warnings.map((w) => <p key={w} className="muted">⚠ {w}</p>)}
        {printAssistant.checks.map((c) => <p key={c} className="muted">✔ {c}</p>)}
        {printAssistant.hints.map((h) => <p key={h} className="muted">{h}</p>)}
        <p className="muted">Score: {modelData?.printability_score ?? 0}</p>

        <h3>Scene</h3>
        <p className="muted">Objects: {objects.length}</p>
        <p className="muted">Bounds: {bounds.x?.toFixed?.(1) || 0} x {bounds.y?.toFixed?.(1) || 0} x {bounds.z?.toFixed?.(1) || 0} mm</p>

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
