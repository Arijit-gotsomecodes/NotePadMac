import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { saveTab, openFilePath } from './hooks/useFileOperations';
import { TabBar } from './components/TabBar';
import { MenuBar } from './components/MenuBar';
import { Editor } from './components/Editor';
import { FindReplace } from './components/FindReplace';
import { StatusBar } from './components/StatusBar';
import { Settings } from './components/Settings';
import { useEditorStore } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  useKeyboardShortcuts();
  useTheme();

  // Handle files opened via double-click / "Open With" / CLI / drag-and-drop
  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;

    invoke<string | null>('get_cli_file')
      .then((path) => {
        if (path) {
          openFilePath(path);
        }
      })
      .catch(console.error);

    listen<string>('open-file-path', (event) => {
      if (event.payload) {
        openFilePath(event.payload);
      }
    })
      .then((u) => {
        unlistenOpen = u;
      })
      .catch(console.error);

    return () => {
      unlistenOpen?.();
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

          if (dirtyTabs.length === 0) {
            // No unsaved changes -> close immediately
            await invoke('exit_app');
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

          // All dirty tabs resolved -> exit the app
          await invoke('exit_app');
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
