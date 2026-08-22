import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useFileOperations } from './hooks/useFileOperations';
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
  const loadSession = useEditorStore((s) => s.loadSession);

  useKeyboardShortcuts();
  useTheme();

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const { handleSave } = useFileOperations();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        const dirtyTabs = useEditorStore.getState().tabs.filter((t) => t.isDirty);
        if (dirtyTabs.length > 0) {
          event.preventDefault();
          const tab = dirtyTabs[0];
          const action = await invoke<string>('prompt_save_dialog', {
            documentName: tab.title || 'Untitled',
          });

          if (action === 'save') {
            const success = await handleSave(tab.id);
            if (success) {
              const remainingDirty = useEditorStore.getState().tabs.filter((t) => t.isDirty);
              if (remainingDirty.length === 0) {
                await getCurrentWindow().destroy();
              }
            }
          } else if (action === 'dont_save') {
            await getCurrentWindow().destroy();
          }
          // 'cancel' stays open
        }
      })
      .then((u) => (unlisten = u))
      .catch((err) => console.error("Failed to install close guard:", err));
    return () => unlisten?.();
  }, [handleSave]);

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
