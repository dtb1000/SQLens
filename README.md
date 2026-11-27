# SQLens

**Watch your data transform.**

SQLens is a desktop SQL workbench that shows what a query does to your tables while you write it. It is made for people who find it hard to picture what their code is doing, including people with aphantasia.

![The SQLens window](docs/images/overview.png)

The app opens on a start page: connect to your own database, or open one of three example databases with ready-made queries, including `WITH` and views. It also has two tracks of lessons, beginner and intermediate, that teach SQL from the first `SELECT` to window functions and views, and check each answer against the example data. The window is laid out like RStudio. You write SQL in the Query area. The tables your query uses load live in the Tables area, up to 1000 rows, and light up as you type: the columns you pick, the rows your filter removes, and new columns you are building, already filled in. A Details view lists each column's type, size, whether it can be empty and its keys, and a map shows how the tables link, marking the one side and the many side of each link and saying what it means in plain words. When you run the query, the Output area shows the result and walks through how the database ran it, one stage at a time, with a plain explanation of each stage, including joins, groups, `WITH`, `UNION` and window functions.

It also suggests table and column names as you type, catches misspelt names, lays a query out neatly with one click, keeps a history of what you ran, exports results to CSV, Excel, JSON and more, and has settings for text size, high contrast, spacing and motion.

## Download

Windows: download `SQLens-Setup-<version>.exe` from the [Releases page](https://github.com/dtb1000/SQLens/releases) and double-click it. No terminal is needed. [INSTALL.md](INSTALL.md) has the full steps, including running from source and making the first installer for a new copy of the repository.

The full [user guide](docs/user-guide.md) covers everything else, and is also inside the app under **Documentation**. The SQL lessons are also written out in [the tutorials](docs/tutorials.md).

## Databases

| Database | Notes |
| --- | --- |
| SQLite | Three built-in example databases (company, school, library), or any `.sqlite` or `.db` file |
| PostgreSQL | Also Supabase, Neon, CockroachDB and other compatible servers |
| MySQL and MariaDB | The stages need MySQL 8 or MariaDB 10.2 or newer |
| SQL Server and Azure SQL | SQL Server 2016 or newer |
| Oracle | The stages need Oracle 18c or newer |

SQLite and PostgreSQL are tested end to end. MySQL, SQL Server and Oracle are supported but have had less testing.

## Run from source

You need Git and [Node.js](https://nodejs.org/) 20 or newer. Node 22 LTS is recommended.

```sh
git clone https://github.com/dtb1000/SQLens.git
cd SQLens
npm install
npm start
```

`npm run dist` builds an installer for the computer you run it on, into the `dist` folder.

If `npm start` says "Electron failed to install correctly", one of these is the cause:

1. **npm blocked Electron's download.** npm 12 and later block packages' install scripts until you approve them, and Electron uses its install script to download itself. `npm install` then ends with a warning that mentions `electron@... (postinstall: node install.js)`. Run `npm install-scripts approve electron`, then `npm rebuild electron`. The same warning mentions `oracledb`. The app uses its pure JavaScript mode, so that script is not needed.
2. **The download did not unpack.** On Node 26, Electron can download but stop unpacking after the first file, so `node_modules/electron/dist` holds only `LICENSES.chromium.html`. The easiest fix is to switch to Node 22 LTS, delete `node_modules` and run `npm install` again. Or unpack the downloaded file by hand. On Windows, in PowerShell from the `SQLens` folder:

   ```powershell
   cd node_modules\electron
   $zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*-win32-x64.zip" | Select-Object -First 1
   Expand-Archive $zip.FullName -DestinationPath dist -Force
   Set-Content path.txt "electron.exe" -NoNewline
   cd ..\..
   npm start
   ```

   On macOS the downloaded file is in `~/Library/Caches/electron`, and on Linux in `~/.cache/electron`. Unzip it into `node_modules/electron/dist` and write `Electron.app/Contents/MacOS/Electron` (macOS) or `electron` (Linux) into `node_modules/electron/path.txt`, with no newline at the end.

Running `node node_modules/electron/install.js` shows the real error if the download itself fails, for example because of a network block.

## Release a new version

1. Change `version` in `package.json` and merge it into `main`.
2. On GitHub, open **Actions > Build > Run workflow**, tick **Publish a release**, and run it.

The workflow builds the Windows installer and attaches it to a new release named after the version. Every pull request also builds the installer and keeps it for 14 days as a download on the workflow run, so a change can be tried before it is released.

## Project layout

```
src/main/            Electron main process
  main.js            the window, and the calls the window can make
  session.js         the open connection; runs one database call at a time
  drivers/           one file per database, all with the same small interface
  seed.js            the company example database
  samples.js         all three example databases (company, school, library)
src/renderer/        the window
  sql-parse.js       forgiving SQL tokenizer and parser that works on half-typed queries
  complete.js        suggestions under the cursor, including close misspellings
  format.js          lays a query out for reading
  export.js          CSV, Excel, JSON, Markdown, HTML and SQL files
  schema-map.js      the map of tables and the links between them
  lessons.js         the beginner and intermediate lessons, and how an answer is checked
  details.js         the Details view: column types, sizes, keys and links, in plain words
  dialects.js        the SQL that differs between databases
  adapter.js         the window's view of the database
  markdown.js        renders the documentation inside the app
  app.js             editor, live tables, result, and the stage engine
  fonts/             Inter and Courier Prime typefaces (SIL Open Font License)
docs/                user guide, tutorials and pictures
build/               app icon
test/                end-to-end test and the harness it shares with scripts/screenshots.js
```

To add another database, write a driver in `src/main/drivers/`, add it to `drivers/index.js`, and add its SQL differences to `src/renderer/dialects.js`.

## Tests

```sh
npx playwright install chromium   # once
npm test                          # SQLite sample
PG_URL=postgres://user:pass@localhost:5432/db npm test   # also PostgreSQL, creates the sample tables there
node scripts/screenshots.js       # redraw the pictures in docs/images
```

## Known gaps

Stages are not drawn yet for a window function in the same query as `GROUP BY`, or for a named `WINDOW` clause. These queries still run and show their result. SQL Server's `TOP` and Oracle's `FETCH FIRST` run correctly but have no stage of their own.
