cask "notepadformac" do
  version "2.0.1"

on_intel do
    sha256 "8f2b14f6ac6ffc70799b118a6cecbf01b05b04ce86c8838831d736c96838afd4"
    url "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac/releases/download/app-v#{version}/NotepadMac_#{version}_x64.dmg"
  end
  on_arm do
    sha256 "213ffd6133ef373ee8dd97892d2b788828a53738f024a81ea6e595463c083c35"
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
