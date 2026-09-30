// npm run commit-version
// Commit everything (message vX.Y.Z from package.json), create an annotated tag – the editor
// opens for the tag text, which also becomes the release description – and push both.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;

const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const quiet = (...args) => {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (quiet('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)) {
  console.error(`Tag ${tag} already exists – bump the version in package.json first.`);
  process.exit(1);
}

try {
  git('add', '.');
  if (quiet('diff', '--cached', '--quiet'))
    console.log('Nothing to commit – the tag goes on the last commit.');
  else git('commit', '-m', tag);

  git('tag', '-a', tag, '-e', '-m', tag); // -e: editor with "vX.Y.Z" as the template
  git('push', 'origin', 'HEAD');
  git('push', 'origin', tag);
  console.log(`\n${tag} is pushed – the GitHub Action now builds the release.`);
} catch {
  process.exit(1); // git has already printed the cause
}
