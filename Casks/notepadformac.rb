cask "notepadformac" do
  version "2.0.2"

on_intel do
    sha256 "6324a771adef51ae1bf229e191a6181e0b7efa8be235f08e807688e7b0a3a61b"
    url "https://github.com/Arijit-gotsomecodes/NotepadMac---Windows-Notepad-For-Mac/releases/download/app-v#{version}/NotepadMac_#{version}_x64.dmg"
  end
  on_arm do
    sha256 "9081f4767dc396f71ccd5e2819d7a7ce42ef35bee7a7e98708814a6bbbde6259"
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
