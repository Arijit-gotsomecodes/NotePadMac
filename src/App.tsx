import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        const dirtyTabs = useEditorStore.getState().tabs.filter((t) => t.isDirty);
        if (dirtyTabs.length > 0) {
          const discard = await ask(
            `You have unsaved changes in "${dirtyTabs[0].title}". Close without saving?`,
            {
              title: "Notepad",
              kind: "warning",
            }
          );
          if (!discard) {
            event.preventDefault();
          }
        }
      })
      .then((u) => (unlisten = u))
      .catch((err) => console.error("Failed to install close guard:", err));
    return () => unlisten?.();
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
