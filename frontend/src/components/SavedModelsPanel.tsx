import { useEffect, useMemo, useState } from "react";
import type { CadObject } from "../utils/types";
import {
  createSavedFolder,
  loadSavedLibrary,
  removeSavedModel,
  saveCurrentModelToLibrary,
  saveSavedLibrary,
  type SavedLibrary,
} from "../utils/savedModels";

export default function SavedModelsPanel({
  title,
  prompt,
  sessionId,
  printer,
  objects,
  onOpenPrompt,
}: {
  title: string;
  prompt: string;
  sessionId: string;
  printer: string;
  objects: CadObject[];
  onOpenPrompt: (prompt: string) => void;
}) {
  const [library, setLibrary] = useState<SavedLibrary>(() => loadSavedLibrary());
  const [folderId, setFolderId] = useState(() => library.folders[0]?.id || "favorites");
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    saveSavedLibrary(library);
  }, [library]);

  const activeFolder = library.folders.find((folder) => folder.id === folderId) ?? library.folders[0];
  const visibleModels = useMemo(
    () => library.models.filter((model) => model.folderId === activeFolder?.id).slice(0, 8),
    [activeFolder?.id, library.models],
  );

  const addFolder = () => {
    const next = createSavedFolder(library, folderName);
    const created = next.folders.find((folder) => folder.name.toLowerCase() === folderName.trim().toLowerCase());
    setLibrary(next);
    if (created) setFolderId(created.id);
    setFolderName("");
  };

  const saveCurrent = () => {
    if (!objects.length) return;
    setLibrary((current) =>
      saveCurrentModelToLibrary({
        library: current,
        folderId: activeFolder?.id || current.folders[0]?.id || "favorites",
        title,
        prompt,
        sessionId,
        printer,
        objects,
      }),
    );
  };

  return (
    <details className="mb-5 rounded-xl border border-[#2d2d2f] bg-[#202020]" open>
      <summary className="cursor-pointer list-none px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#858585]">
        Saved models
      </summary>
      <div className="border-t border-[#303033] px-3 pb-3 pt-2">
        <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={activeFolder?.id || folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="h-9 min-w-0 rounded-lg border border-[#303033] bg-[#111827] px-2 text-xs text-white outline-none"
          >
            {library.folders.map((folder) => (
              <option value={folder.id} key={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            onClick={saveCurrent}
            disabled={!objects.length}
            className="h-9 rounded-lg border border-[#28c7df] bg-[#123038] px-3 text-xs font-semibold text-white disabled:opacity-35"
          >
            Save
          </button>
        </div>
        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addFolder();
            }}
            placeholder="New folder"
            className="h-8 rounded-lg border border-[#303033] bg-[#151515] px-2 text-xs text-white outline-none placeholder:text-[#696969]"
          />
          <button
            onClick={addFolder}
            disabled={!folderName.trim()}
            className="h-8 rounded-lg bg-[#2a2a2c] px-3 text-xs font-semibold text-[#d8d8d8] disabled:opacity-35"
          >
            Add
          </button>
        </div>
        <div className="space-y-1">
          {visibleModels.length ? (
            visibleModels.map((model) => (
              <div key={model.id} className="rounded-lg bg-[#171717] px-2 py-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => onOpenPrompt(model.prompt)}
                    className="min-w-0 text-left"
                    title="Rebuild saved model"
                  >
                    <div className="truncate text-xs font-semibold text-[#ededed]">{model.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-[#8f8f8f]">
                      {model.objectCount} parts{model.sourceTitle ? `, ${model.sourceTitle}` : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => setLibrary((current) => removeSavedModel(current, model.id))}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[#ff9f9f] hover:bg-[#2a1f1f]"
                    title="Remove saved model"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-[#171717] px-2 py-3 text-xs text-[#8f8f8f]">
              Save a model to keep it in this folder.
            </p>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#6f6f72]">
          Local library now. Ready for account sync when auth is connected.
        </p>
      </div>
    </details>
  );
}
