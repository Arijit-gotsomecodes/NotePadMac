import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { syncFiles } from './sync-release-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(version)) {
    console.error('Please provide a valid semver version (e.g., 2.0.0).');
    console.log('Usage: npm run release <version>');
    process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
const capture = (cmd) => execSync(cmd, { cwd: rootDir, encoding: 'utf-8' }).trim();

try {
    // Refuse to run on a dirty tree: the release commit must contain the version
    // bump and nothing else, or the tag ends up pointing at unrelated work.
    if (capture('git status --porcelain')) {
        console.error('❌ Working tree is not clean. Commit or stash your changes first.');
        process.exit(1);
    }

    if (capture(`git tag --list app-v${version}`)) {
        console.error(`❌ Tag app-v${version} already exists.`);
        process.exit(1);
    }

    console.log(`Bumping version to ${version}...`);

    // 1. package.json
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('✅ Updated package.json (this is what Settings displays)');

    // 2. tauri.conf.json
    const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    tauriConf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log('✅ Updated tauri.conf.json');

    // 3. Cargo.toml — the first `version = "..."` is the [package] one.
    const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
    cargoToml = cargoToml.replace(/version\s*=\s*"[^"]+"/, `version = "${version}"`);
    fs.writeFileSync(cargoTomlPath, cargoToml);
    console.log('✅ Updated Cargo.toml');

    // 4. README + cask. CI rewrites these again after the build with the real
    //    asset URLs and checksums; this keeps main coherent in the meantime.
    const changed = syncFiles({ version });
    console.log(changed.length ? `✅ Updated ${changed.join(', ')}` : 'ℹ️  Download links already current');

    // 5. Commit, tag, push. The tag is what starts the release workflow.
    run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml README.md Casks/notepadformac.rb');
    run(`git commit -m "chore(release): v${version}"`);
    run(`git tag app-v${version}`);
    run('git push origin main');
    run(`git push origin app-v${version}`);

    console.log(`\n🎉 Tagged app-v${version} and pushed.`);
    console.log('CI will now build both architectures, publish the release once');
    console.log('both installers are attached, then update the README and cask.');
} catch (error) {
    console.error('\n❌ Release process failed:');
    console.error(error.message ?? error);
    process.exit(1);
}
