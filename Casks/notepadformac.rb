cask "notepadformac" do
  version "2.0.1"

on_intel do
    sha256 "06fbdcecffdf533333981a9416f6c9c1af56046ddcc0e60a88b94cc78d0924a5"
    url "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac/releases/download/app-v#{version}/NotepadMac_#{version}_x64.dmg"
  end
  on_arm do
    sha256 "cf5c84650b9fa3d54f9bf3bd74295e02926f522485ef1b27c4129b0c44f77004"
    url "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac/releases/download/app-v#{version}/NotepadMac_#{version}_aarch64.dmg"
  end

  name "NotepadMac"
  desc "A modern, fast, and lightweight Notepad for macOS"
  homepage "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac"

  app "NotepadMac.app"

  zap trash: [
    "~/Library/Application Support/com.arijit-deb.notepadmac",
    "~/Library/Caches/com.arijit-deb.notepadmac",
    "~/Library/Preferences/com.arijit-deb.notepadmac.plist",
    "~/Library/Saved Application State/com.arijit-deb.notepadmac.savedState",
  ]
end
