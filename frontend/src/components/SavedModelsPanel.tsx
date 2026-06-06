import { useEffect, useMemo, useState } from "react";
import type { CadObject } from "../utils/types";
import { loadAccountSavedLibrary, saveAccountSavedLibrary } from "../utils/api";
import {
  createSavedFolder,
  loadSavedLibrary,
  removeSavedModel,
  saveCurrentModelToLibrary,
  saveSavedLibrary,
  type SavedLibrary,
} from "../utils/savedModels";
import { getCadioAccount, getCadioAuthToken, type CadioAccount } from "../utils/auth";

function libraryHasContent(library: SavedLibrary) {
  return library.models.length > 0 || library.folders.length > 1;
}

function isValidLibrary(library: SavedLibrary | null | undefined): library is SavedLibrary {
  return Boolean(library && Array.isArray(library.folders) && Array.isArray(library.models));
}

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
  const [account, setAccount] = useState<CadioAccount | null>(() => getCadioAccount());
  const [authToken, setAuthToken] = useState(() => getCadioAuthToken());
  const [syncState, setSyncState] = useState<"idle" | "loading" | "syncing" | "synced" | "offline">("idle");
  const [remoteReady, setRemoteReady] = useState(false);
  const accountId = account?.accountId || "";
  const [library, setLibrary] = useState<SavedLibrary>(() => loadSavedLibrary(accountId));
  const [folderId, setFolderId] = useState(() => library.folders[0]?.id || "favorites");
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    saveSavedLibrary(library, accountId);
    if (!accountId || !authToken || !remoteReady) return;
    setSyncState("syncing");
    const timer = window.setTimeout(() => {
      saveAccountSavedLibrary(authToken, library)
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("offline"));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [accountId, authToken, library, remoteReady]);

  useEffect(() => {
    const syncAccount = () => {
      const nextAccount = getCadioAccount();
      const nextToken = getCadioAuthToken();
      setAccount(nextAccount);
      setAuthToken(nextToken);
      setRemoteReady(false);
      const nextLibrary = loadSavedLibrary(nextAccount?.accountId || "");
      setLibrary(nextLibrary);
      setFolderId(nextLibrary.folders[0]?.id || "favorites");
    };
    window.addEventListener("cadio-auth-changed", syncAccount);
    window.addEventListener("storage", syncAccount);
    return () => {
      window.removeEventListener("cadio-auth-changed", syncAccount);
      window.removeEventListener("storage", syncAccount);
    };
  }, []);

  useEffect(() => {
    if (!accountId || !authToken) {
      setRemoteReady(false);
      setSyncState("idle");
      return;
    }

    let cancelled = false;
    const localLibrary = loadSavedLibrary(accountId);
    setRemoteReady(false);
    setSyncState("loading");
    loadAccountSavedLibrary(authToken)
      .then((result) => {
        if (cancelled) return;
        const remoteLibrary = isValidLibrary(result.library) ? result.library : localLibrary;
        const shouldSeedRemote = libraryHasContent(localLibrary) && !libraryHasContent(remoteLibrary);
        const nextLibrary = shouldSeedRemote ? localLibrary : remoteLibrary;
        setLibrary(nextLibrary);
        setFolderId(nextLibrary.folders[0]?.id || "favorites");
        setRemoteReady(true);
        setSyncState(shouldSeedRemote ? "syncing" : "synced");
        if (shouldSeedRemote) {
          saveAccountSavedLibrary(authToken, nextLibrary)
            .then(() => {
              if (!cancelled) setSyncState("synced");
            })
            .catch(() => {
              if (!cancelled) setSyncState("offline");
            });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLibrary(localLibrary);
        setFolderId(localLibrary.folders[0]?.id || "favorites");
        setRemoteReady(false);
        setSyncState("offline");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, authToken]);

  const activeFolder = library.folders.find((folder) => folder.id === folderId) ?? library.folders[0];
  const visibleModels = useMemo(
    () => library.models.filter((model) => model.folderId === activeFolder?.id).slice(0, 8),
    [activeFolder?.id, library.models],
  );

  const addFolder = () => {
    if (!accountId) return;
    const next = createSavedFolder(library, folderName);
    const created = next.folders.find((folder) => folder.name.toLowerCase() === folderName.trim().toLowerCase());
    setLibrary(next);
    if (created) setFolderId(created.id);
    setFolderName("");
  };

  const saveCurrent = () => {
    if (!objects.length || !accountId) return;
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
            disabled={!objects.length || !accountId}
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
            disabled={!folderName.trim() || !accountId}
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
          {!accountId
            ? "Log in with email or phone to save private models."
            : syncState === "loading"
              ? "Loading this account's saved models..."
              : syncState === "syncing"
                ? "Syncing saved models..."
                : syncState === "offline"
                  ? `Local backup for ${account?.email || account?.phone || "this account"}. Cloud sync is offline.`
                  : `Cloud saved for ${account?.email || account?.phone || "this account"}.`}
        </p>
      </div>
    </details>
  );
}
