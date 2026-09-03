cask "notepadformac" do
  version "2.0.0"

on_intel do
    sha256 "4ed0987cd53f57875f3697c4e0340ed9fdefdb219d946155618ce5e563fb280a"
    url "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac/releases/download/app-v#{version}/NotepadMac_#{version}_x64.dmg"
  end
  on_arm do
    sha256 "3642cc41741c15f567c204c7132df450537061b93ebab88ceb637083f7350b40"
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
