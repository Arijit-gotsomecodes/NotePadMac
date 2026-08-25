import React, { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { saveTab, openFilePath } from './hooks/useFileOperations';
import { TabBar } from './components/TabBar';
import { MenuBar } from './components/MenuBar';
import { Editor } from './components/Editor';
import { FindReplace } from './components/FindReplace';
import { StatusBar } from './components/StatusBar';
import { Settings } from './components/Settings';
import { Tab, useEditorStore } from './stores/editorStore';
import { useSettingsStore } from './stores/settingsStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import './App.css';

function GhostTabPreview() {
  const [title, setTitle] = React.useState('Untitled');
  const [width, setWidth] = React.useState<number>(175);
  const [animKey, setAnimKey] = React.useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenShow: (() => void) | undefined;
    let unlistenWidth: (() => void) | undefined;

    listen<string>('update-ghost-title', (e) => {
      if (e.payload) setTitle(e.payload);
    }).then((u) => { unlisten = u; });

    listen<number>('update-ghost-width', (e) => {
      if (e.payload) setWidth(e.payload);
    }).then((u) => { unlistenWidth = u; });

    // Re-trigger pop-in animation each time ghost is shown again
    listen('ghost-show', () => {
      setAnimKey((k) => k + 1);
    }).then((u) => { unlistenShow = u; });

    emit('ghost-ready', {});

    return () => {
      unlisten?.();
      unlistenShow?.();
      unlistenWidth?.();
    };
  }, []);

  return (
    <div className="ghost-tab-container">
      <div
        className="ghost-tab-pill"
        key={animKey}
        style={{ width: `${width}px` }}
      >
        <span className="ghost-tab-title">{title}</span>
        <span className="ghost-tab-close">×</span>
      </div>
    </div>
  );
}

function App() {
  const isGhost = typeof window !== 'undefined' && window.location.search.includes('ghost=true');
  useKeyboardShortcuts();
  useTheme();

  if (isGhost) {
    return <GhostTabPreview />;
  }

  // Handle files opened via double-click / "Open With" / CLI / drag-and-drop / Detach Tab / Merge Windows
  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenMergeReq: (() => void) | undefined;
    let unlistenMergeRes: (() => void) | undefined;

    invoke<string | null>('get_window_tab')
      .then((tabJson) => {
        if (tabJson) {
          try {
            const tab = JSON.parse(tabJson);
            useEditorStore.getState().initDetachedTab(tab);
          } catch (e) {
            console.error('Failed to parse detached tab data:', e);
          }
        } else {
          invoke<string | null>('get_cli_file')
            .then((path) => {
              if (path) {
                openFilePath(path);
              }
            })
            .catch(console.error);
        }
      })
      .catch(console.error)
      .finally(() => {
        // Show the window now that the DOM and tab content are fully mounted and painted
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            getCurrentWindow().show().catch(() => {});
          });
        });
      });

    listen<string>('open-file-path', (event) => {
      if (event.payload) {
        openFilePath(event.payload);
      }
    })
      .then((u) => {
        unlistenOpen = u;
      })
      .catch(console.error);

    listen<{ targetWindow: string }>('request-merge-tabs', async (event) => {
      const myLabel = getCurrentWindow().label;
      if (event.payload.targetWindow !== myLabel) {
        const myTabs = useEditorStore.getState().tabs;
        await emit('provide-merge-tabs', {
          targetWindow: event.payload.targetWindow,
          tabs: myTabs,
        });
        // Native fade-out animation then window close
        await invoke('fade_close_window');
      }
    })
      .then((u) => {
        unlistenMergeReq = u;
      })
      .catch(console.error);

    listen<{ targetWindow: string; tabs: Tab[] }>('provide-merge-tabs', (event) => {
      const myLabel = getCurrentWindow().label;
      if (event.payload.targetWindow === myLabel && event.payload.tabs) {
        useEditorStore.getState().addMultipleTabs(event.payload.tabs);
      }
    })
      .then((u) => {
        unlistenMergeRes = u;
      })
      .catch(console.error);

    return () => {
      unlistenOpen?.();
      unlistenMergeReq?.();
      unlistenMergeRes?.();
    };
  }, []);

  // Install close guard EXACTLY ONCE on mount.
  // Important: always call event.preventDefault() first (async early-return is
  // unreliable in Tauri v2), then manually call destroy() when ready to close.
  useEffect(() => {
    let isClosing = false;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      const u = await getCurrentWindow().onCloseRequested(async (event) => {
        // Always prevent default — we'll call destroy() manually when ready
        event.preventDefault();

        // Guard against duplicate firings (e.g. two listeners registered)
        if (isClosing) return;
        isClosing = true;

        try {
          const dirtyTabs = useEditorStore.getState().tabs.filter((t) => t.isDirty);
          const { reduceMotion } = useSettingsStore.getState();
          const closeCmd = reduceMotion ? 'exit_app' : 'fade_close_window';

          if (dirtyTabs.length === 0) {
            // No unsaved changes -> exit window
            await invoke(closeCmd);
            return;
          }

          // Prompt for each unsaved tab sequentially
          for (const tab of dirtyTabs) {
            const action = await invoke<string>('prompt_save_dialog', {
              documentName: tab.title || 'Untitled',
            });

            if (action === 'save') {
              const ok = await saveTab(tab.id);
              if (!ok) {
                // User cancelled the save-file dialog -> abort closing
                isClosing = false;
                return;
              }
            } else if (action === 'cancel') {
              // User pressed Cancel -> keep window open
              isClosing = false;
              return;
            }
            // 'dont_save' -> continue to next dirty tab
          }

          // All dirty tabs resolved -> exit window
          await invoke(closeCmd);
        } catch (err) {
          console.error('Close guard error:', err);
          isClosing = false;
        }
      });

      if (cancelled) {
        // Component unmounted before setup finished — clean up immediately
        u();
      } else {
        unlisten = u;
      }
    };

    setup().catch((err) => console.error('Failed to install close guard:', err));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="app">
      <TabBar />
      <MenuBar />
      <FindReplace />
      <Editor />
      <StatusBar />
      <Settings />
    </div>
  );
}

export default App;
