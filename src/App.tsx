import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { MenuBar } from './components/MenuBar';
import { Editor } from './components/Editor';
import { FindReplace } from './components/FindReplace';
import { StatusBar } from './components/StatusBar';
import { Settings } from './components/Settings';
import { useEditorStore } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useAutoSave } from './hooks/useAutoSave';
import { useWindowTitle } from './hooks/useWindowTitle';
import './App.css';

function App() {
  const loadSession = useEditorStore((s) => s.loadSession);

  useKeyboardShortcuts();
  useTheme();
  useAutoSave();
  useWindowTitle();

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <div className="app">
      <TabBar />
      <div className="workspace">
        <MenuBar />
        <FindReplace />
        <Editor />
        <StatusBar />
      </div>
      <Settings />
    </div>
  );
}

export default App;
