/**
 * Rewrites the release-pinned download links in README.md and the Homebrew
 * cask. Used by both `npm run release` (before a tag) and the CI release
 * workflow (after the artifacts exist), so the two can never drift apart.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Matches a pinned .dmg download URL, capturing the repo prefix so the owner
 * and repo never have to be hardcoded here.
 * NOTE: the arch group must allow `_` — the previous regex used
 * [a-zA-Z0-9.-]+, which silently never matched `NotepadMac_1.0.3_aarch64.dmg`
 * and left the README frozen on an old version.
 */
const DMG_URL = /(https:\/\/github\.com\/[^\s)]+?\/releases\/download\/)app-v[^/\s)]+(\/NotepadMac_)[^\s)]*?(_aarch64|_x64)(\.dmg)/g;

export function updateReadme(readme, { version, armUrl, intelUrl }) {
    return readme.replace(DMG_URL, (match, base, mid, arch, ext) => {
        // Prefer the real asset URL when CI hands us one; otherwise rebuild the
        // link from the version, which yields the same deterministic name.
        if (arch === '_aarch64' && armUrl) return armUrl;
        if (arch === '_x64' && intelUrl) return intelUrl;
        return `${base}app-v${version}${mid}${version}${arch}${ext}`;
    });
}

export function updateCask(cask, { version, armSha, intelSha }) {
    let next = cask.replace(/(version\s+")[^"]*(")/, `$1${version}$2`);
    // Scope each checksum to its own block instead of counting occurrences.
    if (intelSha) {
        next = next.replace(/(on_intel do[\s\S]*?sha256\s+")[^"]*(")/, `$1${intelSha}$2`);
    }
    if (armSha) {
        next = next.replace(/(on_arm do[\s\S]*?sha256\s+")[^"]*(")/, `$1${armSha}$2`);
    }
    return next;
}

export function syncFiles(opts) {
    const changed = [];

    const readmePath = path.join(rootDir, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf-8');
    const nextReadme = updateReadme(readme, opts);
    if (nextReadme !== readme) {
        fs.writeFileSync(readmePath, nextReadme);
        changed.push('README.md');
    }

    const caskPath = path.join(rootDir, 'Casks', 'notepadformac.rb');
    if (fs.existsSync(caskPath)) {
        const cask = fs.readFileSync(caskPath, 'utf-8');
        const nextCask = updateCask(cask, opts);
        if (nextCask !== cask) {
            fs.writeFileSync(caskPath, nextCask);
            changed.push('Casks/notepadformac.rb');
        }
    }

    return changed;
}

// CLI: node scripts/sync-release-links.js --version 1.0.5 [--arm-url ...] ...
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
    }
    if (!args.version) {
        console.error('Usage: node scripts/sync-release-links.js --version <x.y.z> [--arm-url U] [--intel-url U] [--arm-sha S] [--intel-sha S]');
        process.exit(1);
    }
    const changed = syncFiles({
        version: args.version,
        armUrl: args['arm-url'],
        intelUrl: args['intel-url'],
        armSha: args['arm-sha'],
        intelSha: args['intel-sha'],
    });
    console.log(changed.length ? `Updated: ${changed.join(', ')}` : 'Already up to date.');
}
