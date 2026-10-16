# Versioning and releases

How Bio Tree apps are versioned, released and rolled back. This app (the Production Scheduler) follows it from **v1.0.0 (14/10/2026)**, and every new Bio Tree app should follow it too. The last section lists what to set up in a new app.

## Why

- Everyone can tell which version they are on, and what changed in it.
- A problem report can say "since v1.2.0", so it can be traced to the change that caused it.
- Any release can be rolled back to the one before it.

## Version numbers: MAJOR.MINOR.PATCH

Versions follow [Semantic Versioning](https://semver.org): three numbers, e.g. `1.4.2`.

| Part | Goes up when | Examples | Resets |
|---|---|---|---|
| **MAJOR** | People must work differently, or existing records change meaning | A new approval step everyone must follow; moving to several units | MINOR and PATCH to 0 (`1.4.2` → `2.0.0`) |
| **MINOR** | Something new is added and nothing existing breaks | A new tab, report, field or filter | PATCH to 0 (`1.4.2` → `1.5.0`) |
| **PATCH** | A fix or small tweak | A wrong label, a save bug, date format | Nothing (`1.4.2` → `1.4.3`) |

Rules:
- **1.0.0 is the first live version**, the day real records start. Versions below 1.0.0 (`0.x`) are for building and testing before go-live only.
- A released version never changes. A fix after release is a new version.
- When unsure between two levels, pick the higher one.

## Where the version lives

| Place | What it holds |
|---|---|
| `package.json`, `"version"` | The current version. It must match the newest release in `CHANGELOG.md` (a test checks this). |
| `CHANGELOG.md` | Release notes, newest first, in [Keep a Changelog](https://keepachangelog.com) format. The app's **What's new** tab shows them. |
| Git tag `vX.Y.Z` | The exact code of each release, on `main`. |
| GitHub Release `vX.Y.Z` | The tag plus its release notes, on GitHub. |
| In the app | The version at the bottom of the side menu; clicking it opens **What's new**. |

## Day to day

1. Every change is made on its own branch and merged into `main` through a pull request.
2. A change people will notice adds a line under `## [Unreleased]` in `CHANGELOG.md`, under **Added**, **Changed**, **Fixed** or **Removed**.
3. Write each line for the people who use the app: what they can now do, or what works differently. Not how it was coded.
   - Good: "Orders can be filtered by expected delivery month."
   - Not useful: "Refactored OrdersTable filter state."

## Writing a CHANGELOG entry

Every entry has the same shape, so the **What's new** tab can show it as a table and anyone can follow it.

### Format

```markdown
## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD
One-line summary of the release (optional).

### Added
- **Screen or feature** what people can now do, in one or two sentences.

### Changed
- **Screen or feature** what now works differently. What happens to existing records.

### Fixed
- **Screen or feature** what was wrong and now works.

### Removed
- **Screen or feature** what is gone, and what to use instead.
```

### Rules

- **Version heading:** `## [X.Y.Z] - YYYY-MM-DD`, with the version in square brackets and the date as year-month-day. What's new shows the date as DD/MM/YYYY.
- **Keep `## [Unreleased]` at the top**, empty after a release, ready for the next change.
- **Types:** only **Added**, **Changed**, **Fixed** and **Removed**, in that order, and only the ones the release has. In What's new each type gets its own colour: Added green, Changed blue, Fixed amber, Removed red.
- **One line per change**, starting with `- `. Open with the screen or feature people know, in bold (`**New orders**`, `**Job order planning**`, `**What's new**`). Then say in plain words what they can now do, or what works differently.
- **Say what happens to existing records** when a change could affect them ("Existing orders keep theirs.").
- **Give an example** when the reason isn't obvious ("for example an accounting-only customer").
- **No code words:** no file, function, column or branch names, and no pull request numbers. Those belong in the pull request.

### Example: v1.1.1

```markdown
## [1.1.1] - 2026-10-14

### Changed
- **New orders** no longer offer customers and products switched off for production in Master Data (for example an accounting-only customer). Existing orders keep theirs.
```

It opens with the feature in bold ("New orders"), says what changed in plain words, gives an example, and says what happens to existing records.

### Before releasing

- Read every line under Unreleased as a staff member would, and fix anything unclear.
- Check every change in the release, including ones from other people or sessions, for anything it relies on that isn't live yet, such as another app's database change. In v1.1.1, the Master Data switch wasn't live yet, so the scheduler was made to work without it until it is.
- All tests pass on `main`. One test checks that `package.json`'s version matches the newest release here.

## Releasing a version

1. Choose the number from the table above, based on what is under Unreleased.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` above it. A one-line summary under the version heading is optional.
3. Set `"version"` in `package.json` to `X.Y.Z`.
4. Merge that through a pull request into `main`.
5. Tag and publish it from `main`: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`, then `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <that version's notes> --latest`. The notes are that version's section of `CHANGELOG.md`, word for word.
6. Deploy the tag (below).
7. Tell staff it is out. The **What's new** tab has the notes to share.

### Pace

- **MINOR and MAJOR** releases go out on a planned day (for example weekly, or when the owner approves a batch), so staff are not surprised mid-shift.
- **PATCH** releases go out as soon as a fix is ready.

## Deploying and rolling back (this app)

Deploy a release (on the Mac mini, in `~/Planning-Scheduling-App`):

```bash
git checkout vX.Y.Z
npm run db:backup
npm ci
npm run db:migrate
npm run build
pm2 restart bio-tree-scheduler
```

Afterwards, return the folder to `main` with `git checkout main`. The running site keeps serving the built release.

Roll back: deploy the previous tag the same way. If that release changed the database, restore the backup taken before it (`npm run db:restore`). That also undoes any records saved since the backup, so check with the owner first.

## Using this in a new Bio Tree app

1. Start at `0.1.0` while building. Release `1.0.0` on go-live day.
2. Copy this file and change the app name, deploy and rollback commands.
3. Add `CHANGELOG.md` with an `## [Unreleased]` section.
4. Show the version in the app, and a **What's new** page that reads `CHANGELOG.md`.
5. Add a test that `package.json`'s version matches the newest release in `CHANGELOG.md`.
6. Tag and publish every release as above.
7. Follow [bio-tree-ui-ux-handoff.md](bio-tree-ui-ux-handoff.md) for the look and the interaction patterns (type scale, lists, view tabs, pop-up windows, printing and Excel).
